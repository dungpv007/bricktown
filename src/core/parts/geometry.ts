import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PLATE_HEIGHT, platesToWorld } from '../units'
import { DEFAULT_FIG, MINIFIG_PART } from '../figures'
import type { PartDef } from '../types'
import { getPart } from './catalog'
import { getFigureGeometry } from './figureGeometry'

/**
 * Procedural low-poly geometry for every part, centred on the origin at r=0:
 * X in [-w/2, w/2], Z in [-d/2, d/2], Y in [-H/2, H/2] (studs stick out above +H/2).
 * Each part is a single non-indexed BufferGeometry with flat-shaded `position` + `normal`.
 */

export const INSET = 0.01 // body shrink per side, leaves a gap between neighbours
const SEGMENTS = 12 // cylinders / cones / spheres
const STUD_RADIUS = 0.3
const STUD_HEIGHT = 0.17
const STUD_SEGMENTS = 10

type Piece = THREE.BufferGeometry

const box = (sx: number, sy: number, sz: number, cx: number, cy: number, cz: number): Piece =>
  new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz)

const cylinder = (
  rTop: number, rBottom: number, height: number, segments: number,
  cx: number, cy: number, cz: number,
): Piece => new THREE.CylinderGeometry(rTop, rBottom, height, segments).translate(cx, cy, cz)

const ellipsoid = (rx: number, ry: number, rz: number, cx: number, cy: number, cz: number): Piece =>
  new THREE.SphereGeometry(1, SEGMENTS, 8).scale(rx, ry, rz).translate(cx, cy, cz)

/**
 * Convex prism whose cross-section lies in the YZ plane, extruded along X across `width`.
 * `profile` is a list of [z, y] points (either winding order).
 */
function prismYZ(profile: [number, number][], width: number): Piece {
  // Shape x = -z so that rotateY(+90deg) (x' = z, z' = -x) maps it back onto world +Z.
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(-z, y)))
  return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
    .rotateY(Math.PI / 2)
    .translate(-width / 2, 0, 0)
}

/** Closed solid of revolution around Y; `profile` is [radius, y] from the bottom axis point to the top one. */
const lathe = (profile: [number, number][]): Piece =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), SEGMENTS)

/**
 * The computer's screen: the monitor's front face (facing +Z), where the `screen` print goes.
 * `w` x `h` is the picture, centred at (0, y) on the face at z.
 */
export const COMPUTER_SCREEN = { w: 1.6, h: 0.8, y: 0.3, z: -0.225 } as const

/** Studs at the centres of the given top-face cells. */
function studsAt(cells: [number, number][], topY: number): Piece[] {
  return cells.map(([x, z]) =>
    cylinder(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, STUD_SEGMENTS, x, topY + STUD_HEIGHT / 2, z),
  )
}

function allCells(w: number, d: number): [number, number][] {
  const cells: [number, number][] = []
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) cells.push([-w / 2 + 0.5 + i, -d / 2 + 0.5 + j])
  return cells
}

/** Window / door frame; returns pieces plus the opening size (centred at x=0, spanning the frame's height). */
function frame(w: number, d: number, H: number): { pieces: Piece[]; openW: number; openH: number } {
  const t = 0.2
  const outerW = w - 2 * INSET
  const depth = d - 2 * INSET
  const openW = outerW - 2 * t
  const openH = H - 2 * t
  const postX = outerW / 2 - t / 2
  return {
    openW,
    openH,
    pieces: [
      box(t, H, depth, -postX, 0, 0),
      box(t, H, depth, postX, 0, 0),
      box(openW, t, depth, 0, H / 2 - t / 2, 0),
      box(openW, t, depth, 0, -H / 2 + t / 2, 0),
    ],
  }
}

function slopeProfile(d: number, H: number, inverted: boolean): [number, number][] {
  const front = d / 2 - INSET
  const back = -d / 2 + INSET
  const flatEnd = -d / 2 + 1 // full-height back row ends here; d<=1 degenerates to a pure wedge
  const pts: [number, number][] = [
    [back, -H / 2],
    [front, -H / 2],
    [front, -H / 2 + PLATE_HEIGHT],
  ]
  if (d > 1) pts.push([flatEnd, H / 2])
  pts.push([back, H / 2])
  return inverted ? pts.map(([z, y]) => [z, -y]) : pts
}

function buildBody(p: PartDef, H: number): Piece[] {
  const { w, d } = p
  const bw = w - 2 * INSET
  const bd = d - 2 * INSET
  const bottom = -H / 2
  const top = H / 2
  const minDim = Math.min(w, d)

  switch (p.shape) {
    case 'box':
    case 'tile':
    case 'tile_print':
      return [box(bw, H, bd, 0, 0, 0)]

    case 'slope':
      return [prismYZ(slopeProfile(d, H, false), bw)]
    case 'slope_inv':
      return [prismYZ(slopeProfile(d, H, true), bw)]

    case 'cylinder': {
      const r = minDim / 2 - 0.02
      return [cylinder(r, r, H, SEGMENTS, 0, 0, 0)]
    }
    case 'cone':
      return [cylinder(0, minDim / 2 - 0.02, H, SEGMENTS, 0, 0, 0)]

    case 'wheel': {
      // Tire axis along X. Radius H/2, but squashed in Z when the part is shallower than it is tall.
      const ry = H / 2 - INSET
      const rz = Math.min(ry, d / 2 - INSET)
      return [new THREE.CylinderGeometry(1, 1, 1, SEGMENTS).rotateZ(Math.PI / 2).scale(bw, ry, rz)]
    }

    case 'window': {
      const f = frame(w, d, H)
      return [...f.pieces, box(f.openW, f.openH, 0.05, 0, 0, 0)]
    }
    case 'door': {
      const f = frame(w, d, H)
      return [...f.pieces, box(f.openW, f.openH, 0.15, 0, 0, 0)]
    }

    case 'fence': {
      const post = 0.25
      const rail = 0.2
      const railW = bw - 2 * post
      const postX = bw / 2 - post / 2
      const rd = 0.12
      return [
        box(post, H, bd, -postX, 0, 0),
        box(post, H, bd, postX, 0, 0),
        box(railW, rail, rd, 0, top - rail / 2, 0), // top rail is flush with the body top (carries the studs)
        box(railW, rail, rd, 0, bottom + 0.3, 0),
      ]
    }

    case 'table': {
      const slab = PLATE_HEIGHT
      const leg = 0.2
      const legH = H - slab
      const lx = bw / 2 - 0.1 - leg / 2
      const lz = bd / 2 - 0.1 - leg / 2
      const pieces = [box(bw, slab, bd, 0, top - slab / 2, 0)]
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pieces.push(box(leg, legH, leg, sx * lx, bottom + legH / 2, sz * lz))
      return pieces
    }

    case 'chair': {
      const seatT = 0.15
      const seatTop = 0
      const leg = 0.15
      const legH = seatTop - seatT - bottom
      const lx = bw / 2 - 0.1 - leg / 2
      const lz = bd / 2 - 0.1 - leg / 2
      const backT = 0.12
      const pieces = [
        box(bw - 0.2, seatT, bd - 0.2, 0, seatTop - seatT / 2, 0),
        box(bw - 0.2, top - seatTop, backT, 0, (top + seatTop) / 2, -bd / 2 + 0.1 + backT / 2),
      ]
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pieces.push(box(leg, legH, leg, sx * lx, bottom + legH / 2, sz * lz))
      return pieces
    }

    case 'counter': {
      const slab = 0.15
      const bodyH = H - slab
      return [
        box(bw - 0.1, bodyH, bd - 0.1, 0, bottom + bodyH / 2, 0),
        box(bw, slab, bd, 0, top - slab / 2, 0), // overhanging worktop
      ]
    }

    case 'stove': {
      const burnerH = 0.05
      const bodyH = H - burnerH // burners stay inside the part's height
      const pieces = [box(bw, bodyH, bd, 0, bottom + bodyH / 2, 0)]
      for (const [x, z] of allCells(w, d)) pieces.push(cylinder(0.2, 0.2, burnerH, SEGMENTS, x, top - burnerH / 2, z))
      return pieces
    }

    case 'fridge': {
      const handleT = 0.06
      const frontZ = bd / 2 // body front face; the handle sits in front of it
      return [
        box(bw, H, bd - handleT, 0, 0, -handleT / 2),
        box(0.08, 0.6, handleT, bw / 2 - 0.2, top - 0.9, frontZ - handleT / 2),
      ]
    }

    case 'sign': {
      const panelT = 0.1
      const panelH = H / 2 - 0.1
      return [
        box(0.15, H - 0.1, 0.15, 0, bottom + (H - 0.1) / 2, 0),
        box(bw, panelH, panelT, 0, top - panelH / 2, 0),
      ]
    }

    case 'lamp': {
      const headH = 0.4
      return [
        box(0.1, H - headH, 0.1, 0, bottom + (H - headH) / 2, 0),
        box(0.4, headH, 0.4, 0, top - headH / 2, 0),
      ]
    }

    case 'tree': {
      const trunkH = H / 4
      const canopyH = H - trunkH * 0.8 // canopy overlaps the top of the trunk slightly
      const canopyR = minDim / 2 - 0.05
      return [
        cylinder(0.2, 0.2, trunkH, SEGMENTS, 0, bottom + trunkH / 2, 0),
        cylinder(0, canopyR, canopyH, SEGMENTS, 0, top - canopyH / 2, 0),
      ]
    }

    case 'bush':
      return [ellipsoid(bw / 2, H / 2, bd / 2, 0, 0, 0)]

    case 'nose_cone': {
      // A short collar, then a pointed nose.
      const r = minDim / 2 - 0.02
      const collar = 0.2
      const noseH = H - collar
      const profile: [number, number][] = [[0, bottom], [r, bottom], [r, bottom + collar]]
      // Ogive: full width at the collar, narrowing ever faster to a point.
      for (const t of [0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 0.96]) profile.push([r * (1 - t) ** 0.55, bottom + collar + t * noseH])
      profile.push([0, top])
      return [lathe(profile)]
    }

    case 'dish': {
      // A shallow bowl on a short foot, with a feed horn sticking up from its middle.
      const r = minDim / 2 - 0.03
      const foot = 0.25
      const rim = 0.1
      const ball = 0.08
      return [
        lathe([[0, bottom], [foot, bottom], [foot, bottom + 0.15], [r, top], [r - rim, top], [0, 0]]),
        cylinder(0.04, 0.04, top - ball, 6, 0, (top - ball) / 2, 0),
        ellipsoid(ball, ball, ball, 0, top - ball, 0),
      ]
    }

    case 'antenna': {
      const baseH = PLATE_HEIGHT
      const ball = 0.12
      const rodH = H - baseH - ball
      return [
        cylinder(0.35, 0.4, baseH, SEGMENTS, 0, bottom + baseH / 2, 0),
        cylinder(0.05, 0.05, rodH, 6, 0, bottom + baseH + rodH / 2, 0),
        ellipsoid(ball, ball, ball, 0, top - ball, 0),
      ]
    }

    case 'bars': {
      // Jail bars: a frame like a window's, with round bars instead of glass.
      const f = frame(w, d, H)
      const count = Math.max(2, Math.round(f.openW / 0.45))
      const gap = f.openW / count
      const pieces = [...f.pieces]
      for (let i = 0; i < count - 1; i++) {
        pieces.push(cylinder(0.07, 0.07, f.openH, 6, -f.openW / 2 + gap * (i + 1), 0, 0))
      }
      return pieces
    }

    case 'steering': {
      // A car dashboard sloping down towards the driver (+Z), with a big steering wheel in front
      // of it, tilted to face the driver.
      const baseH = PLATE_HEIGHT
      const deck = bottom + baseH
      const dash = prismYZ([[-bd / 2, deck], [0.15, deck], [-bd / 2, 0.15]], bw)
      const tilt = Math.PI / 5
      const R = 0.34
      const wheelY = 0.22
      const wheelZ = 0.16
      const place = (g: Piece) => g.rotateX(-tilt).translate(0, wheelY, wheelZ)
      const columnH = wheelY - deck
      return [
        box(bw, baseH, bd, 0, deck - baseH / 2, 0),
        dash,
        box(0.12, columnH, 0.12, 0, deck + columnH / 2, wheelZ - 0.1),
        place(new THREE.TorusGeometry(R, 0.065, 6, 18)),
        place(box(2 * R, 0.08, 0.06, 0, 0, 0)),
        place(box(0.08, R, 0.06, 0, -R / 2, 0)),
        place(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10).rotateX(Math.PI / 2)),
      ]
    }

    case 'computer': {
      // Monitor at the back on a stand, keyboard in front; the screen print goes on COMPUTER_SCREEN.
      const s = COMPUTER_SCREEN
      const monitorD = 0.15
      const monitorH = 1
      const monitorZ = s.z - monitorD / 2
      const standTop = s.y - monitorH / 2
      return [
        box(0.7, 0.06, 0.32, 0, bottom + 0.03, monitorZ),
        box(0.18, standTop - bottom, 0.1, 0, (standTop + bottom) / 2, monitorZ),
        box(bw - 0.1, monitorH, monitorD, 0, s.y, monitorZ),
        box(1.4, 0.08, 0.34, 0, bottom + 0.04, 0.24),
      ]
    }

    case 'bed': {
      // Head at -Z: headboard, mattress and pillow; a low footboard at +Z.
      const frameH = PLATE_HEIGHT
      const mattressH = 0.3
      const mattressTop = bottom + frameH + mattressH
      const headT = 0.2
      const footT = 0.15
      const mattressD = bd - headT - footT
      const mattressZ = (-bd / 2 + headT + bd / 2 - footT) / 2
      return [
        box(bw, frameH, bd, 0, bottom + frameH / 2, 0),
        box(bw - 0.1, mattressH, mattressD, 0, mattressTop - mattressH / 2, mattressZ),
        box(bw - 0.5, 0.18, 0.5, 0, mattressTop + 0.09, -bd / 2 + headT + 0.35),
        box(bw, H, headT, 0, 0, -bd / 2 + headT / 2),
        box(bw, mattressTop + 0.15 - bottom, footT, 0, (mattressTop + 0.15 + bottom) / 2, bd / 2 - footT / 2),
      ]
    }

    case 'flag': {
      // Pole on the first stud (-X), the flag flying towards +X near the top.
      const poleX = -w / 2 + 0.5
      const baseH = PLATE_HEIGHT
      const knob = 0.08
      const poleH = H - baseH - knob
      const flagW = bw / 2 + 0.45
      const flagH = 0.9
      return [
        box(0.8, baseH, Math.min(0.8, bd), poleX, bottom + baseH / 2, 0),
        cylinder(0.06, 0.06, poleH, 8, poleX, bottom + baseH + poleH / 2, 0),
        ellipsoid(knob, knob, knob, poleX, top - knob, 0),
        box(flagW, flagH, 0.06, poleX + 0.05 + flagW / 2, top - 0.2 - flagH / 2, 0),
      ]
    }

    case 'fin': {
      // Thin swept fin on a plate-high base: tall at the back (-Z), sloping down to the front.
      const baseH = PLATE_HEIGHT
      const back = -bd / 2
      const front = bd / 2
      const fin = prismYZ(
        [[back, bottom + baseH], [front, bottom + baseH], [front, bottom + baseH + 0.3], [back + 0.6, top], [back, top]],
        0.3,
      )
      return [box(bw, baseH, bd, 0, bottom + baseH / 2, 0), fin]
    }

    case 'engine': {
      // Rocket nozzle: a bell widening downwards under a narrow mount.
      const r = minDim / 2 - 0.03
      const mountH = 0.3
      const bellH = H - mountH
      return [
        cylinder(0.5, 0.5, mountH, SEGMENTS, 0, top - mountH / 2, 0),
        lathe([[0, bottom + 0.15], [r - 0.12, bottom], [r, bottom], [r * 0.75, bottom + bellH * 0.45], [0.42, top - mountH], [0, top - mountH]]),
      ]
    }

    case 'minifig':
      throw new Error('Minifigures are built per style by figureGeometry')

    case 'flower': {
      const headR = 0.2
      const headY = top - headR
      const stemH = headY - bottom
      return [
        box(0.06, stemH, 0.06, 0, bottom + stemH / 2, 0),
        ellipsoid(headR, headR, headR, 0, headY, 0),
      ]
    }
  }
}

function studCells(p: PartDef): [number, number][] {
  if (!p.studs) return []
  // Slopes only have studs on the full-height back row.
  if (p.shape === 'slope') return p.d > 1 ? allCells(p.w, 1).map(([x]) => [x, -p.d / 2 + 0.5]) : []
  return allCells(p.w, p.d)
}

/** Drop everything except position, make non-indexed, recompute flat normals. */
function normalize(g: Piece): Piece {
  const flat = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position') flat.deleteAttribute(name)
  }
  flat.computeVertexNormals()
  return flat
}

function build(p: PartDef): THREE.BufferGeometry {
  const H = platesToWorld(p.h)
  const pieces = [...buildBody(p, H), ...studsAt(studCells(p), H / 2)].map(normalize)
  const merged = mergeGeometries(pieces)
  if (!merged) throw new Error(`Failed to merge geometry for part ${p.id}`)
  for (const piece of pieces) piece.dispose()
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}

const cache = new Map<string, THREE.BufferGeometry>()

/**
 * One merged, cached geometry per part id. Callers must not dispose or mutate it. The minifig part
 * gives the default figure (a figure brick's own look comes from `brickBodyGeometry`).
 */
export function getPartGeometry(partId: string): THREE.BufferGeometry {
  if (partId === MINIFIG_PART) return getFigureGeometry(DEFAULT_FIG).body
  let g = cache.get(partId)
  if (!g) {
    g = build(getPart(partId))
    cache.set(partId, g)
  }
  return g
}
