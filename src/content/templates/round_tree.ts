import { createBuilder } from './builder'

const b = createBuilder()
const TRUNK = 9 // brown
const LEAVES = 11 // lime
const DARK_LEAVES = 5 // green

// A short trunk and a big round, bushy crown: round bricks and bushes in a ball, lime and green.
b.add('brick_2x2', 3, 0, 3, 0, TRUNK)
b.add('brick_2x2', 3, 3, 3, 0, TRUNK)
b.add('plate_4x4', 2, 6, 2, 0, DARK_LEAVES)
for (const [x, z] of [[2, 2], [4, 2], [2, 4], [4, 4]]) b.add('round_2x2', x, 7, z, 0, DARK_LEAVES)
for (const [x, z] of [[2, 2], [4, 2], [2, 4], [4, 4]]) b.add('bush_2x2', x, 10, z, 0, LEAVES)
b.add('bush_2x2', 3, 13, 3, 0, DARK_LEAVES)
for (const [x, z] of [[2, 2], [5, 5]]) b.add('flower_1x1', x, 13, z, 0, 2) // apples

export const roundTree = b.done({
  id: 'round_tree',
  name: { vi: 'Cây tán tròn', en: 'Round tree' },
  difficulty: 1,
  kind: 'prop',
  tags: ['park', 'nature'],
  baseplate: { w: 8, d: 8 },
})
