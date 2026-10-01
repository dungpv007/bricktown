import { describe, expect, it } from 'vitest'
import { composeBlueprint } from './blueprint'
import type { Blueprint, Brick, WorkshopState } from './types'

const brick: Brick = { id: 'b1', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 }
const workshop: WorkshopState = { kind: 'building', baseplate: { w: 16, d: 16 }, bricks: [brick] }

describe('composeBlueprint', () => {
  it('creates a new blueprint from the workshop', () => {
    const bp = composeBlueprint({ name: ' Nhà 1 ', workshop, id: 'bp1', now: 100 })
    expect(bp).toEqual({
      id: 'bp1',
      name: 'Nhà 1',
      kind: 'building',
      tags: [],
      baseplate: { w: 16, d: 16 },
      bricks: [brick],
      createdAt: 100,
      updatedAt: 100,
    })
  })

  it('keeps identity, tags and origin when updating an existing blueprint', () => {
    const existing: Blueprint = {
      id: 'bp9',
      name: 'Old',
      kind: 'vehicle',
      tags: ['fast'],
      baseplate: { w: 8, d: 16 },
      bricks: [],
      createdAt: 5,
      updatedAt: 6,
      templateId: 'car',
    }
    const bp = composeBlueprint({ name: 'New', workshop, id: 'ignored', now: 200, existing })
    expect(bp.id).toBe('bp9')
    expect(bp.createdAt).toBe(5)
    expect(bp.updatedAt).toBe(200)
    expect(bp.tags).toEqual(['fast'])
    expect(bp.templateId).toBe('car')
    expect(bp.name).toBe('New')
    expect(bp.kind).toBe('building')
    expect(bp.bricks).toEqual([brick])
  })

  it('does not alias the workshop bricks array', () => {
    const bp = composeBlueprint({ name: 'x', workshop, id: 'bp1', now: 1 })
    expect(bp.bricks).not.toBe(workshop.bricks)
  })
})
