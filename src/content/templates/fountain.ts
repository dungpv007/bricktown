import { createBuilder } from './builder'

const b = createBuilder()
const STONE = 24 // light bluish gray
const RIM = 0 // white
const WATER = 17 // trans blue
const PAVING = 7

// A paved square with a round-cornered basin: a rim of white bricks around blue water tiles.
b.plates(0, 1, 1, 6, 6, PAVING)
b.layer(1, [
  ['brick_1x4', 2, 1, 1, RIM], ['brick_1x4', 2, 6, 1, RIM],
  ['brick_1x4', 1, 2, 0, RIM], ['brick_1x4', 6, 2, 0, RIM],
])
b.layer(1, [
  ['tile_1x2', 2, 2, 0, WATER], ['tile_1x2', 2, 4, 0, WATER],
  ['tile_1x2', 5, 2, 0, WATER], ['tile_1x2', 5, 4, 0, WATER],
  ['tile_1x2', 3, 2, 1, WATER], ['tile_1x2', 3, 5, 1, WATER],
])

// The fountain in the middle: a pedestal, a bowl and a jet of water splashing up.
b.add('round_2x2', 3, 1, 3, 0, STONE)
b.add('round_2x2', 3, 4, 3, 0, STONE)
b.add('dish_2x2', 3, 7, 3, 0, RIM)
b.add('round_1x1', 3, 9, 3, 0, WATER)
b.add('round_1x1', 3, 12, 3, 0, WATER)
b.add('cone_1x1', 3, 15, 3, 0, WATER)
// Splashes in the basin.
for (const [x, z] of [[2, 3], [5, 4]]) b.add('cone_1x1', x, 2, z, 0, WATER)

export const fountain = b.done({
  id: 'fountain',
  name: { vi: 'Đài phun nước', en: 'Fountain' },
  difficulty: 2,
  kind: 'prop',
  tags: ['park', 'nature'],
  baseplate: { w: 8, d: 8 },
})
