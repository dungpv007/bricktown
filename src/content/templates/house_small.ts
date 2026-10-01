import { createBuilder } from './builder'

const WALL = 10 // tan
const ROOF = 2 // red
const WOOD = 9 // brown
const GLASS = 15

const X0 = 3 // house footprint: x 3..12, z 4..11
const X1 = 12
const Z0 = 4
const Z1 = 11
const RUN_LENGTHS = [6, 4, 3, 2, 1]

const b = createBuilder()

/** Fills [from, to] (inclusive) along one wall with the longest 1xN bricks; odd courses start from the other end. */
function run(y: number, axis: 'x' | 'z', fixed: number, from: number, to: number, course: number): void {
  const lengths: number[] = []
  for (let left = to - from + 1; left > 0; ) {
    const n = RUN_LENGTHS.find((l) => l <= left) as number
    lengths.push(n)
    left -= n
  }
  if (course % 2 === 1) lengths.reverse()
  let pos = from
  for (const n of lengths) {
    const part = `brick_1x${n}`
    if (axis === 'x') b.add(part, pos, y, fixed, 1, WALL)
    else b.add(part, fixed, y, pos, 0, WALL)
    pos += n
  }
}

const courses = [0, 3, 6, 9, 12, 15]

// Front wall (z = 4): a 4-wide door at x 4..7 and a window at x 10..11.
b.add('door_1x4x6', 4, 0, Z0, 0, WOOD)
courses.forEach((y, i) => {
  run(y, 'x', Z0, X0, X0, i)
  if (y === 6 || y === 9) {
    run(y, 'x', Z0, 8, 9, i)
    run(y, 'x', Z0, 12, 12, i)
  } else {
    run(y, 'x', Z0, 8, X1, i)
  }
})
b.add('window_1x2x2', 10, 6, Z0, 0, GLASS)

// Back wall (z = 11): a wide window at x 5..8.
courses.forEach((y, i) => {
  if (y >= 6 && y <= 12) {
    run(y, 'x', Z1, X0, 4, i)
    run(y, 'x', Z1, 9, X1, i)
  } else {
    run(y, 'x', Z1, X0, X1, i)
  }
})
b.add('window_1x4x3', 5, 6, Z1, 0, GLASS)

// Side walls (x = 3 and x = 12, z 5..10): a window at z 7..8 on each.
for (const x of [X0, X1]) {
  courses.forEach((y, i) => {
    if (y === 6 || y === 9) {
      run(y, 'z', x, Z0 + 1, 6, i)
      run(y, 'z', x, 9, Z1 - 1, i)
    } else {
      run(y, 'z', x, Z0 + 1, Z1 - 1, i)
    }
  })
  b.add('window_1x2x2', x, 6, 7, 1, GLASS)
}

// Roof in two tiers; the slopes rise toward the ridge at z = 8. Tier 1 rests on the walls (y = 18).
const slopeRow: Array<[number, string]> = [[3, 'slope_2x4'], [7, 'slope_2x4'], [11, 'slope_2x2']]
for (const [x, part] of slopeRow) {
  b.add(part, x, 18, Z0, 2, ROOF)
  b.add(part, x, 18, Z1 - 1, 0, ROOF)
}
for (const z of [6, 8]) {
  b.add('brick_2x6', X0, 18, z, 1, ROOF)
  b.add('brick_2x4', 9, 18, z, 1, ROOF)
}
// Tier 2 (y = 21) completes the ridge.
for (const [x, part] of slopeRow) {
  b.add(part, x, 21, 6, 2, ROOF)
  b.add(part, x, 21, 8, 0, ROOF)
}

export const houseSmall = b.done({
  id: 'house_small',
  name: { vi: 'Nhà nhỏ', en: 'Small house' },
  difficulty: 2,
  kind: 'building',
  tags: ['house'],
  baseplate: { w: 16, d: 16 },
})
