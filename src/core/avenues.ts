import { DIRS, paintRoadLine, roadKey, tileForMask } from './roads'

/**
 * Road width, derived from the road cells alone (`CityState.roads` stays a list of cells, so old saves
 * and share links keep working). A 2-wide band of road cells is a 4-lane avenue: each of its two cells
 * carries one direction (right-hand traffic, two lanes each), with the double yellow centre line on the
 * edge they share. A 1-wide road is a 2-lane street, drawn and driven exactly as before avenues.
 *
 * Every road cell gets one shape:
 * - `street`: not part of any 2 x 2 block of road cells (old saves are all streets);
 * - `avenue`: one half of a 2-wide band (3+ cells long), with its `partner` across the centre line;
 * - `box`: one quarter of a 2 x 2 intersection box (two avenues crossing, a bend, a T, or a lone 2 x 2);
 * - `plaza`: a 3-wide (or wider) painted area, or a tangle no rule reads cleanly: plain pavement, no lines.
 *
 * Rules, in order:
 * 1. A cell inside a fully painted 3 x 3 block is a plaza.
 * 2. Among the other cells, a horizontal band is a run (along X) of columns where the cell and the
 *    one below are both road; a vertical band likewise along Z. A cell in no band of 2+ is a street.
 * 3. A cell whose longest horizontal band is 3+ while its vertical ones are 2 is an avenue along X
 *    (partner: the row it bands with); the same turned for Z. Long bands both ways, or 2 x 2 only, make
 *    a box candidate; candidates must pair up into clean 2 x 2 boxes, else they are plaza.
 */

/** Directions as in core/roads: 0 = N (-Z), 1 = E (+X), 2 = S (+Z), 3 = W (-X). */
export type Side = 0 | 1 | 2 | 3

export const opposite = (d: Side): Side => ((d + 2) & 3) as Side
/** The side on your right when heading `d` (N up): N -> E, E -> S... */
export const rightOf = (d: Side): Side => ((d + 1) & 3) as Side
export const leftOf = (d: Side): Side => ((d + 3) & 3) as Side

export interface StreetShape {
  kind: 'street'
  /** Road neighbours (N | E | S | W bits, core/roads). */
  mask: number
}

export interface PlazaShape {
  kind: 'plaza'
  mask: number
  /** Diagonal road neighbours: bit 0 NE, 1 SE, 2 SW, 3 NW. */
  diag: number
}

export interface AvenueShape {
  kind: 'avenue'
  mask: number
  /** The other half of the avenue, across the centre line. */
  partner: Side
  /** The one heading cars drive here (right-hand traffic: the partner is on their left). */
  heading: Side
  /** A road joins on the outer side (a street or a plaza meeting the avenue here). */
  arm: boolean
  /** Cross traffic: an arm here or on the partner (no lane lines, zebras across). */
  junction: boolean
  /** The avenue ends here (either half lacks a road cell along the axis): cars U-turn across. */
  end: boolean
}

export interface BoxShape {
  kind: 'box'
  mask: number
  /** The box's other cells: the one across N or S, and the one across E or W. */
  inV: Side
  inH: Side
  /** The box has 3+ arms (a real intersection, not a bend): zebras across each arm. */
  zebra: boolean
}

export type RoadShape = StreetShape | PlazaShape | AvenueShape | BoxShape

const DX = [0, 1, 0, -1]
const DZ = [-1, 0, 1, 0]

function parse(key: string): [number, number] {
  const i = key.indexOf(',')
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))]
}

/** Shape of every road cell (see the module comment). Deterministic; the same cells give the same shapes. */
export function deriveRoads(roads: Iterable<string>): Map<string, RoadShape> {
  const set = roads instanceof Set ? (roads as Set<string>) : new Set(roads)
  const has = (x: number, z: number) => set.has(roadKey(x, z))
  const cells: Array<[number, number]> = []
  for (const k of set) cells.push(parse(k))

  // 1. Plazas: every cell of a full 3 x 3 block.
  const plaza = new Set<string>()
  for (const [x, z] of cells) {
    let full = true
    for (let i = 0; i < 3 && full; i++) for (let j = 0; j < 3 && full; j++) if (!has(x + i, z + j)) full = false
    if (full) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) plaza.add(roadKey(x + i, z + j))
  }
  const narrow = (x: number, z: number) => has(x, z) && !plaza.has(roadKey(x, z))

  // 2. Bands. hRun(x, z): run length along X of columns where (x, z) and (x, z + 1) are both narrow road
  //    (0 when they are not). vRun(x, z): along Z, of rows where (x, z) and (x + 1, z) are.
  const hRun = new Map<string, number>()
  const vRun = new Map<string, number>()
  const runs = (pair: (x: number, z: number) => boolean, dx: number, dz: number, out: Map<string, number>) => {
    for (const [x, z] of cells) {
      if (!pair(x, z) || pair(x - dx, z - dz)) continue // not the start of a run
      let n = 0
      while (pair(x + n * dx, z + n * dz)) n++
      for (let i = 0; i < n; i++) out.set(roadKey(x + i * dx, z + i * dz), n)
    }
  }
  runs((x, z) => narrow(x, z) && narrow(x, z + 1), 1, 0, hRun)
  runs((x, z) => narrow(x, z) && narrow(x + 1, z), 0, 1, vRun)
  const run = (m: Map<string, number>, x: number, z: number) => m.get(roadKey(x, z)) ?? 0

  type Pre = { kind: 'street' | 'plaza' | 'box' } | { kind: 'avenue'; partner: Side }
  const pre = new Map<string, Pre>()
  for (const [x, z] of cells) {
    const key = roadKey(x, z)
    if (plaza.has(key)) {
      pre.set(key, { kind: 'plaza' })
      continue
    }
    const hS = run(hRun, x, z)
    const hN = run(hRun, x, z - 1)
    const vE = run(vRun, x, z)
    const vW = run(vRun, x - 1, z)
    const h = Math.max(hS, hN)
    const v = Math.max(vE, vW)
    if (h < 2 && v < 2) pre.set(key, { kind: 'street' })
    else if (h >= 3 && v <= 2) pre.set(key, hS >= 3 && hN >= 3 ? { kind: 'plaza' } : { kind: 'avenue', partner: hS >= 3 ? 2 : 0 })
    else if (v >= 3 && h <= 2) pre.set(key, vE >= 3 && vW >= 3 ? { kind: 'plaza' } : { kind: 'avenue', partner: vE >= 3 ? 1 : 3 })
    else pre.set(key, { kind: 'box' })
  }

  // 3. Boxes: candidates must form clean 2 x 2 blocks (one candidate across N or S, one across E or W,
  //    and the diagonal), each cell agreeing; anything else is plaza.
  const isBox = (x: number, z: number) => pre.get(roadKey(x, z))?.kind === 'box'
  const boxSides = (x: number, z: number): [Side, Side] | null => {
    const n = isBox(x, z - 1)
    const s = isBox(x, z + 1)
    const e = isBox(x + 1, z)
    const w = isBox(x - 1, z)
    if (n === s || e === w) return null
    const v: Side = n ? 0 : 2
    const hz: Side = e ? 1 : 3
    if (!isBox(x + DX[hz], z + DZ[v])) return null
    return [v, hz]
  }
  const boxOk = new Map<string, [Side, Side]>()
  for (const [x, z] of cells) {
    if (!isBox(x, z)) continue
    const sides = boxSides(x, z)
    if (!sides) continue
    const [v, hz] = sides
    // The three other cells must point back at this block.
    const ox = x + DX[hz]
    const oz = z + DZ[v]
    const a = boxSides(x + DX[hz], z)
    const b = boxSides(x, z + DZ[v])
    const c = boxSides(ox, oz)
    if (a && b && c && a[0] === v && a[1] === opposite(hz) && b[0] === opposite(v) && b[1] === hz && c[0] === opposite(v) && c[1] === opposite(hz)) {
      boxOk.set(roadKey(x, z), sides)
    }
  }

  const maskAt = (x: number, z: number) => {
    let m = 0
    for (const d of DIRS) if (has(x + d.dx, z + d.dz)) m |= d.bit
    return m
  }
  const kindAt = (x: number, z: number): RoadShape['kind'] | undefined => {
    const p = pre.get(roadKey(x, z))
    if (!p) return undefined
    if (p.kind === 'box') return boxOk.has(roadKey(x, z)) ? 'box' : 'plaza'
    return p.kind
  }

  const out = new Map<string, RoadShape>()
  for (const [x, z] of cells) {
    const key = roadKey(x, z)
    const p = pre.get(key)!
    const mask = maskAt(x, z)
    const kind = kindAt(x, z)!
    if (kind === 'street') {
      out.set(key, { kind, mask })
    } else if (kind === 'plaza') {
      let diag = 0
      if (has(x + 1, z - 1)) diag |= 1
      if (has(x + 1, z + 1)) diag |= 2
      if (has(x - 1, z + 1)) diag |= 4
      if (has(x - 1, z - 1)) diag |= 8
      out.set(key, { kind, mask, diag })
    } else if (kind === 'box') {
      const [inV, inH] = boxOk.get(key)!
      // Arms of the whole box: a road beyond any of its four sides.
      const x0 = inH === 1 ? x : x - 1
      const z0 = inV === 2 ? z : z - 1
      let arms = 0
      if (has(x0, z0 - 1) || has(x0 + 1, z0 - 1)) arms++
      if (has(x0, z0 + 2) || has(x0 + 1, z0 + 2)) arms++
      if (has(x0 - 1, z0) || has(x0 - 1, z0 + 1)) arms++
      if (has(x0 + 2, z0) || has(x0 + 2, z0 + 1)) arms++
      out.set(key, { kind, mask, inV, inH, zebra: arms >= 3 })
    } else if (p.kind === 'avenue') {
      const partner = p.partner
      const heading = rightOf(partner)
      const outer = opposite(partner)
      const px = x + DX[partner]
      const pz = z + DZ[partner]
      const arm = has(x + DX[outer], z + DZ[outer])
      const partnerAvenue = kindAt(px, pz) === 'avenue'
      // The partner's outer side faces away from this cell.
      const partnerArm = partnerAvenue && has(px + DX[partner], pz + DZ[partner])
      const along = (cx: number, cz: number) => has(cx + DX[heading], cz + DZ[heading]) && has(cx - DX[heading], cz - DZ[heading])
      const end = !along(x, z) || !along(px, pz)
      out.set(key, { kind: 'avenue', mask, partner, heading, arm, junction: arm || partnerArm, end })
    }
  }
  return out
}

/**
 * The axis a road runs straight along at a cell, for level crossings: a straight street, or an avenue
 * half with road on both sides along it and no side road; null for anything else (ends, bends,
 * junctions, boxes, plazas).
 */
export function straightAxis(shape: RoadShape | undefined): 'x' | 'z' | null {
  if (!shape) return null
  const NS = 1 | 4
  const EW = 2 | 8
  if (shape.kind === 'street') return shape.mask === NS ? 'z' : shape.mask === EW ? 'x' : null
  if (shape.kind === 'avenue') {
    if (shape.junction || shape.end) return null
    return shape.partner === 0 || shape.partner === 2 ? 'x' : 'z'
  }
  return null
}

// ---- Brushes --------------------------------------------------------------------------------------

/** The road tool's brush: a 2-wide avenue or a 1-wide street. */
export type RoadBrush = 'avenue' | 'street'

export interface BrushCell {
  cx: number
  cz: number
}

/**
 * The cells an L-shaped road stroke from `from` to `to` paints (first along X, then along Z; see
 * `paintRoadLine`), on a `size` x `size` grid. A street brush paints the line itself. An avenue brush
 * paints a 2-wide band: the second cell on the right of the stroke direction (the finger draws the
 * left half of the band), with the outside of a bend filled in. A tap (no direction yet) paints a 2 x 2. If the band would hang off the grid, it
 * goes on the left instead.
 */
export function brushLine(from: BrushCell, to: BrushCell, brush: RoadBrush, size: number): string[] {
  const line = paintRoadLine([], from, to)
  if (brush === 'street') return line
  const inGrid = (x: number, z: number) => x >= 0 && z >= 0 && x < size && z < size
  // The path in order, with the heading into and out of each cell.
  const path: Array<[number, number]> = line.map(parse)
  const headings = (i: number): Side[] => {
    const out: Side[] = []
    const at = path[i]
    for (const j of [i - 1, i + 1]) {
      const o = path[j]
      if (!o) continue
      // Travel heading through this cell: from the previous cell into it, and from it to the next.
      const [ax, az] = j < i ? o : at
      const [bx, bz] = j < i ? at : o
      for (let d = 0; d < 4; d++) if (ax + DX[d] === bx && az + DZ[d] === bz) out.push(d as Side)
    }
    return out
  }
  const band = (side: (d: Side) => Side): Array<[number, number]> => {
    const cells: Array<[number, number]> = []
    if (path.length === 1) {
      const [x, z] = path[0]
      // A tap: a 2 x 2 to the east and south (the west / north when at the grid edge).
      const dx = x + 1 < size ? 1 : -1
      const dz = z + 1 < size ? 1 : -1
      return [[x, z], [x + dx, z], [x, z + dz], [x + dx, z + dz]]
    }
    path.forEach(([x, z], i) => {
      cells.push([x, z])
      const offs = [...new Set(headings(i).map(side))]
      for (const o of offs) cells.push([x + DX[o], z + DZ[o]])
      if (offs.length === 2) cells.push([x + DX[offs[0]] + DX[offs[1]], z + DZ[offs[0]] + DZ[offs[1]]])
    })
    return cells
  }
  let cells = band(rightOf)
  if (path.length > 1 && cells.some(([x, z]) => !inGrid(x, z))) cells = band(leftOf)
  const out = new Set<string>()
  for (const [x, z] of cells) if (inGrid(x, z)) out.add(roadKey(x, z))
  return [...out]
}

/**
 * Cells an eraser stroke over `keys` removes: with the avenue brush the whole width of the road under
 * the finger goes (an avenue cell takes its partner along, a box cell its whole box); a street or a
 * plaza cell goes alone. With the street brush, just `keys`.
 */
export function eraseKeys(roads: Iterable<string>, keys: Iterable<string>, brush: RoadBrush): string[] {
  const out = new Set(keys)
  if (brush === 'street') return [...out]
  const shapes = deriveRoads(roads)
  for (const k of [...out]) {
    const shape = shapes.get(k)
    if (!shape) continue
    const [x, z] = parse(k)
    if (shape.kind === 'avenue') out.add(roadKey(x + DX[shape.partner], z + DZ[shape.partner]))
    else if (shape.kind === 'box') {
      const hx = x + DX[shape.inH]
      const vz = z + DZ[shape.inV]
      out.add(roadKey(hx, z))
      out.add(roadKey(x, vz))
      out.add(roadKey(hx, vz))
    }
  }
  return [...out]
}

// ---- Tiles ----------------------------------------------------------------------------------------

/**
 * What to draw at a road cell: a tile variant (one instanced mesh each) and a quarter-turn rotation
 * (counter-clockwise seen from above, as `tileForMask`). Variants:
 * - `street:<tile>`: today's street tiles, rotated as before (old saves draw exactly as they did);
 * - `plaza:<mask>:<corners>`: plain pavement, kerbs on the closed sides, unrotated;
 * - `avenue:<n><s><arm><junction>`: drawn as the west half of an avenue running N-S (partner E, cars
 *   heading S), `n` / `s` = road continues that way, then rotated into place;
 * - `box:<s><w><zebra>`: drawn as the SW quarter of a box (the box's other cells N and E), `s` / `w` =
 *   an arm leaves that outer side, then rotated into place.
 */
export interface RoadTileInstance {
  variant: string
  cx: number
  cz: number
  rot: 0 | 1 | 2 | 3
}

const bit = (b: boolean) => (b ? '1' : '0')
/** World side of the canonical side `d` once a tile is turned `rot` quarter turns counter-clockwise. */
export const turnSide = (d: number, rot: number): Side => ((d - rot + 8) & 3) as Side

/** Rotation that turns an avenue tile (drawn with its partner E) so its partner is `partner`. */
export const avenueRot = (partner: Side): RoadTileInstance['rot'] => ((1 - partner + 4) & 3) as RoadTileInstance['rot']

export function roadTiles(roads: Iterable<string>): RoadTileInstance[] {
  const shapes = deriveRoads(roads)
  const out: RoadTileInstance[] = []
  for (const [key, shape] of shapes) {
    const [cx, cz] = parse(key)
    const open = (d: Side) => (shape.mask & (1 << d)) !== 0
    switch (shape.kind) {
      case 'street': {
        const { tile, rot } = tileForMask(shape.mask)
        out.push({ variant: `street:${tile}`, cx, cz, rot })
        break
      }
      case 'plaza': {
        // A kerb corner where two open sides meet round a cell that is not road.
        let corners = 0
        const pairs: Array<[Side, Side, number]> = [[0, 1, 1], [1, 2, 2], [2, 3, 4], [3, 0, 8]]
        pairs.forEach(([a, b, diag], i) => {
          if (open(a) && open(b) && (shape.diag & diag) === 0) corners |= 1 << i
        })
        out.push({ variant: `plaza:${shape.mask}:${corners}`, cx, cz, rot: 0 })
        break
      }
      case 'avenue': {
        const rot = avenueRot(shape.partner)
        const n = open(turnSide(0, rot))
        const s = open(turnSide(2, rot))
        out.push({ variant: `avenue:${bit(n)}${bit(s)}${bit(shape.arm)}${bit(shape.junction)}`, cx, cz, rot })
        break
      }
      case 'box': {
        const rot = (shape.inV === 0 ? (shape.inH === 1 ? 0 : 1) : shape.inH === 3 ? 2 : 3) as RoadTileInstance['rot']
        const s = open(turnSide(2, rot))
        const w = open(turnSide(3, rot))
        out.push({ variant: `box:${bit(s)}${bit(w)}${bit(shape.zebra)}`, cx, cz, rot })
        break
      }
    }
  }
  return out
}
