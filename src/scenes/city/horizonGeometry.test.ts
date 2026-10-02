import { describe, expect, it } from 'vitest'
import { horizonGeometry, horizonLayout } from './horizonGeometry'

describe('horizon scenery', () => {
  it('is one shared geometry within the triangle budget, with faces wound outwards', () => {
    const g = horizonGeometry()
    expect(horizonGeometry()).toBe(g)
    const index = g.getIndex()!
    expect(index.count / 3).toBeLessThan(20_000)
    // Every triangle's winding agrees with its stored normal (no inside-out faces).
    const pos = g.getAttribute('position')
    const nor = g.getAttribute('normal')
    let bad = 0
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      const e1 = [pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a)]
      const e2 = [pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a)]
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      if (n[0] * nor.getX(a) + n[1] * nor.getY(a) + n[2] * nor.getZ(a) <= 0) bad++
    }
    expect(bad).toBe(0)
  })

  it('surrounds bigger cities further out, with the far ground always deep in the fog', () => {
    const small = horizonLayout(24)
    const big = horizonLayout(64)
    expect(big.radius).toBeGreaterThan(small.radius)
    for (const l of [small, big]) {
      // Past the city's corners.
      expect(l.radius).toBeGreaterThan(l.center * Math.SQRT2)
      expect(l.fogFar).toBeGreaterThan(l.radius * 1.5)
      expect(l.groundHalf - l.center).toBeGreaterThan(l.fogFar)
    }
  })
})
