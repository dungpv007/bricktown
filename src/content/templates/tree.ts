import { createBuilder } from './builder'

const b = createBuilder()
const TRUNK = 9 // brown
const LEAVES = 5 // green

b.add('brick_2x2', 3, 0, 3, 0, TRUNK)
b.add('brick_2x2', 3, 3, 3, 0, TRUNK)
b.add('plate_4x4', 2, 6, 2, 0, LEAVES)
b.add('round_2x2', 3, 7, 3, 0, LEAVES)
b.add('round_2x2', 3, 10, 3, 0, LEAVES)
b.add('cone_1x1', 3, 13, 3, 0, LEAVES)

export const tree = b.done({
  id: 'tree',
  name: { vi: 'Cây xanh', en: 'Tree' },
  difficulty: 1,
  kind: 'prop',
  tags: ['nature'],
  baseplate: { w: 8, d: 8 },
})
