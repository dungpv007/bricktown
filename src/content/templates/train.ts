import type { Builder } from './builder'

/**
 * What the train engine and carriage share: 6 studs wide (x 1..6, centred on an 8-stud rail cell)
 * and 16 long, eight wheels on two bogies (z 2..5 and 10..13) on the ground, and a chassis of
 * plates on top of them (y = 5), each plate resting on a wheel. Forward is -Z.
 */
export function trainBase(b: Builder, chassis: number): void {
  for (const z of [2, 4, 10, 12]) {
    b.add('wheel_small', 1, 0, z, 0, 1)
    b.add('wheel_small', 6, 0, z, 0, 1)
  }
  for (const z of [0, 8]) b.add('plate_4x8', 1, 5, z, 0, chassis)
  for (const z of [0, 4, 8, 12]) b.add('plate_2x4', 5, 5, z, 0, chassis)
}
