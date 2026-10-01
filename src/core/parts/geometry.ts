import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PLATE_HEIGHT, platesToWorld } from '../units'
import type { PartDef } from '../types'
import { getPart } from './catalog'

/**
 * Procedural low-poly geometry for every part, centred on the origin at r=0:
 * X in [-w/2, w/2], Z in [-d/2, d/2], Y in [-H/2, H/2] (studs stick out above +H/2).
 * Each part is a single non-indexed BufferGeometry with flat-shaded `position` + `normal`.
 */

const INSET = 0.01 // body shrink per side, leaves a gap between neighbours
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

/** One merged, cached geometry per part id. Callers must not dispose or mutate it. */
export function getPartGeometry(partId: string): THREE.BufferGeometry {
  let g = cache.get(partId)
  if (!g) {
    g = build(getPart(partId))
    cache.set(partId, g)
  }
  return g
}
