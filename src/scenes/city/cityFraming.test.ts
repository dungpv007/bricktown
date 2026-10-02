import { describe, expect, it } from 'vitest'
import { fitCityFrame, type FramingLens } from './cityFraming'

const lens = (aspect: number): FramingLens => ({
  fov: 45,
  aspect,
  tilt: 0.75,
  minDistance: 120,
  maxDistance: 340,
  window: { left: -0.94, right: 0.94, bottom: -0.62, top: 0.94 },
})
const square = (size: number): Array<[number, number, number]> => [
  [0, 0, 0],
  [size, 0, 0],
  [0, 0, size],
  [size, 0, size],
]

describe('fitCityFrame', () => {
  it('frames a whole town on a landscape screen, closer for a smaller one', () => {
    const big = fitCityFrame(square(256), lens(4 / 3))!
    const small = fitCityFrame(square(160), lens(4 / 3))!
    expect(big.fits).toBe(true)
    expect(small.fits).toBe(true)
    expect(small.distance).toBeLessThan(big.distance)
    expect(big.distance).toBeLessThanOrEqual(340)
    expect(big.target[0]).toBeCloseTo(128, 5)
    // The near (south) side looks bigger, and the drawer covers the bottom: the target sits south of the middle.
    expect(big.target[2]).toBeGreaterThan(128)
  })

  it('a town too wide for an upright phone gets the furthest view, centred on it', () => {
    const f = fitCityFrame(square(256), lens(412 / 891))!
    expect(f.fits).toBe(false)
    expect(f.distance).toBe(340)
    expect(f.target[0]).toBeCloseTo(128, 5)
  })

  it('nothing to show: no frame', () => {
    expect(fitCityFrame([], lens(1))).toBeNull()
  })
})
