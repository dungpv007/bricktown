import { describe, expect, it } from 'vitest'
import { cityGestureIntent, type CityGestureFacts } from './cityGestureIntent'

const facts = (f: Partial<CityGestureFacts>): CityGestureFacts => ({
  start: 'ground', roadMode: false, pointers: 1, primary: true, moved: false, tap: false, ended: false, ...f,
})

describe('cityGestureIntent', () => {
  it('a tap selects a placement, acts on the ground and deselects outside the city', () => {
    expect(cityGestureIntent(facts({ start: 'placement', tap: true, ended: true }))).toBe('tap-select')
    expect(cityGestureIntent(facts({ start: 'ground', tap: true, ended: true }))).toBe('tap-ground')
    expect(cityGestureIntent(facts({ start: 'outside', tap: true, ended: true }))).toBe('tap-deselect')
  })

  it('one finger moving from a placement moves it; from the ground it pans the camera', () => {
    expect(cityGestureIntent(facts({ start: 'placement', moved: true }))).toBe('drag-placement')
    expect(cityGestureIntent(facts({ start: 'ground', moved: true }))).toBe('pan')
    expect(cityGestureIntent(facts({ start: 'outside', moved: true }))).toBe('pan')
  })

  it('a still press on a placement holds the camera, and selects when released', () => {
    expect(cityGestureIntent(facts({ start: 'placement' }))).toBe('hold-placement')
    expect(cityGestureIntent(facts({ start: 'placement', ended: true }))).toBe('tap-select')
    expect(cityGestureIntent(facts({ start: 'ground' }))).toBe('pan')
  })

  it('two fingers always pinch, also in road mode and over a placement', () => {
    expect(cityGestureIntent(facts({ start: 'placement', pointers: 2, moved: true }))).toBe('pinch')
    expect(cityGestureIntent(facts({ roadMode: true, pointers: 2 }))).toBe('pinch')
  })

  it('road mode: one finger paints wherever it starts; other mouse buttons move the camera', () => {
    for (const start of ['placement', 'ground', 'outside'] as const) {
      expect(cityGestureIntent(facts({ roadMode: true, start, moved: true }))).toBe('road')
      expect(cityGestureIntent(facts({ roadMode: true, start, tap: true, ended: true }))).toBe('road')
    }
    expect(cityGestureIntent(facts({ roadMode: true, primary: false, moved: true }))).toBe('pan')
  })

  it('right / middle mouse buttons only move the camera', () => {
    expect(cityGestureIntent(facts({ start: 'placement', primary: false, moved: true }))).toBe('pan')
  })
})
