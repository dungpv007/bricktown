import { newId } from '../../core/ids'
import { roadKey } from '../../core/roads'
import type { CityPlacement, CityState, CityTerrain, Rot } from '../../core/types'

/**
 * The sample town ("Thành phố mẫu"): what a new player's City starts with, and what the 🏙️ button
 * brings back. Hand-authored on a 32 x 32 grid (north = -Z is the top row; the City camera looks
 * from the south, so the tall downtown stands at the back):
 *
 * - a railway loop round the whole town, with four level crossings where the roads leave it;
 * - downtown (north): an office tower and a skyscraper drawn x2, apartment blocks;
 * - the shopping street (the middle east-west road): sushi, bakery, toy shop, grocery, restaurant;
 * - police headquarters (north-west), the fire station with its garage (east);
 * - a town square, homes on every quiet block, a park with a fountain and a playground (south-east), a lake with a
 *   sand beach and a little island (south-west), trees and street lamps along the roads.
 */

/**
 * The ground, one character per cell (x = column, z = row):
 * `.` grass, `=` road, `#` rail, `+` level crossing (road and rail), `~` water, `:` sand, `_` pavement.
 */
const MAP = [
  '...................=............',
  '.##################+###########.',
  '.#.................=..........#.',
  '.#.==========================.#.',
  '.#.=......=________=________=.#.',
  '.#.=......=________=________=.#.',
  '.#.=......=________=________=.#.',
  '.#.=......=________=________=.#.',
  '.#.=......=________=________=.#.',
  '.#.=......=________=________=.#.',
  '=+============================+=',
  '.#.=......=______..=........=.#.',
  '.#.=......=______..=........=.#.',
  '.#.=......=______..=........=.#.',
  '.#.=......=______..=........=.#.',
  '.#.=......=........=........=.#.',
  '.#.=......=........=........=.#.',
  '.#.==========================.#.',
  '.#........=........=........=.#.',
  '.#...:::..=........=..____..=.#.',
  '.#..:~~~:.=........=::____..=.#.',
  '.#.:~~~~~:=........=::____..=.#.',
  '.#.:~~~~~:=........=..____..=.#.',
  '.#:~~~.~~:=........=........=.#.',
  '.#:~~~~~~:===================.#.',
  '.#.:~~~~~:=........=........=.#.',
  '.#.:~~~~:.=........=........=.#.',
  '.#..:~~:..=........=........=.#.',
  '.#...::...===================.#.',
  '.#.................=..........#.',
  '.##################+###########.',
  '...................=............',
]

/** A model in the town: template id, min corner cell, quarter turns (front faces -Z at 0), size. */
type Spot = readonly [templateId: string, cx: number, cz: number, rot: Rot, s?: number]

// Fronts: rot 0 faces north (-Z), 1 west, 2 south (towards the camera), 3 east.
const SPOTS: Spot[] = [
  // --- North-west block: police headquarters, homes on the north road ---
  ['house_small', 4, 4, 0], ['house_blue', 6, 4, 0], ['house_small', 8, 4, 0],
  ['round_tree', 4, 6, 0], ['bush_flowers', 5, 6, 0], ['tree', 7, 6, 0], ['bush_flowers', 9, 6, 0],
  ['police_hq', 4, 7, 2], ['lamp', 8, 7, 0], ['tree', 9, 7, 0],
  ['bush_flowers', 8, 8, 0], ['pine_tree', 9, 8, 0], ['tree', 8, 9, 0], ['lamp', 9, 9, 0],

  // --- Downtown ---
  ['pine_tree', 11, 4, 0], ['lamp', 12, 4, 0], ['tree', 13, 4, 0], ['lamp', 14, 4, 0], ['pine_tree', 15, 4, 0],
  ['bench', 12, 5, 0], ['pine_tree', 16, 6, 0], ['tree', 16, 4, 0],
  ['office_tower', 11, 6, 2, 2],
  ['skyscraper', 15, 8, 2],
  ['apartment', 17, 4, 3],
  ['round_tree', 17, 6, 0], ['bench', 18, 7, 3], ['bush_flowers', 17, 8, 0], ['lamp', 18, 9, 0],
  ['round_tree', 20, 4, 0], ['lamp', 22, 4, 0], ['bench', 21, 5, 0], ['tree', 24, 4, 0],
  ['bush_flowers', 25, 5, 0], ['lamp', 26, 4, 0], ['pine_tree', 27, 4, 0],
  ['skyscraper', 20, 6, 2, 2],
  ['apartment', 24, 6, 2, 2],

  // --- West middle block: homes back to back round a garden ---
  ['house_blue', 4, 11, 0], ['house_small', 6, 11, 0], ['house_tall', 8, 11, 0],
  ['pine_tree', 4, 13, 0], ['bush_flowers', 5, 14, 0], ['tree', 6, 13, 0], ['tree', 8, 13, 0], ['bush_flowers', 9, 14, 0],
  ['house_tall', 4, 15, 2], ['house_small', 6, 15, 2], ['house_blue', 8, 15, 2],

  // --- Town square and the shopping street (north side) ---
  ['round_tree', 11, 11, 0], ['round_tree', 16, 11, 0], ['tree', 11, 14, 0], ['tree', 16, 14, 0],
  ['flower_bed', 13, 12, 0, 2], ['bench', 13, 11, 2], ['bench', 14, 14, 0], ['lamp', 12, 12, 0], ['lamp', 15, 13, 0],
  ['office_tower', 17, 11, 3],
  ['pine_tree', 17, 13, 0], ['lamp', 18, 13, 0], ['bush_flowers', 17, 14, 0], ['tree', 18, 14, 0],
  ['sushi_restaurant', 11, 15, 2], ['bakery', 13, 15, 2], ['toy_shop', 15, 15, 2], ['grocery', 17, 15, 2],

  // --- Fire station and garage, homes on the shopping street ---
  ['fire_station', 20, 11, 0], ['garage', 24, 11, 0],
  ['house_tall', 20, 15, 2], ['house_small', 22, 15, 2], ['house_blue', 24, 15, 2], ['house_small', 26, 15, 2],

  // --- Shopping street (south side): the restaurant, then homes ---
  ['restaurant', 11, 18, 0],
  ['house_blue', 15, 18, 0], ['house_small', 17, 18, 0],
  ['tree', 15, 20, 0], ['bush_flowers', 16, 21, 0], ['tree', 17, 20, 0], ['pine_tree', 18, 21, 0],
  ['house_tall', 11, 22, 2], ['house_small', 13, 22, 2], ['house_blue', 15, 22, 2], ['house_tall', 17, 22, 2],

  // --- The park: fountain plaza, playground on sand, trees ---
  ['fountain', 23, 20, 0, 2],
  ['flower_bed', 22, 19, 0], ['flower_bed', 25, 19, 0], ['flower_bed', 22, 22, 0], ['flower_bed', 25, 22, 0],
  ['bench', 23, 19, 2], ['bench', 24, 22, 0], ['lamp', 24, 19, 0], ['lamp', 23, 22, 0],
  ['playground', 20, 20, 0, 2],
  ['pine_tree', 20, 18, 0], ['tree', 21, 18, 0], ['pine_tree', 26, 18, 0], ['round_tree', 27, 18, 0],
  ['round_tree', 26, 20, 0, 2],
  ['tree', 20, 23, 0], ['pine_tree', 21, 23, 0], ['pine_tree', 26, 23, 0], ['round_tree', 27, 23, 0],

  // --- South blocks: homes with front gardens ---
  ['house_small', 11, 25, 0], ['house_tall', 13, 25, 0], ['house_small', 15, 25, 0], ['house_blue', 17, 25, 0],
  ['tree', 11, 27, 0], ['pine_tree', 13, 27, 0], ['tree', 15, 27, 0], ['pine_tree', 17, 27, 0],
  ['house_tall', 20, 25, 0], ['house_small', 22, 25, 0], ['house_blue', 24, 25, 0], ['house_small', 26, 25, 0],
  ['pine_tree', 20, 27, 0], ['tree', 22, 27, 0], ['pine_tree', 24, 27, 0], ['pine_tree', 26, 27, 0],

  // --- The lake: an island tree, benches on the beach, trees round the shore ---
  ['round_tree', 6, 23, 0],
  ['bench', 9, 22, 1], ['bench', 5, 28, 0], ['lamp', 9, 24, 0],
  ['pine_tree', 4, 18, 0], ['round_tree', 6, 18, 0], ['pine_tree', 8, 18, 0],
  ['pine_tree', 3, 19, 0], ['tree', 9, 20, 0], ['pine_tree', 2, 21, 0], ['pine_tree', 2, 26, 0],
  ['pine_tree', 9, 27, 0], ['pine_tree', 8, 28, 0], ['tree', 3, 28, 0],

  // --- Street trees and lamps on the verge between the outer roads and the railway ---
  ['pine_tree', 3, 2, 0], ['lamp', 5, 2, 0], ['pine_tree', 7, 2, 0], ['lamp', 9, 2, 0], ['pine_tree', 11, 2, 0],
  ['lamp', 13, 2, 0], ['pine_tree', 15, 2, 0], ['lamp', 17, 2, 0], ['lamp', 21, 2, 0], ['pine_tree', 23, 2, 0],
  ['lamp', 25, 2, 0], ['pine_tree', 27, 2, 0],
  ['tree', 11, 29, 0], ['lamp', 13, 29, 0], ['tree', 15, 29, 0], ['lamp', 17, 29, 0], ['lamp', 21, 29, 0],
  ['tree', 23, 29, 0], ['lamp', 25, 29, 0], ['pine_tree', 27, 29, 0],
  ['tree', 2, 4, 0], ['lamp', 2, 6, 0], ['tree', 2, 8, 0], ['tree', 2, 12, 0], ['lamp', 2, 14, 0],
  ['tree', 2, 16, 0],
  ['pine_tree', 29, 4, 0], ['lamp', 29, 6, 0], ['pine_tree', 29, 8, 0], ['pine_tree', 29, 12, 0], ['lamp', 29, 14, 0],
  ['pine_tree', 29, 16, 0], ['lamp', 29, 18, 0], ['pine_tree', 29, 20, 0], ['lamp', 29, 22, 0], ['pine_tree', 29, 24, 0],
  ['lamp', 29, 26, 0], ['pine_tree', 29, 28, 0],
]

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
