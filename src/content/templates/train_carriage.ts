import { createBuilder } from './builder'
import { trainBase } from './train'

const b = createBuilder()
const RED = 2
const CREAM = 10 // tan
const ROOF = 8 // dark gray
const GLASS = 15

// A passenger carriage to pull behind the engine: same frame, a long body with windows down both
// sides and a door window at each end. Forward is -Z.
trainBase(b, ROOF)

// Passengers inside (before the body closes round them).
b.fig('customer', 3, 6, 4, 0)
b.fig('customer2', 3, 6, 9, 2)
b.fig({ torso: 13, legs: 1, face: 'glasses', hat: 'hair_ponytail', hatColor: 1, print: 'plain' }, 3, 6, 12, 0)

// A red course round the bottom.
for (const x of [1, 6]) {
  b.add('brick_1x6', x, 6, 0, 0, RED)
  b.add('brick_1x6', x, 6, 6, 0, RED)
  b.add('brick_1x4', x, 6, 12, 0, RED)
}
for (const z of [0, 15]) b.add('brick_1x4', 2, 6, z, 1, RED)

// The window band (two courses high): corner posts, seven windows a side, a window at each end.
for (const [x, z] of [[1, 0], [6, 0], [1, 15], [6, 15]]) {
  b.add('brick_1x1', x, 9, z, 0, CREAM)
  b.add('brick_1x1', x, 12, z, 0, CREAM)
}
for (const x of [1, 6]) for (let z = 1; z < 15; z += 2) b.add('window_1x2x2', x, 9, z, 1, GLASS)
for (const z of [0, 15]) {
  b.add('window_1x2x2', 3, 9, z, 0, GLASS)
  for (const x of [2, 5]) {
    b.add('brick_1x1', x, 9, z, 0, CREAM)
    b.add('brick_1x1', x, 12, z, 0, CREAM)
  }
}

// A cream course over the windows and a gray roof.
for (const x of [1, 6]) {
  b.add('brick_1x6', x, 15, 0, 0, CREAM)
  b.add('brick_1x6', x, 15, 6, 0, CREAM)
  b.add('brick_1x4', x, 15, 12, 0, CREAM)
}
for (const z of [0, 15]) b.add('brick_1x4', 2, 15, z, 1, CREAM)
b.plates(18, 1, 0, 6, 15, ROOF)

export const trainCarriage = b.done({
  id: 'train_carriage',
  name: { vi: 'Toa tàu hỏa', en: 'Train carriage' },
  difficulty: 3,
  kind: 'vehicle',
  tags: ['train'],
  baseplate: { w: 8, d: 16 },
})
