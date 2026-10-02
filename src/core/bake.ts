import * as THREE from 'three'
import { COLORS, colorMaterialKind, type MaterialKind } from './colors'
import { figKey, figOf, isFigure } from './figures'
import { brickBodyGeometry, brickPrintGeometry } from './parts/brickGeometry'
import { getPart } from './parts/catalog'
import { buildFigureGeometry, peekFigureGeometry, type FigureGeometry } from './parts/figureGeometry'
import { partStuds, studVertexCount } from './parts/geometry'
import { brickCenter, footprint, QUARTER_COS, QUARTER_SIN } from './rotation'
import type { Brick, PartShape, Rot } from './types'

/**
 * Baking merges a whole brick model into one geometry per material kind (see `MaterialKind`), so
 * the City can draw hundreds of buildings with a handful of draw calls. Each baked body vertex
 * carries its brick's colour in a linear-space `color` attribute (render with `vertexColors`
 * materials); a minifigure keeps its own colours and always bakes opaque. Prints (see core/prints) go in one more geometry with atlas texture coordinates.
 */
export interface BakedModel {
  opaque: THREE.BufferGeometry
  /** Bricks painted with a transparent colour; null when the model has none. */
  trans: THREE.BufferGeometry | null
  /** Bricks painted with a metallic colour; null when the model has none. */
  metal: THREE.BufferGeometry | null
  /**
   * The prints of printed parts, whatever their body colour: `position`, `normal` and atlas `uv`,
   * no `color` (prints keep their own colours). Null when no brick carries a print.
   */
  print: THREE.BufferGeometry | null
}

/** Which shared material a baked geometry renders with: a colour's material kind, or the print atlas. */
export type BakedKind = MaterialKind | 'print'

/** The model's non-empty geometries with the kind each renders with: opaque, trans, metal, print. */
export function bakedGeometries(baked: BakedModel): Array<[BakedKind, THREE.BufferGeometry]> {
  const out: Array<[BakedKind, THREE.BufferGeometry]> = []
  if (baked.opaque.getAttribute('position').count > 0) out.push(['opaque', baked.opaque])
  if (baked.trans) out.push(['trans', baked.trans])
  if (baked.metal) out.push(['metal', baked.metal])
  if (baked.print) out.push(['print', baked.print])
  return out
}

/** Disposes every geometry of a bake the caller owns (never one from the shared cache). */
export function disposeBaked(baked: BakedModel): void {
  baked.opaque.dispose()
  baked.trans?.dispose()
  baked.metal?.dispose()
  baked.print?.dispose()
}

/** Part shapes whose underside is solid over the whole footprint: a stud right under one is hidden inside it. */
const SOLID_BOTTOM: ReadonlySet<PartShape> = new Set<PartShape>(['box', 'tile', 'tile_print', 'slope', 'window', 'door'])

/**
 * The studs of each brick that stay visible (flags in `partStuds` order), for the bricks that have
 * some stud buried in the solid, non-transparent underside of a brick sitting right on top of it.
 * Those studs can never be seen, so the bake leaves them out: a wall of stacked bricks loses most
 * of its stud triangles at no visual cost. Bricks with every stud showing are not in the map.
 */
function visibleStuds(bricks: Brick[]): Map<Brick, boolean[]> {
  const covered = new Set<string>() // "x,y,z": stud cell x, z under the bottom (in plates) y of a solid brick
  for (const b of bricks) {
    if (isFigure(b) || colorMaterialKind(b.c) === 'trans') continue
    const part = getPart(b.p)
    if (!SOLID_BOTTOM.has(part.shape)) continue
    const { fx, fz } = footprint(part, b.r)
    for (let x = 0; x < fx; x++) for (let z = 0; z < fz; z++) covered.add(`${b.x + x},${b.y},${b.z + z}`)
  }
  const out = new Map<Brick, boolean[]>()
  if (covered.size === 0) return out
  for (const b of bricks) {
    if (isFigure(b)) continue
    const studs = partStuds(b.p)
    if (studs.length === 0) continue
    const part = getPart(b.p)
    const top = b.y + part.h
    const [cx, , cz] = brickCenter(b)
    const cos = QUARTER_COS[b.r]
    const sin = QUARTER_SIN[b.r]
    let hidden = false
    const visible = studs.map(([sx, sz]) => {
      const x = Math.floor(sx * cos + sz * sin + cx)
      const z = Math.floor(-sx * sin + sz * cos + cz)
      const show = !covered.has(`${x},${top},${z}`)
      if (!show) hidden = true
      return show
    })
    if (hidden) out.set(b, visible)
  }
  return out
}

/** A part geometry (studs last, see `studVertexCount`) with only the `visible` studs kept. */
function withStuds(g: THREE.BufferGeometry, visible: boolean[]): THREE.BufferGeometry {
  const per = studVertexCount()
  const pos = g.getAttribute('position')
  const nor = g.getAttribute('normal')
  const body = pos.count - visible.length * per
  if (g.index || body < 0) return g
  const kept = body + visible.filter(Boolean).length * per
  const positions = new Float32Array(kept * 3)
  const normals = new Float32Array(kept * 3)
  const src = pos.array as Float32Array
  const srcN = nor.array as Float32Array
  positions.set(src.subarray(0, body * 3))
  normals.set(srcN.subarray(0, body * 3))
  let at = body * 3
  visible.forEach((show, i) => {
    if (!show) return
    const from = (body + i * per) * 3
    positions.set(src.subarray(from, from + per * 3), at)
    normals.set(srcN.subarray(from, from + per * 3), at)
    at += per * 3
  })
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return out
}

const FALLBACK_HEX = '#ffffff'
const tmpColor = new THREE.Color()

/**
 * Content key: part, position, rotation and colour of every brick, plus a figure's look (ids do
 * not affect the geometry).
 */
export function bakeKey(bricks: Brick[]): string {
  return bricks
    .map((b) => `${b.p},${b.x},${b.y},${b.z},${b.r},${b.c}${isFigure(b) ? `,${figKey(figOf(b))}` : ''}`)
    .join(';')
}

/** Which colour material a brick's body bakes into: its colour's kind; figures are always opaque. */
export const brickMaterialKind = (b: Brick): MaterialKind => (isFigure(b) ? 'opaque' : colorMaterialKind(b.c))

/**
 * Merges one source geometry per brick, each moved by its brick's transform. With `colored`, every
 * vertex gets its brick's colour, or its own colour when the source has a `color` attribute (a
 * figure); a source `uv` attribute is carried over unchanged.
 */
function mergeBricks(
  bricks: Brick[],
  geometryOf: (b: Brick) => THREE.BufferGeometry,
  colored: boolean,
): THREE.BufferGeometry {
  const sources = bricks.map((b) => {
    const g = geometryOf(b)
    return g.index ? g.toNonIndexed() : g
  })
  const total = sources.reduce((n, g) => n + g.getAttribute('position').count, 0)
  const withUv = sources.length > 0 && sources.every((g) => g.getAttribute('uv') !== undefined)
  const positions = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)
  const colors = colored ? new Float32Array(total * 3) : null
  const uvs = withUv ? new Float32Array(total * 2) : null

  let offset = 0
  bricks.forEach((b, i) => {
    const src = sources[i]
    const pos = src.getAttribute('position')
    const nor = src.getAttribute('normal')
    const uv = src.getAttribute('uv')
    const own = src.getAttribute('color')
    const [cx, cy, cz] = brickCenter(b)
    const cos = QUARTER_COS[b.r as Rot]
    const sin = QUARTER_SIN[b.r as Rot]
    tmpColor.set(COLORS[b.c]?.hex ?? FALLBACK_HEX)
    for (let v = 0; v < pos.count; v++, offset += 3) {
      const px = pos.getX(v)
      const pz = pos.getZ(v)
      positions[offset] = px * cos + pz * sin + cx
      positions[offset + 1] = pos.getY(v) + cy
      positions[offset + 2] = -px * sin + pz * cos + cz
      const nx = nor.getX(v)
      const nz = nor.getZ(v)
      normals[offset] = nx * cos + nz * sin
      normals[offset + 1] = nor.getY(v)
      normals[offset + 2] = -nx * sin + nz * cos
      if (colors) {
        colors[offset] = own ? own.getX(v) : tmpColor.r
        colors[offset + 1] = own ? own.getY(v) : tmpColor.g
        colors[offset + 2] = own ? own.getZ(v) : tmpColor.b
      }
      if (uvs) {
        const k = (offset / 3) * 2
        uvs[k] = uv.getX(v)
        uvs[k + 1] = uv.getY(v)
      }
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export interface BakeOptions {
  /**
   * Figure looks not already in the shared figure cache are built just for this bake and disposed
   * after it, instead of being added to the cache (for one-off models such as thumbnails).
   */
  transientFigures?: boolean
}

/**
 * Bakes without touching the bake cache. The caller owns the returned geometries and must dispose
 * them. Prefer `bakeBricks` unless the result is short-lived (e.g. thumbnails).
 */
export function bakeBricksUncached(bricks: Brick[], options: BakeOptions = {}): BakedModel {
  const own = new Map<string, FigureGeometry>()
  const figure = (b: Brick): FigureGeometry => {
    const style = figOf(b)
    const cached = peekFigureGeometry(style)
    if (cached) return cached
    const key = figKey(style)
    let g = own.get(key)
    if (!g) {
      g = buildFigureGeometry(style)
      own.set(key, g)
    }
    return g
  }
  const transient = options.transientFigures === true
  const studs = visibleStuds(bricks)
  const bodyOf = (b: Brick) => {
    if (transient && isFigure(b)) return figure(b).body
    const visible = studs.get(b)
    return visible ? withStuds(brickBodyGeometry(b), visible) : brickBodyGeometry(b)
  }
  const printOf = (b: Brick) => (transient && isFigure(b) ? figure(b).print : brickPrintGeometry(b))
  try {
    const byKind: Record<MaterialKind, Brick[]> = { opaque: [], trans: [], metal: [] }
    for (const b of bricks) byKind[brickMaterialKind(b)].push(b)
    const printed = bricks.filter((b) => printOf(b) !== null)
    const optional = (list: Brick[]) => (list.length > 0 ? mergeBricks(list, bodyOf, true) : null)
    return {
      opaque: mergeBricks(byKind.opaque, bodyOf, true),
      trans: optional(byKind.trans),
      metal: optional(byKind.metal),
      print: printed.length > 0 ? mergeBricks(printed, (b) => printOf(b)!, false) : null,
    }
  } finally {
    for (const g of own.values()) {
      g.body.dispose()
      g.print.dispose()
    }
  }
}

const cache = new Map<string, BakedModel>()

/**
 * Cached by content (see `bakeKey`): equal models share one result. The geometries are shared
 * app-wide, so callers must never dispose or mutate them. Only bake what a template or saved
 * blueprint shows: `evictBakes` drops everything else (bake one-off models with `bakeBricksUncached`).
 */
export function bakeBricks(bricks: Brick[]): BakedModel {
  const key = bakeKey(bricks)
  let baked = cache.get(key)
  if (!baked) {
    baked = bakeBricksUncached(bricks)
    cache.set(key, baked)
  }
  return baked
}

/** Number of models in the bake cache. */
export function bakeCacheSize(): number {
  return cache.size
}

/**
 * Drops and disposes every cached bake whose key is not in `keep` (e.g. older versions of a
 * blueprint, deleted blueprints); returns how many were dropped. Call it only when no mounted
 * scene can still draw a dropped bake: when a scene that used the cache unmounts, keeping the keys
 * any scene may still show.
 */
export function evictBakes(keep: ReadonlySet<string>): number {
  let dropped = 0
  for (const [key, baked] of cache) {
    if (keep.has(key)) continue
    cache.delete(key)
    disposeBaked(baked)
    dropped++
  }
  return dropped
}
