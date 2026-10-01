import { createBuilder } from './builder'

const b = createBuilder()
const METAL = 8 // dark gray
const GLOW = 4 // yellow

b.add('plate_2x2', 3, 0, 3, 0, METAL)
b.add('brick_1x1', 3, 1, 3, 0, METAL)
b.add('brick_1x1', 3, 4, 3, 0, METAL)
b.add('brick_1x1', 3, 7, 3, 0, METAL)
b.add('round_2x2', 3, 10, 3, 0, GLOW)
b.add('cone_1x1', 3, 13, 3, 0, METAL)

export const lamp = b.done({
  id: 'lamp',
  name: { vi: 'Đèn đường', en: 'Street lamp' },
  difficulty: 1,
  kind: 'prop',
  tags: ['street'],
  baseplate: { w: 8, d: 8 },
})
