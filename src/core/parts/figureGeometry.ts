import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COLORS } from '../colors'
import { SKIN_HEX, canonicalFig, figKey } from '../figures'
import { printUv } from '../prints'
import type { FigStyle } from '../types'
import { platesToWorld } from '../units'
import { getPart } from './catalog'

/**
 * Low-poly minifigure geometry, built per style: legs, hips, a trapezoid torso, arms with hands,
 * a cylinder head and the hat / hair, plus the held accessory. Same frame as every part: centred on
 * the origin, 2 studs along X, 1 along Z, the minifig part's height along Y, facing +Z (the front).
 *
 * Unlike bricks, a figure has many colours, so the body carries them per vertex (linear `color`)
 * and renders with the vertex-colour material whatever the brick colour. The face and torso print
 * come from the shared print atlas (see core/prints) in a second geometry, like a printed tile.
 */

export interface FigureGeometry {
  /** `position`, `normal`, `color` (linear), non-indexed. */
  body: THREE.BufferGeometry
  /** Face (+ torso print): `position`, `normal`, atlas `uv`, non-indexed. */
  print: THREE.BufferGeometry
}

const H = platesToWorld(getPart('minifig').h)

// Heights from the feet (y = 0) up; shifted to the centred frame at the end.
const LEG_TOP = 1.2
const HIP_TOP = 1.5
const TORSO_TOP = 2.8
const TORSO_BOTTOM_HALF = 0.78
const TORSO_TOP_HALF = 0.54
const TORSO_HALF_DEPTH = 0.34
const NECK_TOP = 2.9
const HEAD_BOTTOM = 2.88
const HEAD_TOP = 3.78
const HEAD_R = 0.42
/** Lathe segments for heads and hats; the face strip follows the head's facets (2 per 30 degrees). */
const ROUND = 24

/** Where the face picture goes on the head (heights from the feet). Hats keep clear of its top. */
export const FIG_FACE_BAND = { y0: 2.96, y1: 3.66 } as const
const PRINT_LIFT = 0.004

const BLACK = COLORS[1].hex
const GOLD = '#E8B83A'
const METAL_GRAY = COLORS[7].hex
const LENS = '#FFF4B0'

interface Piece {
  g: THREE.BufferGeometry
  hex: string
}

const box = (sx: number, sy: number, sz: number, cx: number, cy: number, cz: number) =>
  new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz)

const cyl = (r: number, h: number, cx: number, cy: number, cz: number, seg = 12) =>
  new THREE.CylinderGeometry(r, r, h, seg).translate(cx, cy, cz)

const ellipsoid = (rx: number, ry: number, rz: number, cx: number, cy: number, cz: number) =>
  new THREE.SphereGeometry(1, 12, 8).scale(rx, ry, rz).translate(cx, cy, cz)

/** Closed solid of revolution; `profile` is [radius, y] from the bottom axis point to the top one. */
const lathe = (profile: Array<[number, number]>) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), ROUND)

/** A dome: straight side of radius `r` from `y0` up to `y1`, then a rounded top reaching `top`. */
function dome(r: number, y0: number, y1: number, top: number): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [[0, y0], [r, y0], [r, y1]]
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * (Math.PI / 2)
    profile.push([r * Math.cos(a), y1 + (top - y1) * Math.sin(a)])
  }
  profile.push([0, top])
  return lathe(profile)
}

/**
 * Part of a cylinder (with its pie-slice caps) around Y from angle `from` over `length`; angle 0
 * points to +Z (the face), PI / 2 to +X. Used for hair and helmet shells that leave the face open.
 */
const shell = (r: number, y0: number, y1: number, from: number, length: number) =>
  new THREE.CylinderGeometry(r, r, y1 - y0, ROUND, 1, false, from, length).translate(0, (y0 + y1) / 2, 0)

/** Half disc reaching forward (+Z) to `reach`, e.g. a cap's visor: a thin flat brim at height `y`. */
const visor = (r: number, reach: number, y: number, t = 0.04) =>
  new THREE.CylinderGeometry(r, r, t, ROUND, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, reach / r).translate(0, y, 0)

/** The torso: a prism whose front and back are trapezoids (wide at the hips, narrow at the shoulders). */
function torso(): THREE.BufferGeometry {
  const b = TORSO_BOTTOM_HALF, t = TORSO_TOP_HALF, d = TORSO_HALF_DEPTH
  // 0-3 bottom (y = HIP_TOP), 4-7 top; each ring: (-x,-z) (+x,-z) (+x,+z) (-x,+z).
  const v = [
    [-b, HIP_TOP, -d], [b, HIP_TOP, -d], [b, HIP_TOP, d], [-b, HIP_TOP, d],
    [-t, TORSO_TOP, -d], [t, TORSO_TOP, -d], [t, TORSO_TOP, d], [-t, TORSO_TOP, d],
  ]
  // Outward, counter-clockwise quads.
  const quads = [
    [3, 2, 6, 7], // front +Z
    [1, 0, 4, 5], // back -Z
    [2, 1, 5, 6], // right +X
    [0, 3, 7, 4], // left -X
    [7, 6, 5, 4], // top
    [0, 1, 2, 3], // bottom
  ]
  const pos: number[] = []
  for (const [a, b2, c, e] of quads) for (const i of [a, b2, c, a, c, e]) pos.push(...v[i])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Half-width of the torso at height `y` (from the feet). */
const torsoHalf = (y: number) => TORSO_BOTTOM_HALF + ((TORSO_TOP_HALF - TORSO_BOTTOM_HALF) * (y - HIP_TOP)) / (TORSO_TOP - HIP_TOP)

const HAND_Y = 1.66
const HAND_Z = 0.28
/** The right hand (-X), which holds the accessory. */
const HAND_X = -0.8

/** One arm (`side` +1 = +X, the figure's left; -1 = -X, its right) ending in a yellow hand. */
function arm(side: number, armHex: string): Piece[] {
  const s = side
  return [
    { g: ellipsoid(0.17, 0.17, 0.17, s * 0.6, 2.6, 0), hex: armHex },
    { g: box(0.26, 0.72, 0.32, 0, 0, 0).rotateZ(s * 0.14).translate(s * 0.7, 2.3, 0), hex: armHex },
    { g: box(0.24, 0.24, 0.4, 0, 0, 0).rotateX(0.35).translate(s * 0.76, 1.9, 0.08), hex: armHex },
    { g: cyl(0.08, 0.1, 0, 0, 0, 8).translate(s * 0.79, 1.8, 0.26), hex: SKIN_HEX },
    { g: cyl(0.12, 0.2, 0, 0, 0).translate(s * 0.8, HAND_Y, HAND_Z), hex: SKIN_HEX },
  ]
}

function hat(kind: Required<FigStyle>['hat'], hex: string): Piece[] {
  const p = (g: THREE.BufferGeometry, color = hex): Piece => ({ g, hex: color })
  // Back of a hairpiece: covers the sides and the back, leaves the face open.
  const back = (r: number, y0: number, open: number) => shell(r, y0, 3.62, open, 2 * Math.PI - 2 * open)
  switch (kind) {
    case 'none':
      return [p(cyl(0.22, 0.12, 0, HEAD_TOP + 0.06, 0), SKIN_HEX)] // the head's stud
    case 'hair_short':
      return [p(dome(0.465, 3.62, 3.76, 4.02)), p(back(0.47, 3.2, Math.PI / 2 + 0.25))]
    case 'hair_long':
      return [p(dome(0.47, 3.62, 3.76, 4.04)), p(back(0.48, 2.78, Math.PI / 2 - 0.15))]
    case 'hair_ponytail':
      return [
        p(dome(0.465, 3.62, 3.76, 4.02)),
        p(back(0.47, 3.2, Math.PI / 2 + 0.25)),
        p(ellipsoid(0.13, 0.28, 0.08, 0, 3.22, -0.42)),
      ]
    case 'cap':
      return [p(dome(0.46, 3.6, 3.7, 4.02)), p(visor(0.42, 0.49, 3.62)), p(cyl(0.06, 0.04, 0, 4.03, 0, 8))]
    case 'police':
      return [
        p(cyl(0.45, 0.16, 0, 3.64, 0, ROUND), BLACK),
        p(lathe([[0, 3.72], [0.44, 3.72], [0.49, 3.97], [0.49, 4.05], [0, 4.09]])),
        p(visor(0.42, 0.49, 3.58), BLACK),
        p(box(0.14, 0.14, 0.04, 0, 3.82, 0.465), GOLD),
      ]
    case 'chef':
      return [
        p(cyl(0.45, 0.25, 0, 3.675, 0, ROUND)),
        p(lathe([[0, 3.8], [0.47, 3.8], [0.49, 4.0], [0.49, 4.5], [0.42, 4.68], [0.22, 4.77], [0, 4.79]])),
      ]
    case 'fire':
      return [
        p(dome(0.48, 3.52, 3.8, 4.2)),
        p(new THREE.CylinderGeometry(0.49, 0.49, 0.05, ROUND).scale(1.26, 1, 1).translate(0, 3.54, 0)),
        p(box(0.2, 0.22, 0.04, 0, 3.86, 0.47), GOLD),
      ]
    case 'construction':
      return [
        p(dome(0.46, 3.58, 3.74, 4.08)),
        p(new THREE.CylinderGeometry(0.49, 0.49, 0.04, ROUND).scale(1.16, 1, 1).translate(0, 3.6, 0)),
        p(box(0.12, 0.08, 0.84, 0, 4.06, 0)),
      ]
    case 'space': {
      const open = 0.42 * Math.PI
      return [
        p(shell(0.49, 2.9, 3.86, open, 2 * Math.PI - 2 * open)),
        p(dome(0.49, 3.86, 3.87, 4.3)),
        p(cyl(0.03, 0.3, 0.3, 4.3, -0.2, 6), METAL_GRAY),
      ]
    }
    case 'crown': {
      const spikes: Piece[] = []
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        spikes.push(p(new THREE.CylinderGeometry(0, 0.09, 0.24, 6).translate(0.36 * Math.sin(a), 3.92, 0.36 * Math.cos(a))))
      }
      return [p(cyl(0.45, 0.2, 0, 3.7, 0, ROUND)), p(cyl(0.3, 0.06, 0, 3.81, 0, ROUND)), ...spikes]
    }
    case 'robber_cap':
      return [p(dome(0.46, 3.6, 3.74, 4.04)), p(cyl(0.475, 0.12, 0, 3.66, 0, ROUND))]
  }
}

function accessory(kind: Required<FigStyle>['accessory']): Piece[] {
  const x = HAND_X, y = HAND_Y, z = HAND_Z
  switch (kind) {
    case 'none':
      return []
    case 'tool': // a wrench
      return [
        { g: box(0.07, 0.6, 0.07, x, y + 0.12, z), hex: METAL_GRAY },
        { g: box(0.08, 0.16, 0.22, x, y + 0.46, z), hex: METAL_GRAY },
      ]
    case 'pan':
      return [
        { g: box(0.06, 0.42, 0.06, x, y + 0.12, z), hex: BLACK },
        { g: new THREE.CylinderGeometry(0.24, 0.2, 0.06, 14).rotateZ(Math.PI / 2).translate(x - 0.02, y + 0.56, 0.2), hex: BLACK },
      ]
    case 'radio':
      return [
        { g: box(0.14, 0.3, 0.1, x, y + 0.2, z), hex: BLACK },
        { g: cyl(0.02, 0.2, x + 0.03, y + 0.45, z, 6), hex: BLACK },
      ]
    case 'flashlight':
      return [
        { g: cyl(0.065, 0.42, x, y + 0.08, z, 10), hex: COLORS[8].hex },
        { g: cyl(0.09, 0.08, x, y + 0.32, z, 10), hex: COLORS[8].hex },
        { g: cyl(0.075, 0.02, x, y + 0.37, z, 10), hex: LENS },
      ]
  }
}

function bodyPieces(s: Required<FigStyle>): Piece[] {
  const hex = (c: number) => COLORS[c]?.hex ?? '#ffffff'
  const legs = hex(s.legs)
  const pieces: Piece[] = [
    // Legs with feet reaching forward, and the hips.
    { g: box(0.74, LEG_TOP - 0.16, 0.66, -0.4, 0.16 + (LEG_TOP - 0.16) / 2, 0), hex: legs },
    { g: box(0.74, LEG_TOP - 0.16, 0.66, 0.4, 0.16 + (LEG_TOP - 0.16) / 2, 0), hex: legs },
    { g: box(0.74, 0.16, 0.82, -0.4, 0.08, 0.06), hex: legs },
    { g: box(0.74, 0.16, 0.82, 0.4, 0.08, 0.06), hex: legs },
    { g: box(2 * TORSO_BOTTOM_HALF, HIP_TOP - LEG_TOP, 0.66, 0, (LEG_TOP + HIP_TOP) / 2, 0), hex: legs },
    { g: torso(), hex: hex(s.torso) },
    ...arm(1, hex(s.arms)),
    ...arm(-1, hex(s.arms)),
    // Neck and head, the head with softened top and bottom edges.
    { g: cyl(0.2, NECK_TOP - TORSO_TOP + 0.02, 0, (TORSO_TOP + NECK_TOP) / 2, 0), hex: SKIN_HEX },
    {
      g: lathe([
        [0, HEAD_BOTTOM], [HEAD_R - 0.06, HEAD_BOTTOM], [HEAD_R, HEAD_BOTTOM + 0.06],
        [HEAD_R, HEAD_TOP - 0.06], [HEAD_R - 0.06, HEAD_TOP], [0, HEAD_TOP],
      ]),
      hex: SKIN_HEX,
    },
    ...hat(s.hat, hex(s.hatColor)),
    ...accessory(s.accessory),
  ]
  return pieces
}

const tmpColor = new THREE.Color()

/** Non-indexed, position + normal + per-vertex `color`; uv dropped. Keeps each piece's own normals. */
function colored({ g, hex }: Piece): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g
  if (flat !== g) g.dispose()
  flat.deleteAttribute('uv')
  if (!flat.getAttribute('normal')) flat.computeVertexNormals()
  tmpColor.set(hex)
  const n = flat.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3)
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return flat
}

/** The face picture on a strip wrapped round the front half of the head, following its facets. */
function faceStrip(printId: string): THREE.BufferGeometry {
  const { u0, v0, u1, v1 } = printUv(printId)
  const r = HEAD_R + PRINT_LIFT
  const segs = ROUND / 2
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const { y0, y1 } = FIG_FACE_BAND
  for (let i = 0; i < segs; i++) {
    const corner = (k: number, top: boolean) => {
      const a = -Math.PI / 2 + (k / segs) * Math.PI // -90 deg (viewer's left, -X) to +90 deg
      pos.push(r * Math.sin(a), top ? y1 : y0, r * Math.cos(a))
      nor.push(Math.sin(a), 0, Math.cos(a))
      uv.push(u0 + (k / segs) * (u1 - u0), top ? v1 : v0)
    }
    // Two counter-clockwise triangles seen from outside.
    corner(i, false); corner(i + 1, false); corner(i + 1, true)
    corner(i, false); corner(i + 1, true); corner(i, true)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/**
 * The torso print on the chest: the torso's front trapezoid (slightly inset). The atlas cell maps
 * onto the trapezoid's bounding rectangle (hip width by torso height), so a drawer sees the true
 * shape: full width at the bottom, `TORSO_TOP_HALF / TORSO_BOTTOM_HALF` of it at the top.
 */
function torsoPrint(printId: string): THREE.BufferGeometry {
  const { u0, v0, u1, v1 } = printUv(printId)
  const inset = 0.02
  const yb = HIP_TOP + inset, yt = TORSO_TOP - inset
  const z = TORSO_HALF_DEPTH + PRINT_LIFT
  const corners: Array<[number, number]> = [
    [-torsoHalf(yb) + inset, yb], [torsoHalf(yb) - inset, yb], [torsoHalf(yt) - inset, yt],
    [-torsoHalf(yb) + inset, yb], [torsoHalf(yt) - inset, yt], [-torsoHalf(yt) + inset, yt],
  ]
  const toU = (x: number) => u0 + ((x + TORSO_BOTTOM_HALF) / (2 * TORSO_BOTTOM_HALF)) * (u1 - u0)
  const toV = (y: number) => v0 + ((y - HIP_TOP) / (TORSO_TOP - HIP_TOP)) * (v1 - v0)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(([x, y]) => [x, y, z]), 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(corners.flatMap(() => [0, 0, 1]), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(corners.flatMap(([x, y]) => [toU(x), toV(y)]), 2))
  return g
}

/** Torso drawings are this much wider on the figure than in their square atlas cell. */
export const TORSO_PRINT_ASPECT = (2 * TORSO_BOTTOM_HALF) / (TORSO_TOP - HIP_TOP)
/** Width of the torso's top edge as a fraction of the print's width (the rest is outside the torso). */
export const TORSO_PRINT_TOP_WIDTH = TORSO_TOP_HALF / TORSO_BOTTOM_HALF

function finish(g: THREE.BufferGeometry | null, what: string): THREE.BufferGeometry {
  if (!g) throw new Error(`Failed to merge figure ${what}`)
  g.translate(0, -H / 2, 0)
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

function build(style: FigStyle): FigureGeometry {
  const s = canonicalFig(style)
  const body = bodyPieces(s).map(colored)
  const prints = [faceStrip(`fig_face_${s.face}`)]
  if (s.print !== 'plain') prints.push(torsoPrint(`fig_torso_${s.print}`))
  const out = { body: finish(mergeGeometries(body), 'body'), print: finish(mergeGeometries(prints), 'print') }
  for (const g of [...body, ...prints]) g.dispose()
  return out
}

/**
 * A figure geometry nobody else owns (not cached): the caller must dispose both geometries. For
 * short-lived uses such as thumbnails, so one-off looks never pile up in the shared cache.
 */
export function buildFigureGeometry(style: FigStyle): FigureGeometry {
  return build(style)
}

/** The shared cache keeps at most this many looks, beyond the ones a scene still shows. */
export const FIGURE_CACHE_MAX = 64

/** Cached looks by `figKey`, least recently used first (a hit moves its key to the end). */
const cache = new Map<string, FigureGeometry>()

let liveKeys: () => ReadonlySet<string> = () => new Set()

/**
 * Tells the cache which looks (`figKey`s) are still on screen somewhere (the Workshop, Guided build,
 * placement ghost...): eviction skips them. Without it, eviction is purely least recently used.
 * Called only when the cache is over `FIGURE_CACHE_MAX`.
 */
export function setLiveFigureKeys(provider: () => ReadonlySet<string>): void {
  liveKeys = provider
}

/** Number of looks in the shared figure cache. */
export function figureCacheSize(): number {
  return cache.size
}

/** The cached geometry of a look, if any, without building it or changing its recency. */
export function peekFigureGeometry(style: FigStyle): FigureGeometry | undefined {
  return cache.get(figKey(style))
}

/**
 * Drops least recently used looks, except live ones and `keep`, until the cache is back to
 * `FIGURE_CACHE_MAX`. Disposing frees their GPU buffers; a mesh that still draws one simply
 * re-uploads it (three.js recreates disposed buffers on the next render).
 */
function trim(keep: string): void {
  if (cache.size <= FIGURE_CACHE_MAX) return
  const live = liveKeys()
  for (const [key, g] of cache) {
    if (cache.size <= FIGURE_CACHE_MAX) break
    if (key === keep || live.has(key)) continue
    cache.delete(key)
    g.body.dispose()
    g.print.dispose()
  }
}

/**
 * The geometry of a figure style, cached by look (`figKey`). Shared: never dispose or mutate it.
 * The cache is bounded (see `trim`): hold the result only while the look is live.
 */
export function getFigureGeometry(style: FigStyle): FigureGeometry {
  const key = figKey(style)
  let g = cache.get(key)
  if (g) {
    cache.delete(key) // most recently used goes last
    cache.set(key, g)
    return g
  }
  g = build(style)
  cache.set(key, g)
  trim(key)
  return g
}
