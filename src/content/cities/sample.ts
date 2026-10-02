import { newId } from '../../core/ids'
import { roadKey } from '../../core/roads'
import type { CityPlacement, CityState, CityTerrain, Rot } from '../../core/types'

/**
 * The sample town ("Thành phố mẫu"): what a new player's City starts with, and what the 🏙️ button
 * brings back. Hand-authored on a 32 x 32 grid (north = -Z is the top row; the City camera looks
 * from the south, so the tall downtown stands at the back):
 *
 * - 4-lane avenues: a ring round the town, a north-south avenue through the middle, and the shopping
 *   avenue east-west right across, leaving through the railway at two level crossings (both lanes);
 * - side streets: one through each north block, one through the south-east block;
 * - a railway loop round the whole town, a verge of trees and street lamps between it and the ring;
 * - downtown (north): an office tower, a skyscraper and an apartment block drawn x2 on pavement;
 * - police headquarters (north-west), the fire station with its garage (north-east), all facing roads;
 * - the shopping avenue: sushi, bakery, toy shop, grocery on its north side behind a town square, the
 *   restaurant across it;
 * - homes facing the avenues and streets, a park with a fountain and a playground (south-east), a lake
 *   with a sand beach and a little island (south-west).
 */

/**
 * The ground, one character per cell (x = column, z = row):
 * `.` grass, `=` road, `#` rail, `+` level crossing (road and rail), `~` water, `:` sand, `_` pavement.
 * A 2-wide band of road is an avenue (see core/avenues), a 1-wide one a street.
 */
const MAP = [
  '................................',
  '.##############################.',
  '.#............................#.',
  '.#.==========================.#.',
  '.#.==========================.#.',
  '.#.==...._...._==...._...._==.#.',
  '.#.==...._...._==...._...._==.#.',
  '.#.==...._...._==...._...._==.#.',
  '.#.==...._...._==...._...._==.#.',
  '.#.==========================.#.',
  '.#.==__________==..........==.#.',
  '.#.==__________==..........==.#.',
  '.#.==..........==..........==.#.',
  '.#.==..........==..........==.#.',
  '=+============================+=',
  '=+============================+=',
  '.#.==:::::::...==..........==.#.',
  '.#.==:~~~~~:...==..........==.#.',
  '.#.==:~~~~~:...==..........==.#.',
  '.#.==:~~~~~:...==..........==.#.',
  '.#.==:~~:~~:...==..........==.#.',
  '.#.==:~~~~~:...==============.#.',
  '.#.==:~~~~~:...==:::_____..==.#.',
  '.#.==:::::::...==:::_____..==.#.',
  '.#.==..........==:::_____..==.#.',
  '.#.==..........==..._____..==.#.',
  '.#.==..........==..._____..==.#.',
  '.#.==========================.#.',
  '.#.==========================.#.',
  '.#............................#.',
  '.##############################.',
  '................................',
]

/** A model in the town: template id, min corner cell, quarter turns (front faces -Z at 0), size. */
type Spot = readonly [templateId: string, cx: number, cz: number, rot: Rot, s?: number]

// Fronts: rot 0 faces north (-Z), 1 west, 2 south (towards the camera), 3 east.
const SPOTS: Spot[] = [
  // --- North-west block, north half: police headquarters and the office tower face the side street ---
  ['tree', 5, 5, 0], ['round_tree', 6, 5, 0], ['tree', 7, 5, 0], ['pine_tree', 8, 5, 0],
  ['police_hq', 5, 6, 2],
  ['lamp', 9, 5, 0], ['bench', 9, 7, 1],
  ['office_tower', 10, 5, 2, 2],
  ['lamp', 14, 5, 0], ['bench', 14, 7, 3],

  // --- Downtown (north-east block, north half): the giants face the side street ---
  ['skyscraper', 17, 5, 2, 2],
  ['lamp', 21, 5, 0], ['bench', 21, 7, 3],
  ['apartment', 22, 5, 2, 2],
  ['lamp', 26, 5, 0], ['round_tree', 26, 7, 0],

  // --- Town square (pavement) behind the shops ---
  ['round_tree', 5, 10, 0], ['bush_flowers', 5, 11, 0], ['bench', 6, 10, 2], ['lamp', 7, 11, 0],
  ['flower_bed', 8, 10, 0, 2], ['lamp', 10, 11, 0], ['bench', 11, 10, 2], ['tree', 12, 10, 0],
  ['bush_flowers', 13, 11, 0], ['round_tree', 14, 10, 0],

  // --- The shopping avenue, north side: the shops face it (and the camera) ---
  ['sushi_restaurant', 5, 12, 2], ['bakery', 7, 12, 2], ['toy_shop', 9, 12, 2], ['grocery', 11, 12, 2],
  ['office_tower', 13, 12, 2],

  // --- North-east block, south half: the fire station and its garage face the shopping avenue ---
  ['fire_station', 17, 10, 2],
  ['lamp', 21, 10, 0], ['tree', 21, 11, 0], ['bush_flowers', 21, 12, 0], ['lamp', 21, 13, 0],
  ['garage', 22, 10, 2],
  ['pine_tree', 26, 10, 0], ['tree', 26, 11, 0], ['pine_tree', 26, 12, 0], ['lamp', 26, 13, 0],

  // --- South-west block: the lake with its island and beach, homes facing the avenues ---
  ['round_tree', 8, 20, 0],
  ['lamp', 5, 16, 0], ['bush_flowers', 8, 16, 0], ['lamp', 11, 16, 0],
  ['bench', 5, 19, 3], ['bench', 11, 19, 1], ['pine_tree', 5, 23, 0], ['tree', 11, 23, 0],
  ['house_blue', 13, 16, 3], ['house_small', 13, 19, 3], ['house_tall', 13, 22, 3],
  ['tree', 12, 16, 0], ['lamp', 12, 18, 0], ['pine_tree', 12, 20, 0], ['bench', 12, 22, 1],
  ['pine_tree', 5, 24, 0], ['tree', 7, 24, 0], ['round_tree', 9, 24, 0], ['pine_tree', 11, 24, 0],
  ['tree', 13, 24, 0], ['bush_flowers', 14, 24, 0],
  ['house_small', 5, 25, 2], ['house_tall', 7, 25, 2], ['house_blue', 9, 25, 2], ['house_small', 11, 25, 2],
  ['house_blue', 13, 25, 2],

  // --- South-east block, north half: the restaurant faces the shopping avenue, homes both roads ---
  ['restaurant', 17, 16, 0],
  ['tree', 17, 20, 0], ['pine_tree', 18, 20, 0], ['tree', 19, 20, 0], ['lamp', 20, 20, 0],
  ['house_blue', 21, 16, 0], ['house_small', 23, 16, 0], ['house_tall', 25, 16, 0],
  ['bush_flowers', 21, 18, 0], ['tree', 22, 18, 0], ['bush_flowers', 23, 18, 0], ['pine_tree', 24, 18, 0],
  ['bush_flowers', 25, 18, 0], ['tree', 26, 18, 0],
  ['house_tall', 21, 19, 2], ['house_small', 23, 19, 2], ['house_blue', 25, 19, 2],

  // --- The park: playground on sand, fountain plaza, trees ---
  ['playground', 17, 23, 0, 2], ['bench', 17, 22, 2], ['pine_tree', 19, 22, 0], ['tree', 19, 24, 0],
  ['fountain', 21, 23, 0, 2],
  ['flower_bed', 20, 22, 0], ['flower_bed', 23, 22, 0], ['flower_bed', 20, 25, 0], ['flower_bed', 23, 25, 0],
  ['bench', 21, 22, 2], ['bench', 22, 25, 0], ['lamp', 24, 23, 0], ['lamp', 20, 24, 0],
  ['round_tree', 25, 22, 0, 2], ['pine_tree', 25, 24, 0], ['tree', 26, 24, 0], ['pine_tree', 25, 26, 0],
  ['round_tree', 26, 25, 0],
  ['tree', 17, 25, 0], ['pine_tree', 18, 26, 0], ['bush_flowers', 19, 25, 0],

  // --- The verge between the avenue ring and the railway: street lamps and trees ---
  ...verge(),
]

/** Lamps and trees every other cell along the verge (row / column 2 and 29), clear of the shopping avenue. */
function verge(): Spot[] {
  const out: Spot[] = []
  const trees = ['pine_tree', 'tree', 'round_tree']
  let n = 0
  const at = (cx: number, cz: number) => {
    out.push([n % 2 === 0 ? 'lamp' : trees[(n >> 1) % trees.length], cx, cz, 0])
    n++
  }
  for (let x = 3; x <= 28; x += 2) at(x, 2)
  for (let x = 3; x <= 28; x += 2) at(x, 29)
  for (let z = 5; z <= 26; z += 2) if (z !== 15) at(2, z)
  for (let z = 5; z <= 26; z += 2) if (z !== 15) at(29, z)
  return out
}

function build(): CityState {
  const size = MAP.length
  const roads: string[] = []
  const rails: string[] = []
  const terrain: CityTerrain = { water: [], pavement: [], sand: [] }
  MAP.forEach((row, cz) => {
    if (row.length !== size) throw new Error(`sample city row ${cz} has length ${row.length}, expected ${size}`)
    for (let cx = 0; cx < size; cx++) {
      const key = roadKey(cx, cz)
      switch (row[cx]) {
        case '=': roads.push(key); break
        case '#': rails.push(key); break
        case '+': roads.push(key); rails.push(key); break
        case '~': terrain.water.push(key); break
        case ':': terrain.sand.push(key); break
        case '_': terrain.pavement.push(key); break
      }
    }
  })
  const placements: CityPlacement[] = SPOTS.map(([templateId, cx, cz, rot, s], i) => ({
    id: `sample_${i + 1}`,
    source: `tpl:${templateId}`,
    cx,
    cz,
    rot,
    ...(s && s > 1 ? { s } : {}),
  }))
  return { size, roads, placements, terrain, rails }
}

/** The sample town as authored (stable ids `sample_<n>`). Shared: never mutate it, use `sampleCity()`. */
export const SAMPLE_CITY: Readonly<CityState> = build()

/** Template ids the sample town uses. */
export const SAMPLE_TEMPLATE_IDS: readonly string[] = [...new Set(SPOTS.map(([id]) => id))]

/** A fresh, deep copy of the sample town with newly generated placement ids, ready to become a save's city. */
export function sampleCity(): CityState {
  const { size, roads, placements, terrain, rails } = SAMPLE_CITY
  return {
    size,
    roads: [...roads],
    placements: placements.map((p) => ({ ...p, id: newId('pl') })),
    ...(terrain ? { terrain: { water: [...terrain.water], pavement: [...terrain.pavement], sand: [...terrain.sand] } } : {}),
    ...(rails ? { rails: [...rails] } : {}),
  }
}
