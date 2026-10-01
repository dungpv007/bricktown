import { describe, expect, it } from 'vitest'
import type { Blueprint } from '../core/types'
import { hornKind, hornKindForSource } from './horns'

const bp = (id: string, extra: Partial<Blueprint> = {}): Blueprint => ({
  id,
  name: id,
  kind: 'vehicle',
  tags: [],
  baseplate: { w: 6, d: 10 },
  bricks: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})

describe('hornKind', () => {
  it('picks a siren for police and fire vehicles, an air horn for trucks and buses, else the car horn', () => {
    expect(hornKind(['police'])).toBe('police')
    expect(hornKind(['fire'])).toBe('fire')
    expect(hornKind(['vehicle'], 'truck')).toBe('truck')
    expect(hornKind(['bus'])).toBe('truck')
    expect(hornKind(['vehicle'], 'car')).toBe('car')
    expect(hornKind([])).toBe('car')
  })
})

describe('hornKindForSource', () => {
  const none = { blueprints: [] }
  it('uses the ready-made template', () => {
    expect(hornKindForSource('tpl:police_car', none)).toBe('police')
    expect(hornKindForSource('tpl:fire_truck', none)).toBe('fire')
    expect(hornKindForSource('tpl:truck', none)).toBe('truck')
    expect(hornKindForSource('tpl:car', none)).toBe('car')
    expect(hornKindForSource('tpl:nope', none)).toBe('car')
  })
  it('gives a home-built vehicle the car horn, unless it was finished from a guided template', () => {
    const data = {
      blueprints: [bp('mine'), bp('guidedFire', { templateId: 'fire_truck' }), bp('tagged', { tags: ['police'] })],
    }
    expect(hornKindForSource('mine', data)).toBe('car')
    expect(hornKindForSource('guidedFire', data)).toBe('fire')
    expect(hornKindForSource('tagged', data)).toBe('police')
    expect(hornKindForSource('missing', data)).toBe('car')
  })
})
