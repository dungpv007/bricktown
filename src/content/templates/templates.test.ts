import { describe, expect, it } from 'vitest'
import { validateTemplate } from '../../core/template'
import { TEMPLATES, getTemplate } from './index'

const MAX_BRICKS: Record<string, number> = { tree: 8, lamp: 6, bench: 10, car: 30, house_small: 120 }

describe('templates', () => {
  it('ships the five Phase 1 templates with unique ids', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['tree', 'lamp', 'bench', 'car', 'house_small'])
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
      it('has at most 4 bricks per step on a single layer', () => {
        for (const step of t.steps) {
          expect(step.length).toBeLessThanOrEqual(4)
          expect(new Set(step.map((i) => t.bricks[i].y)).size).toBe(1)
        }
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
})
