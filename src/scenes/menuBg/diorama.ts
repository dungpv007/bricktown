import { CELL } from '../../core/city'
import { figPreset, MINIFIG_PART } from '../../core/figures'
import { roadKey } from '../../core/roads'
import type { Brick, CityPlacement, Rot } from '../../core/types'
import { templateSource } from '../../render/sources'
import type { LoopLane } from './loopLane'

/**
 * The little town behind the main menu, laid out like a city (cells of CELL studs): a road loop with
 * a police station, a restaurant and houses round it, trees, lamps and people. Plain data; the
 * scene draws it with the city's own road, placement and bake paths.
 *
 *   x: 0 1 2 3 4 5 6 7 8 9 10
 *   z0 t P P P P t . t b t .     P police HQ (faces the road)   R restaurant (faces the road)
 *   z1 . P P P P . t f . t b     H small house   B blue house   T tall house
 *   z2 . P P P P l . . t f .     t tree  l lamp  b bench  f flowers
 *   z3 l = = = = = = R R R R     = road loop
 *   z4 . = H H t f = R R R R
 *   z5 t = H H b l = R R R R
 *   z6 . = = = = = = R R R R
 *   z7 f l B B T T l t f . t
 *   z8 t . B B T T . . b t .
 */

/** Size of the town plate in cells. */
export const PATCH = { w: 11, d: 9 } as const

/** Centre of the plate (studs), where the camera looks. */
export const CENTER = { x: (PATCH.w * CELL) / 2, z: (PATCH.d * CELL) / 2 } as const

const ring: string[] = []
for (let x = 1; x <= 6; x++) ring.push(roadKey(x, 3), roadKey(x, 6))
for (let z = 4; z <= 5; z++) ring.push(roadKey(1, z), roadKey(6, z))
export const ROADS: string[] = ring

const place = (template: string, cx: number, cz: number, rot: Rot): CityPlacement => ({
  id: `menu-${template}-${cx}-${cz}`,
  source: templateSource(template),
  cx,
  cz,
  rot,
})

// Rot 0 faces -Z, 1 faces -X, 2 faces +Z, 3 faces +X.
export const PLACEMENTS: CityPlacement[] = [
  place('police_hq', 1, 0, 2),
  place('restaurant', 7, 3, 1),
  place('house_small', 2, 4, 0),
  place('house_blue', 2, 7, 0),
  place('house_tall', 4, 7, 0),
  // The park inside the loop.
  place('tree', 4, 4, 0),
  place('bush_flowers', 5, 4, 0),
  place('bench', 4, 5, 2),
  place('lamp', 5, 5, 0),
  // Street lamps and greenery round the edges.
  place('lamp', 0, 3, 0),
  place('lamp', 5, 2, 0),
  place('lamp', 1, 7, 0),
  place('lamp', 6, 7, 0),
  place('tree', 0, 0, 0),
  place('tree', 5, 0, 0),
  place('tree', 7, 0, 0),
  place('tree', 9, 0, 0),
  place('tree', 6, 1, 0),
  place('tree', 9, 1, 0),
  place('tree', 8, 2, 0),
  place('tree', 0, 5, 0),
  place('tree', 0, 8, 0),
  place('tree', 7, 7, 0),
  place('tree', 10, 7, 0),
  place('tree', 9, 8, 0),
  place('bench', 8, 0, 2),
  place('bench', 10, 1, 1),
  place('bench', 8, 8, 0),
  place('bush_flowers', 7, 1, 0),
  place('bush_flowers', 9, 2, 0),
  place('bush_flowers', 0, 7, 0),
  place('bush_flowers', 8, 7, 0),
]

const figure = (preset: string, x: number, z: number, r: Rot, i: number): Brick => {
  const fig = figPreset(preset)
  return { id: `menu-fig-${i}`, p: MINIFIG_PART, x, y: 0, z, r, c: fig.torso, fig }
}

/**
 * People standing about (stud coordinates on the grass; a figure faces +Z at r 0, +X at 1, -Z at 2,
 * -X at 3), baked together into one model.
 */
export const FIGURES: Brick[] = [
  ['police', 38, 23, 0],
  ['kid', 38, 46, 1],
  ['customer', 42, 46, 3],
  ['chef', 52, 57, 2],
  ['construction', 10, 61, 1],
  ['customer2', 70, 12, 2],
  ['doctor', 62, 19, 3],
  ['firefighter', 3, 50, 1],
].map(([preset, x, z, r], i) => figure(preset as string, x as number, z as number, r as Rot, i))

/**
 * The cars' lane: just inside the loop's centre line (they keep right, driving clockwise), with
 * gently rounded corners.
 */
const LANE_OFFSET = 0.7
const ringMin = 1.5 * CELL
export const LANE: LoopLane = {
  x0: ringMin + LANE_OFFSET,
  z0: 3.5 * CELL + LANE_OFFSET,
  x1: 6.5 * CELL - LANE_OFFSET,
  z1: 6.5 * CELL - LANE_OFFSET,
  radius: 3,
}

/** Cars on the loop: a template and how far along the lane (fraction of a lap) it starts. */
export const CARS: Array<{ template: string; start: number }> = [
  { template: 'car', start: 0.38 },
  { template: 'police_car', start: 0.2 },
]

/** Cars' speed along the lane (studs per second). */
export const CAR_SPEED = 7

const cloudBrick = (p: string, x: number, y: number, z: number, r: Rot, i: number): Brick => ({
  id: `menu-cloud-${i}`,
  p,
  x,
  y,
  z,
  r,
  c: 0, // white
})

/** A LEGO cloud, 10 x 4 studs: white plates with round bricks heaped on them. */
export const CLOUD: Brick[] = (
  [
    ['plate_4x8', 1, 0, 0, 1],
    ['plate_2x4', 0, 0, 1, 0],
    ['plate_2x4', 9, 0, 1, 0],
    ['round_2x2', 0, 1, 2, 0],
    ['round_2x2', 2, 1, 0, 0],
    ['round_2x2', 2, 1, 2, 0],
    ['round_2x2', 4, 1, 1, 0],
    ['round_2x2', 6, 1, 0, 0],
    ['round_2x2', 6, 1, 2, 0],
    ['round_2x2', 8, 1, 1, 0],
    ['round_2x2', 3, 4, 1, 0],
    ['round_2x2', 5, 4, 1, 0],
    ['round_1x1', 7, 4, 1, 0],
  ] as Array<[string, number, number, number, Rot]>
).map(([p, x, y, z, r], i) => cloudBrick(p, x, y, z, r, i))

/**
 * Clouds drifting across the sky behind the town (in camera-facing space: +Z towards the camera,
 * so negative z is beyond the town). `x` is where each starts across the sky, `speed` in studs/s.
 */
export const CLOUDS: Array<{ x: number; y: number; z: number; scale: number; speed: number }> = [
  { x: -85, y: -2, z: -135, scale: 2.6, speed: 1.6 },
  { x: -20, y: 8, z: -160, scale: 3, speed: 1.2 },
  { x: 45, y: -8, z: -125, scale: 2.2, speed: 1.9 },
  { x: 110, y: 4, z: -150, scale: 2.8, speed: 1.4 },
]

/** Clouds wrap round when they drift past this distance either side of the town. */
export const CLOUD_SPAN = 160
