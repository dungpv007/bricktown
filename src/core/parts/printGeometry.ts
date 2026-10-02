import * as THREE from 'three'
import { PRINT_BY_ID, printUv } from '../prints'
import { platesToWorld } from '../units'
import type { PartDef } from '../types'
import { getPart } from './catalog'
import { COMPUTER_SCREEN, INSET } from './geometry'

/**
 * Print overlays: flat textured quads laid just above a part's surface, using the shared print
 * atlas (see core/prints). They are drawn with the print material, separately from the part body
 * (which takes the brick colour), so the print keeps its own colours on any brick colour.
 */

/** Height of a print above the surface it sits on (the print material also uses polygon offset). */
export const PRINT_LIFT = 0.005
/** Each side of a printed tile's picture stays this far inside the tile's top face. */
const TILE_PRINT_INSET = 0.02

/**
 * A quad in the XY plane facing +Z, centred on the origin, `sx` by `sy`, showing the whole print
 * upright (its top along +Y). Non-indexed `position` + `normal` + `uv`; transform it into place.
 * Reusable for any printed surface (tile tops, screens, figure faces and torsos).
 */
export function printPlane(printId: string, sx: number, sy: number): THREE.BufferGeometry {
  const { u0, v0, u1, v1 } = printUv(printId)
  const x0 = -sx / 2, x1 = sx / 2, y0 = -sy / 2, y1 = sy / 2
  // Two counter-clockwise triangles (seen from +Z): bottom-left, bottom-right, top-right / top-left.
  const corners: Array<[number, number, number, number]> = [
    [x0, y0, u0, v0], [x1, y0, u1, v0], [x1, y1, u1, v1],
    [x0, y0, u0, v0], [x1, y1, u1, v1], [x0, y1, u0, v1],
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(([x, y]) => [x, y, 0]), 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(corners.flatMap(() => [0, 0, 1]), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(corners.flatMap(([, , u, v]) => [u, v]), 2))
  return g
}

/**
 * A printed box (a sign board): the print on its front (-Z) and back (+Z) faces, each upright and
 * reading left to right from its own side, as large as fits the face at the print's aspect ratio
 * (the board colour frames it).
 */
function boardFaces(p: PartDef, printId: string, H: number): THREE.BufferGeometry {
  const { w: cw, h: ch } = PRINT_BY_ID[printId]!
  const maxW = p.w - 2 * TILE_PRINT_INSET
  const maxH = H - 2 * TILE_PRINT_INSET
  const sx = Math.min(maxW, (maxH * cw) / ch)
  const sy = (sx * ch) / cw
  const half = p.d / 2 - INSET + PRINT_LIFT
  const back = printPlane(printId, sx, sy).translate(0, 0, half)
  const front = printPlane(printId, sx, sy).rotateY(Math.PI).translate(0, 0, -half)
  const merged = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) {
    const a = back.getAttribute(name)
    const b = front.getAttribute(name)
    const data = new Float32Array(a.array.length + b.array.length)
    data.set(a.array as Float32Array, 0)
    data.set(b.array as Float32Array, a.array.length)
    merged.setAttribute(name, new THREE.BufferAttribute(data, a.itemSize))
  }
  back.dispose()
  front.dispose()
  return merged
}

function build(p: PartDef, printId: string): THREE.BufferGeometry {
  const H = platesToWorld(p.h)
  let g: THREE.BufferGeometry
  if (p.shape === 'computer') {
    const s = COMPUTER_SCREEN
    g = printPlane(printId, s.w, s.h).translate(0, s.y, s.z + PRINT_LIFT)
  } else if (p.shape === 'box') {
    g = boardFaces(p, printId, H)
  } else {
    // Flat on the top face; the picture's top points to -Z (away from the default camera), so
    // it reads upright from the front-right view and along +X for wide prints.
    g = printPlane(printId, p.w - 2 * TILE_PRINT_INSET, p.d - 2 * TILE_PRINT_INSET)
      .rotateX(-Math.PI / 2)
      .translate(0, H / 2 + PRINT_LIFT, 0)
  }
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

const cache = new Map<string, THREE.BufferGeometry | null>()

/**
 * The print overlay of a part in part space (same frame as `getPartGeometry`), or null when the
 * part carries no print. Cached and shared: callers must not dispose or mutate it.
 */
export function getPrintGeometry(partId: string): THREE.BufferGeometry | null {
  let g = cache.get(partId)
  if (g === undefined) {
    const p = getPart(partId)
    g = p.print ? build(p, p.print) : null
    cache.set(partId, g)
  }
  return g
}
