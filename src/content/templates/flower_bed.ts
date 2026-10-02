import { createBuilder } from './builder'

const b = createBuilder()
const GRASS = 5
const EDGE = 0 // white stone edging
const SOIL = 9 // brown
const COLORS = [2, 4, 12, 13, 6, 0] // red, yellow, pink, purple, orange, white

// A raised bed: white edging round a box of soil, a bush in the middle and rows of flowers.
b.plates(0, 1, 1, 6, 6, GRASS)
b.layer(1, [
  ['brick_1x6', 1, 1, 1, EDGE], ['brick_1x6', 1, 6, 1, EDGE],
  ['brick_1x4', 1, 2, 0, EDGE], ['brick_1x4', 6, 2, 0, EDGE],
])
for (const [x, z] of [[2, 2], [4, 2], [2, 4], [4, 4]]) b.add('brick_2x2', x, 1, z, 0, SOIL)
b.add('bush_2x2', 3, 4, 3, 0, GRASS)
const ring: Array<[number, number]> = [
  [2, 2], [3, 2], [4, 2], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [2, 4], [2, 3],
]
ring.forEach(([x, z], i) => b.add('flower_1x1', x, 4, z, 0, COLORS[i % COLORS.length]))

export const flowerBed = b.done({
  id: 'flower_bed',
  name: { vi: 'Bồn hoa', en: 'Flower bed' },
  difficulty: 1,
  kind: 'prop',
  tags: ['park', 'nature'],
  baseplate: { w: 8, d: 8 },
})
