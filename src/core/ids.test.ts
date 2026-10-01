import { describe, expect, it } from 'vitest'
import { newId } from './ids'

describe('newId', () => {
  it('is unique in practice', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) seen.add(newId())
    expect(seen.size).toBe(5000)
  })
  it('applies a prefix', () => {
    expect(newId('b').startsWith('b_')).toBe(true)
  })
})
