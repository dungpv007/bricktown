import { describe, expect, it } from 'vitest'
import { classifyTwoFinger, shove, twist } from './twoFingerCamera'

const pair = (ax: number, ay: number, bx: number, by: number) => ({ ax, ay, bx, by })

describe('twoFingerCamera', () => {
  it('measures a clockwise twist as positive, across the -PI / PI seam too', () => {
    expect(twist(pair(0, 0, 100, 0), pair(0, 0, 100, 10))).toBeCloseTo(Math.atan2(10, 100))
    expect(twist(pair(0, 0, -100, 1), pair(0, 0, -100, -1))).toBeCloseTo(-twist(pair(0, 0, -100, -1), pair(0, 0, -100, 1)))
    expect(Math.abs(twist(pair(0, 0, -100, 1), pair(0, 0, -100, -1)))).toBeLessThan(0.1)
  })

  it('measures the mean vertical travel', () => {
    expect(shove(pair(0, 0, 100, 0), pair(0, 20, 100, 10))).toBe(15)
  })

  it('waits until the fingers moved, then tells a side-by-side push (tilt) from a twist or pinch (turn)', () => {
    const start = pair(100, 300, 200, 300)
    expect(classifyTwoFinger(start, pair(103, 303, 198, 302))).toBe('undecided')
    expect(classifyTwoFinger(start, pair(101, 270, 202, 272))).toBe('tilt')
    expect(classifyTwoFinger(start, pair(100, 284, 200, 292))).toBe('tilt') // one finger a step behind
    expect(classifyTwoFinger(start, pair(100, 270, 200, 296))).toBe('turn') // one finger nearly still
    expect(classifyTwoFinger(start, pair(80, 300, 220, 300))).toBe('turn') // pinch out
    expect(classifyTwoFinger(start, pair(100, 280, 200, 320))).toBe('turn') // twist
    expect(classifyTwoFinger(start, pair(130, 300, 230, 300))).toBe('turn') // pan sideways
    // One finger above the other: a vertical drag is a pan, not a tilt.
    expect(classifyTwoFinger(pair(150, 200, 150, 400), pair(150, 170, 150, 370))).toBe('turn')
  })
})
