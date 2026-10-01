import { createBuilder } from './builder'

const b = createBuilder()
const GRASS = 5 // green
const FLOWER_COLORS = [12, 4, 2, 6] // pink, yellow, red, orange

// A little lawn with two bushes and four flowers.
b.add('plate_4x4', 2, 0, 2, 0, GRASS)
b.add('bush_2x2', 2, 1, 2, 0, GRASS)
b.add('bush_2x2', 4, 1, 3, 0, GRASS)
const flowers: Array<[number, number]> = [[2, 4], [3, 5], [5, 2], [4, 5]]
flowers.forEach(([x, z], i) => b.add('flower_1x1', x, 1, z, 0, FLOWER_COLORS[i]))

export const bushFlowers = b.done({
  id: 'bush_flowers',
  name: { vi: 'Bụi cây và hoa', en: 'Bush and flowers' },
  difficulty: 1,
  kind: 'prop',
  tags: ['nature'],
  baseplate: { w: 8, d: 8 },
})
