import { createBuilder } from './builder'

const b = createBuilder()
const TRUNK = 9 // brown
const NEEDLES = 5 // green

// A tall trunk, then two tiers of slopes getting narrower and a pointed top: a Christmas-tree cone.
for (const y of [0, 3]) b.add('brick_2x2', 3, y, 3, 0, TRUNK)
b.add('plate_4x4', 2, 6, 2, 0, NEEDLES)
// Tier 1 (6x6): a pinwheel of four long slopes, each falling away from the 2x2 core.
b.add('brick_2x2', 3, 7, 3, 0, NEEDLES)
b.add('slope_2x4', 1, 7, 1, 2, NEEDLES) // front, low side -Z
b.add('slope_2x4', 5, 7, 1, 1, NEEDLES) // right, low side +X
b.add('slope_2x4', 3, 7, 5, 0, NEEDLES) // back, low side +Z
b.add('slope_2x4', 1, 7, 3, 3, NEEDLES) // left, low side -X
// A green core lifts tier 2 (4x4) clear of tier 1: four small slopes round the core's top.
b.add('brick_2x2', 3, 10, 3, 0, NEEDLES)
b.add('slope_2x2', 2, 13, 2, 2, NEEDLES)
b.add('slope_2x2', 4, 13, 2, 1, NEEDLES)
b.add('slope_2x2', 4, 13, 4, 0, NEEDLES)
b.add('slope_2x2', 2, 13, 4, 3, NEEDLES)
// The pointed top.
b.add('cone_2x2', 3, 16, 3, 0, NEEDLES)

export const pineTree = b.done({
  id: 'pine_tree',
  name: { vi: 'Cây thông', en: 'Pine tree' },
  difficulty: 1,
  kind: 'prop',
  tags: ['park', 'nature'],
  baseplate: { w: 8, d: 8 },
})
