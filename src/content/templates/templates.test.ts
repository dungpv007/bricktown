import { describe, expect, it } from 'vitest'
import { Occupancy } from '../../core/occupancy'
import { footprint } from '../../core/rotation'
import { PART_BY_ID } from '../../core/parts/catalog'
import { validateTemplate } from '../../core/template'
import { TEMPLATES, getTemplate } from './index'

const MAX_BRICKS: Record<string, number> = {
  tree: 8, lamp: 6, bench: 10, bush_flowers: 10,
  car: 30, police_car: 40, truck: 60, fire_truck: 60,
  house_small: 120, house_blue: 220, house_tall: 220,
  restaurant: 220, garage: 220, fire_station: 220, police_station: 220,
}

const MAX_STEP_SIZE = 6

describe('templates', () => {
  it('ships the Phase 1 templates with unique ids, easiest first', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(Object.keys(MAX_BRICKS).sort())
    const keys = TEMPLATES.map((t) => [t.difficulty, t.name.en] as const)
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])))
    expect(getTemplate('car')?.kind).toBe('vehicle')
    expect(getTemplate('nope')).toBeUndefined()
  })

  for (const t of TEMPLATES) {
    describe(t.id, () => {
      it('passes validateTemplate', () => {
        expect(validateTemplate(t)).toEqual([])
      })
      it('stays within its brick budget', () => {
        expect(t.bricks.length).toBeGreaterThan(0)
        expect(t.bricks.length).toBeLessThanOrEqual(MAX_BRICKS[t.id])
      })
      it('has stable, deterministic brick ids', () => {
        expect(t.bricks.map((b) => b.id)).toEqual(t.bricks.map((_, i) => `${t.id}-${i}`))
      })
      it('has no empty steps and at most 6 bricks per step on a single layer', () => {
        for (const step of t.steps) {
          expect(step.length).toBeGreaterThan(0)
          expect(step.length).toBeLessThanOrEqual(MAX_STEP_SIZE)
          expect(new Set(step.map((i) => t.bricks[i].y)).size).toBe(1)
        }
      })
      it('can be built in any order within a step (support comes from earlier steps only)', () => {
        const done = new Occupancy()
        for (const step of t.steps) {
          for (const i of step) expect(done.isSupported(t.bricks[i])).toBe(true)
          for (const i of step) done.add(t.bricks[i])
        }
      })
      it('keeps bricks inside the baseplate and respects the budget for its kind', () => {
        for (const b of t.bricks) {
          const { fx, fz } = footprint(PART_BY_ID[b.p], b.r)
          expect(b.x + fx).toBeLessThanOrEqual(t.baseplate.w)
          expect(b.z + fz).toBeLessThanOrEqual(t.baseplate.d)
        }
        if (t.kind === 'building') expect(t.bricks.length).toBeLessThanOrEqual(220)
        if (t.kind === 'vehicle') expect(t.bricks.length).toBeLessThanOrEqual(60)
      })
    })
  }

  it('car: four wheels at y=0, forward is -Z (hood in front of the windshield)', () => {
    const car = getTemplate('car')!
    const wheels = car.bricks.filter((b) => b.p === 'wheel_small')
    expect(wheels).toHaveLength(4)
    expect(wheels.every((w) => w.y === 0)).toBe(true)
    const minZ = (p: string) => Math.min(...car.bricks.filter((b) => b.p === p).map((b) => b.z))
    expect(minZ('brick_2x4')).toBeLessThan(minZ('window_1x2x2'))
    expect(car.bricks.filter((b) => b.p === 'window_1x2x2').every((b) => b.c === 15)).toBe(true)
  })

  it('vehicles: wheels on the ground at the corners, hood (-Z) in front of the windshield', () => {
    for (const [id, wheelPart, wheelCount] of [
      ['police_car', 'wheel_small', 4],
      ['fire_truck', 'wheel_small', 6],
      ['truck', 'wheel_large', 4],
    ] as const) {
      const t = getTemplate(id)!
      expect(t.kind).toBe('vehicle')
      const wheels = t.bricks.filter((b) => b.p === wheelPart)
      expect(wheels).toHaveLength(wheelCount)
      expect(wheels.every((w) => w.y === 0)).toBe(true)
      const front = Math.min(...wheels.map((w) => w.z))
      const rear = Math.max(...wheels.map((w) => w.z))
      expect(rear - front).toBeGreaterThanOrEqual(6)
      const windshieldZ = Math.min(...t.bricks.filter((b) => b.p.startsWith('window')).map((b) => b.z))
      const hoodZ = Math.min(...t.bricks.filter((b) => b.p === 'brick_2x4').map((b) => b.z))
      expect(hoodZ).toBeLessThan(windshieldZ)
    }
  })

  it('buildings: floor and furniture come before any wall, in steps of at most 6', () => {
    const buildings = TEMPLATES.filter((t) => t.kind === 'building' && t.id !== 'house_small')
    expect(buildings.map((t) => t.id)).toEqual(
      expect.arrayContaining(['house_blue', 'house_tall', 'restaurant', 'garage', 'fire_station', 'police_station']),
    )
    for (const t of buildings) {
      const firstWall = t.steps.findIndex((step) => step.some((i) => t.bricks[i].p.startsWith('brick_1x')))
      expect(firstWall).toBeGreaterThan(1)
      const early = t.steps.slice(0, firstWall).flat().map((i) => t.bricks[i])
      expect(early.some((b) => b.p.startsWith('plate_') && b.y === 0)).toBe(true)
      expect(early.some((b) => PART_BY_ID[b.p].category === 'furniture')).toBe(true)
      expect(early.every((b) => b.p.startsWith('plate_') || !['window', 'door'].includes(PART_BY_ID[b.p].shape))).toBe(true)
    }
  })

  it('restaurant: tagged, with tables, chairs, counter, stove and fridge inside and a door in front', () => {
    const r = getTemplate('restaurant')!
    expect(r.tags).toContain('restaurant')
    expect(r.baseplate).toEqual({ w: 32, d: 32 })
    for (const p of ['table_2x2', 'chair_1x1', 'counter_1x2', 'stove_1x2', 'fridge_1x1', 'sign_1x2', 'door_1x4x6']) {
      expect(r.bricks.some((b) => b.p === p)).toBe(true)
    }
    const door = r.bricks.find((b) => b.p === 'door_1x4x6')!
    expect(door.z).toBe(Math.min(...r.bricks.map((b) => b.z)))
  })

  it('tags: garage, fire_station and police stations and vehicles', () => {
    expect(getTemplate('garage')?.tags).toContain('garage')
    expect(getTemplate('fire_station')?.tags).toContain('fire_station')
    expect(getTemplate('police_station')?.tags).toContain('police')
    expect(getTemplate('police_car')?.tags).toContain('police')
    expect(getTemplate('fire_truck')?.tags).toContain('fire')
  })
})
