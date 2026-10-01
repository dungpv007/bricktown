import { describe, expect, it } from 'vitest'
import { createGestureTracker, isTap, TAP_MAX_MS, TAP_MAX_PX, type PointerSample, type TapDown } from './tapGesture'

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

describe('createGestureTracker', () => {
  const p = (pointerId: number, x: number, y: number, t: number, extra: Partial<PointerSample> = {}): PointerSample => ({
    pointerId, x, y, t, button: 0, isPrimary: pointerId === 1, ...extra,
  })

  it('a quick still press is a tap', () => {
    const g = createGestureTracker()
    expect(g.down(p(1, 10, 10, 0))).toBe(true)
    expect(g.up(p(1, 12, 11, 100))).toEqual({ ended: true, tap: true, multi: false })
  })

  it('a drag or a long press is not a tap', () => {
    const g = createGestureTracker()
    g.down(p(1, 10, 10, 0))
    expect(g.up(p(1, 40, 10, 100)).tap).toBe(false)
    g.down(p(1, 10, 10, 1000))
    expect(g.up(p(1, 10, 10, 1000 + TAP_MAX_MS + 50)).tap).toBe(false)
  })

  it('a second finger makes the gesture a pinch: neither release taps', () => {
    const g = createGestureTracker()
    g.down(p(1, 10, 10, 0))
    expect(g.down(p(2, 100, 10, 20))).toBe(false)
    expect(g.up(p(2, 100, 10, 60))).toEqual({ ended: false, tap: false, multi: true })
    expect(g.up(p(1, 10, 10, 80))).toEqual({ ended: true, tap: false, multi: true })
  })

  it('a lost pointerup does not block later taps (the next primary press starts afresh)', () => {
    const g = createGestureTracker()
    g.down(p(1, 10, 10, 0))
    g.down(p(2, 50, 10, 10)) // pinch...
    g.up(p(1, 10, 10, 50)) // ...finger 2's release never arrives
    expect(g.down(p(3, 10, 10, 500, { isPrimary: true }))).toBe(true)
    expect(g.up(p(3, 10, 10, 560))).toEqual({ ended: true, tap: true, multi: false })
  })

  it('a cancelled pointer ends its gesture without a tap', () => {
    const g = createGestureTracker()
    g.down(p(1, 10, 10, 0))
    g.cancel(1)
    expect(g.up(p(1, 10, 10, 50))).toEqual({ ended: false, tap: false, multi: false })
    expect(g.down(p(4, 10, 10, 100, { isPrimary: false }))).toBe(true) // nothing left active
  })

  it('a right-button press never taps', () => {
    const g = createGestureTracker()
    g.down(p(1, 10, 10, 0, { button: 2 }))
    expect(g.up(p(1, 10, 10, 50)).tap).toBe(false)
  })
})
