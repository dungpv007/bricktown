import { describe, expect, it } from 'vitest'
import { gestureIntent, type GestureFacts } from './gestureIntent'

const facts = (f: Partial<GestureFacts>): GestureFacts => ({
  start: 'plate', pointers: 1, primary: true, moved: false, tap: false, ...f,
})

describe('gestureIntent', () => {
  it('a tap selects a brick, quick-places on the plate and deselects on the sky', () => {
    expect(gestureIntent(facts({ start: 'brick', tap: true }))).toBe('tap-select')
    expect(gestureIntent(facts({ start: 'plate', tap: true }))).toBe('tap-place')
    expect(gestureIntent(facts({ start: 'sky', tap: true }))).toBe('tap-deselect')
  })

  it('one finger moving from a brick drags the brick; from anywhere else it orbits', () => {
    expect(gestureIntent(facts({ start: 'brick', moved: true }))).toBe('drag-brick')
    expect(gestureIntent(facts({ start: 'plate', moved: true }))).toBe('orbit')
    expect(gestureIntent(facts({ start: 'sky', moved: true }))).toBe('orbit')
  })

  it('a press held still on a brick does nothing yet (the camera must not turn either)', () => {
    expect(gestureIntent(facts({ start: 'brick' }))).toBe('hold-brick')
    expect(gestureIntent(facts({ start: 'plate' }))).toBe('orbit')
  })

  it('a second finger always means pinch / pan, even from a brick', () => {
    for (const start of ['brick', 'plate', 'sky'] as const) {
      expect(gestureIntent(facts({ start, pointers: 2, moved: true }))).toBe('pinch')
      expect(gestureIntent(facts({ start, pointers: 2 }))).toBe('pinch')
    }
  })

  it('right / middle mouse buttons always move the camera', () => {
    expect(gestureIntent(facts({ start: 'brick', primary: false, moved: true }))).toBe('orbit')
    expect(gestureIntent(facts({ start: 'brick', primary: false }))).toBe('orbit')
  })
})
