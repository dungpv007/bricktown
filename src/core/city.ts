import { deriveRoads, type RoadShape, type Side } from './avenues'
import { bounds } from './model'
import { roadKey } from './roads'
import type { Baseplate, BlueprintKind, Brick, CityPlacement, CityState, Rot } from './types'

/** Studs per city cell. */
export const CELL = 8

/**
 * Why a placement (or a painted cell) is refused: off the map, on another model, on a road, on a
 * rail, on water (or, for a `water` model, with no water under it at all), or a road and a rail
 * meeting anywhere but at a straight level crossing.
 */
export type PlaceError = 'out_of_bounds' | 'overlap' | 'road' | 'rail' | 'water' | 'crossing'

/** Tag of templates / blueprints that belong on water (bridges, islands, boats). */
export const WATER_TAG = 'water'

/**
 * What the city rules need to know about a model: its plate, whether it is a `water` model
 * (tagged `WATER_TAG`): those sit on water, or straddle water and land, and never on dry land only;
 * and whether it is a `vehicle` (blueprint / template kind): those may also stand on roads.
 */
export interface SourceSize extends Baseplate {
  water?: boolean
  vehicle?: boolean
  /** A vehicle's own width (studs across its bricks, which may be narrower than its plate); absent = the plate's `w`. */
  width?: number
}

const widths = new WeakMap<readonly Brick[], number>()

/**
 * Studs across a model's bricks (X), cached per bricks array; null without bricks, or with a part
 * this version does not know (a blueprint from a newer version: the plate's width is used).
 */
function bricksWidth(bricks: readonly Brick[]): number | null {
  const known = widths.get(bricks)
  if (known !== undefined) return known
  let b: ReturnType<typeof bounds>
  try {
    b = bounds(bricks as Brick[])
  } catch {
    return null
  }
  if (!b) return null
  const w = b.maxX - b.minX
  widths.set(bricks, w)
  return w
}

/**
 * A model's `SourceSize` from its plate, tags, kind and (for a vehicle's own width) bricks: the plate
 * itself when it is neither a water model nor a vehicle.
 */
export function sourceSize(baseplate: Baseplate, tags: readonly string[], kind?: BlueprintKind, bricks?: readonly Brick[]): SourceSize {
  const water = tags.includes(WATER_TAG)
  const vehicle = kind === 'vehicle'
  if (!water && !vehicle) return baseplate
  const width = vehicle && bricks ? bricksWidth(bricks) : null
  return {
    ...baseplate,
    ...(water ? { water: true } : {}),
    ...(vehicle ? { vehicle: true } : {}),
    ...(width !== null && width > 0 && width < baseplate.w ? { width } : {}),
  }
}

type SizeOf = (source: string) => SourceSize

/** Smallest and biggest size multiplier of a placement (`CityPlacement.s`). */
export const MIN_SCALE = 1
export const MAX_SCALE = 10

/** A placement's size multiplier (absent = 1). */
export const scaleOf = (p: Pick<CityPlacement, 's'>): number => p.s ?? MIN_SCALE

/**
 * A stored size multiplier made safe: numbers are rounded and clamped into MIN_SCALE..MAX_SCALE,
 * anything else (absent, NaN, a string...) is 1.
 */
export function normalizeScale(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return MIN_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(v)))
}

/** Whether `v` is a valid stored size multiplier: an integer in MIN_SCALE..MAX_SCALE. */
export const isScale = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= MIN_SCALE && v <= MAX_SCALE

/** Smallest road fit factor (`CityPlacement.fit`): a x10 kid-built bus still fits a lane. */
export const MIN_FIT = 0.01

/** Whether `v` is a valid stored road fit: a number in MIN_FIT..<1 (1 = full size is stored as absent). */
export const isFit = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= MIN_FIT && v < 1

/** A placement's road fit (absent = 1, full size). */
export const fitOf = (p: Pick<CityPlacement, 'fit'>): number => p.fit ?? 1

/** How much bigger a placement is drawn than its model: its size multiplier times its road fit. */
export const drawScale = (p: Pick<CityPlacement, 's' | 'fit'>): number => scaleOf(p) * fitOf(p)

/** The plate a model covers when drawn `k` times bigger (studs x k; `k` may be fractional). */
export function scaledBaseplate(baseplate: Baseplate, k: number): Baseplate {
  return k === 1 ? baseplate : { ...baseplate, w: baseplate.w * k, d: baseplate.d * k }
}

/** Cells spanned by `studs` (float noise a hair past a cell boundary still counts as inside). */
const cellsFor = (studs: number): number => Math.max(1, Math.ceil(studs / CELL - 1e-6))

/** Footprint of a baseplate in city cells for the given rotation (w/d swapped for odd rot). */
export function footprintCells(baseplate: Baseplate, rot: Rot): { cw: number; cd: number } {
  const cw = cellsFor(baseplate.w)
  const cd = cellsFor(baseplate.d)
  return rot % 2 === 1 ? { cw: cd, cd: cw } : { cw, cd }
}

/**
 * Footprint in cells of a placement of a model on `baseplate`: rotated, and `s` (times its road
 * fit) times bigger (it covers the cells an unscaled model on a plate that much bigger would).
 */
export function placementCells(p: Pick<CityPlacement, 'rot' | 's' | 'fit'>, baseplate: Baseplate): { cw: number; cd: number } {
  return footprintCells(scaledBaseplate(baseplate, drawScale(p)), p.rot)
}

function cellsOf(p: CityPlacement, sizeOf: SizeOf): { cw: number; cd: number } {
  return placementCells(p, sizeOf(p.source))
}

export function canPlaceInCity(
  city: CityState,
  placement: CityPlacement,
  sizeOf: SizeOf,
  ignoreId?: string,
): PlaceError | null {
  const { cw, cd } = cellsOf(placement, sizeOf)
  const { cx, cz } = placement
  if (cx < 0 || cz < 0 || cx + cw > city.size || cz + cd > city.size) return 'out_of_bounds'

  for (const other of city.placements) {
    if (other.id === ignoreId) continue
    const o = cellsOf(other, sizeOf)
    if (cx < other.cx + o.cw && other.cx < cx + cw && cz < other.cz + o.cd && other.cz < cz + cd) {
      return 'overlap'
    }
  }

  const roads = new Set(city.roads)
  const rails = new Set(city.rails ?? [])
  const water = new Set(city.terrain?.water ?? [])
  // Vehicles may stand on roads (as well as grass, pavement and sand); other models never do.
  const vehicle = sizeOf(placement.source).vehicle === true
  let wet = 0
  for (let x = cx; x < cx + cw; x++) {
    for (let z = cz; z < cz + cd; z++) {
      const key = roadKey(x, z)
      if (!vehicle && roads.has(key)) return 'road'
      if (rails.has(key)) return 'rail'
      if (water.has(key)) wet++
    }
  }
  // Ordinary models stay on dry land; water models need some water under them.
  const waterModel = sizeOf(placement.source).water === true
  if (waterModel ? wet === 0 : wet > 0) return 'water'
  return null
}

/** Every cell covered by a placement (optionally only those `which` accepts), as "cx,cz" keys. */
export function coveredCells(city: CityState, sizeOf: SizeOf, which?: (p: CityPlacement) => boolean): Set<string> {
  const covered = new Set<string>()
  for (const p of city.placements) {
    if (which && !which(p)) continue
    const { cw, cd } = cellsOf(p, sizeOf)
    for (let x = p.cx; x < p.cx + cw; x++) {
      for (let z = p.cz; z < p.cz + cd; z++) covered.add(roadKey(x, z))
    }
  }
  return covered
}

/** Whether (cx, cz) is a cell of the city grid. */
export const inGrid = (city: Pick<CityState, 'size'>, cx: number, cz: number): boolean =>
  Number.isInteger(cx) && Number.isInteger(cz) && cx >= 0 && cz >= 0 && cx < city.size && cz < city.size

/** Returns the new city, or null if the placement is not allowed. */
export function addPlacement(
  city: CityState,
  placement: CityPlacement,
  sizeOf: SizeOf,
): CityState | null {
  if (canPlaceInCity(city, placement, sizeOf) !== null) return null
  return { ...city, placements: [...city.placements, placement] }
}

export function removePlacement(city: CityState, id: string): CityState {
  return { ...city, placements: city.placements.filter((p) => p.id !== id) }
}

function replacePlacement(
  city: CityState,
  id: string,
  change: (p: CityPlacement) => CityPlacement,
  sizeOf: SizeOf,
): CityState | null {
  const current = city.placements.find((p) => p.id === id)
  if (!current) return null
  const updated = change(current)
  if (updated === current) return city
  if (canPlaceInCity(city, updated, sizeOf, id) !== null) return null
  return { ...city, placements: city.placements.map((p) => (p.id === id ? updated : p)) }
}

/**
 * Rotate one quarter turn counter-clockwise keeping the min corner; null if it no longer fits. A
 * vehicle on a road then settles on it (`settleVehicle`): along a road it turns on to face the
 * other way.
 */
export function rotatePlacement(city: CityState, id: string, sizeOf: SizeOf): CityState | null {
  return replacePlacement(
    city,
    id,
    (p) => settleVehicle(city, { ...p, rot: ((p.rot + 1) % 4) as Rot }, sizeOf, 'next'),
    sizeOf,
  )
}

/**
 * Move to a new min-corner cell; null if the target is invalid. `fitted` (the turn and road fit a
 * `planMove` preview showed) is used for the moved placement; without it the placement keeps its
 * own. A vehicle then settles on the road under its centre, or gets its full size back off the road.
 */
export function movePlacement(
  city: CityState,
  id: string,
  cx: number,
  cz: number,
  sizeOf: SizeOf,
  fitted?: Pick<CityPlacement, 'rot' | 'fit'>,
): CityState | null {
  return replacePlacement(
    city,
    id,
    (p) => {
      const { fit: _fit, ...rest } = p
      void _fit
      const fit = fitted ? fitted.fit : p.fit
      return settleVehicle(city, { ...rest, cx, cz, rot: fitted?.rot ?? p.rot, ...(fit === undefined ? {} : { fit }) }, sizeOf)
    },
    sizeOf,
  )
}

/**
 * How wide (studs) a vehicle on a road may be: what fits one lane, as the city's cars drive (see
 * core/npc/geometry). A street's two lanes share 5.5 studs of asphalt; an avenue half's two lanes
 * are wider. Boxes and plazas count as avenue.
 */
export const STREET_LANE_STUDS = 2.5
export const AVENUE_LANE_STUDS = 3.25

/**
 * The road at one cell, as a vehicle standing there sees it: how wide a vehicle may be (studs, one
 * lane), which way the road runs (null at a junction, a bend, a lone cell, a box or a plaza), the
 * cells across it (X cells for a road along Z, Z cells for one along X; just this cell for a street)
 * and, on an avenue half, the one heading its traffic drives.
 */
export interface RoadSpot {
  width: number
  axis: 'x' | 'z' | null
  across: number[]
  heading?: Side
}

const N_BIT = 1
const E_BIT = 2
const S_BIT = 4
const W_BIT = 8

function spotOf(shape: RoadShape, cx: number, cz: number): RoadSpot {
  if (shape.kind === 'avenue') {
    const alongZ = shape.partner === 1 || shape.partner === 3
    const step = shape.partner === 1 || shape.partner === 2 ? 1 : -1
    const own = alongZ ? cx : cz
    return { width: AVENUE_LANE_STUDS, axis: alongZ ? 'z' : 'x', across: [own, own + step].sort((a, b) => a - b), heading: shape.heading }
  }
  if (shape.kind === 'street') {
    const ns = (shape.mask & (N_BIT | S_BIT)) !== 0
    const ew = (shape.mask & (E_BIT | W_BIT)) !== 0
    const axis = ns && !ew ? 'z' : ew && !ns ? 'x' : null
    return { width: STREET_LANE_STUDS, axis, across: [axis === 'x' ? cz : cx] }
  }
  // A 2 x 2 box or a wide plaza: avenue lanes, no one way to face.
  return { width: AVENUE_LANE_STUDS, axis: null, across: [] }
}

/** The road at cell (cx, cz) (see `RoadSpot`), or null when it is not a road cell. */
export function roadSpot(city: Pick<CityState, 'roads'>, cx: number, cz: number, shapes?: Map<string, RoadShape>): RoadSpot | null {
  const shape = (shapes ?? deriveRoads(city.roads)).get(roadKey(cx, cz))
  return shape ? spotOf(shape, cx, cz) : null
}

/** The rotation that makes a model (nose to -Z at rot 0) face heading `side` (0 N, 1 E, 2 S, 3 W); its own inverse. */
export const rotFacing = (side: Side | Rot): Rot => ((4 - side) % 4) as Rot

/** The cells at the centre of a span `[lo, lo + len)`: one for an odd length, the two middle ones otherwise. */
const middle = (lo: number, len: number): number[] =>
  len % 2 === 1 ? [lo + (len - 1) / 2] : [lo + len / 2 - 1, lo + len / 2]

/**
 * The road cell a vehicle placement stands on: the first road cell among the middle cells of its
 * footprint (null when none is a road, or it is not a vehicle).
 */
export function vehicleRoadCell(
  city: CityState,
  p: Pick<CityPlacement, 'source' | 'cx' | 'cz' | 'rot' | 's' | 'fit'>,
  sizeOf: SizeOf,
  shapes: Map<string, RoadShape> = deriveRoads(city.roads),
): { cx: number; cz: number; spot: RoadSpot } | null {
  const size = sizeOf(p.source)
  if (!size.vehicle) return null
  const { cw, cd } = placementCells(p, size)
  for (const cx of middle(p.cx, cw)) {
    for (const cz of middle(p.cz, cd)) {
      const spot = roadSpot(city, cx, cz, shapes)
      if (spot) return { cx, cz, spot }
    }
  }
  return null
}

/**
 * A vehicle placement settled on the road under it (anything else is returned as is):
 * - on a road (see `vehicleRoadCell`): it turns to run along the road (a quarter turn on, or on an
 *   avenue to face its traffic when `turn` is 'heading'), and when its width (plate w x `s`:
 *   vehicles point their nose along the plate's depth; its bricks' width when narrower) is more than a lane's it gets a road `fit`
 *   that shrinks it to the lane. Its footprint (which follows the fitted size) is centred on that
 *   road cell along the road and snapped into the road across it (its own carriageway on an avenue);
 * - off the road: it gets its full size back, keeping its centre.
 * Settling a settled placement changes nothing (the same object comes back).
 */
export function settleVehicle(city: CityState, p: CityPlacement, sizeOf: SizeOf, turn: 'heading' | 'next' = 'heading'): CityPlacement {
  const size = sizeOf(p.source)
  if (!size.vehicle) return p
  const anchor = vehicleRoadCell(city, p, sizeOf)
  const { fit: _fit, ...full } = p
  void _fit
  const slide = (v: number, span: number) => Math.max(0, Math.min(city.size - span, v))
  if (!anchor) {
    if (p.fit === undefined) return p
    // Off the road: full size again, around the same centre.
    const now = placementCells(p, size)
    const { cw, cd } = placementCells(full, size)
    return { ...full, cx: slide(Math.round(p.cx + (now.cw - cw) / 2), cw), cz: slide(Math.round(p.cz + (now.cd - cd) / 2), cd) }
  }
  const { spot } = anchor
  let rot = p.rot
  if (spot.axis !== null && (rot % 2 === 0) !== (spot.axis === 'z')) {
    rot = turn === 'heading' && spot.heading !== undefined ? rotFacing(spot.heading) : (((rot + 1) % 4) as Rot)
  }
  const width = (size.width ?? size.w) * scaleOf(p)
  // Rounded down, so the fitted width never pokes past the lane from rounding.
  const fit = width > spot.width ? Math.max(MIN_FIT, Math.floor((spot.width / width) * 1e4) / 1e4) : 1
  const settled: CityPlacement = { ...full, rot, ...(fit < 1 ? { fit } : {}) }
  const { cw, cd } = placementCells(settled, size)
  let cx = anchor.cx - Math.floor((cw - 1) / 2)
  let cz = anchor.cz - Math.floor((cd - 1) / 2)
  if (spot.axis === 'z') cx = cw >= 2 && spot.across.length >= 2 ? spot.across[0] : anchor.cx
  if (spot.axis === 'x') cz = cd >= 2 && spot.across.length >= 2 ? spot.across[0] : anchor.cz
  const out: CityPlacement = { ...settled, cx: slide(cx, cw), cz: slide(cz, cd) }
  return out.cx === p.cx && out.cz === p.cz && out.rot === p.rot && out.fit === p.fit ? p : out
}

/**
 * `p` drawn at size `s` (clamped into MIN_SCALE..MAX_SCALE), growing / shrinking in place: the
 * footprint keeps its centre (an odd change in cells grows towards -X / -Z and shrinks back
 * exactly), then slides back inside the grid if it would hang over an edge. `s` = 1 drops the field.
 */
export function scaledPlacement(city: CityState, p: CityPlacement, s: number, sizeOf: SizeOf): CityPlacement {
  const scale = normalizeScale(s)
  const baseplate = sizeOf(p.source)
  const from = placementCells(p, baseplate)
  const to = placementCells({ rot: p.rot, s: scale, fit: p.fit }, baseplate)
  const slide = (v: number, span: number) => Math.max(0, Math.min(city.size - span, v))
  const { s: _old, ...rest } = p
  void _old
  return {
    ...rest,
    cx: slide(p.cx + Math.trunc((from.cw - to.cw) / 2), to.cw),
    cz: slide(p.cz + Math.trunc((from.cd - to.cd) / 2), to.cd),
    ...(scale === MIN_SCALE ? {} : { s: scale }),
  }
}

/**
 * Resizes placement `id` to `s` (see `scaledPlacement`). `error` says why it is refused (the bigger
 * model would not fit the city, or would cover another model or a road); the city is then null.
 */
export function scalePlacement(
  city: CityState,
  id: string,
  s: number,
  sizeOf: SizeOf,
): { city: CityState | null; error: PlaceError | null } {
  const current = city.placements.find((p) => p.id === id)
  if (!current) return { city: null, error: 'out_of_bounds' }
  const updated = settleVehicle(city, scaledPlacement(city, current, s, sizeOf), sizeOf)
  // On a road a vehicle only grows while it still fits its lane at full size: past that it would just
  // be shrunk back to the lane (same look, a confusing no-op), so the bigger size is refused.
  if (updated.fit !== undefined && normalizeScale(s) > scaleOf(current)) return { city: null, error: 'road' }
  const error = canPlaceInCity(city, updated, sizeOf, id)
  if (error !== null) return { city: null, error }
  return { city: { ...city, placements: city.placements.map((p) => (p.id === id ? updated : p)) }, error: null }
}

/**
 * Add road cells, silently skipping cells outside the grid, covered by a placement or on water.
 * Level crossings are not checked here (see `paintRoads` in core/rails).
 */
export function addRoads(city: CityState, keys: string[], sizeOf: SizeOf): CityState {
  const covered = coveredCells(city, sizeOf)
  const water = new Set(city.terrain?.water ?? [])
  const roads = new Set(city.roads)
  for (const key of keys) {
    const [cx, cz] = key.split(',').map(Number)
    if (!inGrid(city, cx, cz)) continue
    if (covered.has(key) || water.has(key)) continue
    roads.add(key)
  }
  return { ...city, roads: [...roads] }
}
