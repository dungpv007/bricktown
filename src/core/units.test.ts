import { describe, expect, it } from 'vitest'
import { PLATES_PER_BRICK, platesToWorld } from './units'

describe('units', () => {
  it('one brick is 1.2 studs tall', () => {
    expect(platesToWorld(PLATES_PER_BRICK)).toBeCloseTo(1.2)
  })
})
