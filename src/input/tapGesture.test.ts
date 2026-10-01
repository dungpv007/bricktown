import { describe, expect, it } from 'vitest'
import { isTap, TAP_MAX_MS, TAP_MAX_PX, type TapDown } from './tapGesture'

const down: TapDown = { x: 100, y: 200, t: 1000, button: 0 }
const upAt = (dx: number, dy: number, dt: number) => ({ x: 100 + dx, y: 200 + dy, t: 1000 + dt })

describe('isTap', () => {
  it('a quick, still, single primary press is a tap', () => {
    expect(isTap(down, upAt(0, 0, 80), false)).toBe(true)
  })

  it('allows up to the time limit, not beyond', () => {
    expect(isTap(down, upAt(0, 0, TAP_MAX_MS), false)).toBe(true)
    expect(isTap(down, upAt(0, 0, TAP_MAX_MS + 1), false)).toBe(false)
  })

  it('allows small jitter but not 8px of movement', () => {
    expect(isTap(down, upAt(5, 5, 50), false)).toBe(true) // ~7.07px
    expect(isTap(down, upAt(TAP_MAX_PX, 0, 50), false)).toBe(false)
    expect(isTap(down, upAt(0, -30, 50), false)).toBe(false)
  })

  it('a gesture that involved a second pointer (pinch) is never a tap', () => {
    expect(isTap(down, upAt(0, 0, 50), true)).toBe(false)
  })

  it('only the primary button taps (right/middle drag pans)', () => {
    expect(isTap({ ...down, button: 2 }, upAt(0, 0, 50), false)).toBe(false)
    expect(isTap({ ...down, button: 1 }, upAt(0, 0, 50), false)).toBe(false)
  })
})
