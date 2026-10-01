import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('newId fallback', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('works when crypto.randomUUID is unavailable (insecure context)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) seen.add(newId())
    expect(seen.size).toBe(2000)
    expect(newId('b')).toMatch(/^b_[0-9a-f]{12}$/)
  })
})
