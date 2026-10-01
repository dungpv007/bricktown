import { describe, expect, it } from 'vitest'
import { nextCapacity } from './instanceCapacity'

describe('nextCapacity', () => {
  it('starts at the minimum and doubles to fit', () => {
    expect(nextCapacity(0, 0, 8)).toBe(8)
    expect(nextCapacity(0, 8, 8)).toBe(8)
    expect(nextCapacity(0, 9, 8)).toBe(16)
    expect(nextCapacity(0, 100, 8)).toBe(128)
    expect(nextCapacity(8, 33, 8)).toBe(64)
  })

  it('does not change while the count stays inside the buffer', () => {
    expect(nextCapacity(64, 64, 8)).toBe(64)
    expect(nextCapacity(64, 17, 8)).toBe(64)
  })

  it('adding and removing across a power of two does not flip the size back and forth', () => {
    let cap = nextCapacity(0, 16, 16)
    const seen = new Set<number>([cap])
    for (const count of [17, 16, 17, 16, 17, 16]) {
      cap = nextCapacity(cap, count, 16)
      seen.add(cap)
    }
    expect([...seen]).toEqual([16, 32])
    expect(cap).toBe(32)
  })

  it('shrinks only once the count is down to a quarter, keeping headroom', () => {
    expect(nextCapacity(128, 33, 8)).toBe(128)
    expect(nextCapacity(128, 32, 8)).toBe(64)
    expect(nextCapacity(128, 5, 8)).toBe(16)
    expect(nextCapacity(128, 0, 8)).toBe(8)
  })

  it('never goes below the minimum', () => {
    expect(nextCapacity(8, 0, 8)).toBe(8)
    expect(nextCapacity(16, 0, 16)).toBe(16)
  })

  it('always fits the count', () => {
    let cap = 0
    for (const count of [3, 50, 7, 300, 2, 0, 64, 65, 1000, 10]) {
      cap = nextCapacity(cap, count, 8)
      expect(cap).toBeGreaterThanOrEqual(count)
    }
  })
})
