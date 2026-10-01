import { createBuilder } from './builder'

const b = createBuilder()
const WOOD = 9 // brown
const SEAT = 10 // tan

// Two legs, a 6-stud seat, and a two-brick-high backrest along the back (+Z) edge.
b.add('brick_1x2', 1, 0, 3, 0, WOOD)
b.add('brick_1x2', 6, 0, 3, 0, WOOD)
b.add('plate_2x4', 1, 3, 3, 1, SEAT)
b.add('plate_2x2', 5, 3, 3, 0, SEAT)
b.add('brick_1x6', 1, 4, 4, 1, WOOD)
b.add('brick_1x6', 1, 7, 4, 1, WOOD)

export const bench = b.done({
  id: 'bench',
  name: { vi: 'Ghế dài', en: 'Park bench' },
  difficulty: 1,
  kind: 'prop',
  tags: ['street', 'furniture'],
  baseplate: { w: 8, d: 8 },
})
