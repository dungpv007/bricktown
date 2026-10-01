import { describe, expect, it } from 'vitest'
import { isFigure } from '../../core/figures'
import { MAX_HEIGHT_PLATES } from '../../core/model'
import { Occupancy } from '../../core/occupancy'
import { footprint } from '../../core/rotation'
import { PART_BY_ID } from '../../core/parts/catalog'
import { validateTemplate } from '../../core/template'
import type { Brick, Template } from '../../core/types'
import { TEMPLATES, getTemplate } from './index'

const MAX_BRICKS: Record<string, number> = {
  tree: 8, lamp: 6, bench: 10, bush_flowers: 10,
  car: 30, police_car: 40, truck: 60, fire_truck: 60,
  house_small: 120, house_blue: 220, house_tall: 220,
  restaurant: 220, garage: 220, fire_station: 220, police_station: 220,
  robot: 120, rocket: 250, police_hq: 300, skyscraper: 400,
}

const top = (b: Brick) => b.y + PART_BY_ID[b.p].h
const figures = (t: Template) => t.bricks.filter((b) => isFigure(b))
/** Index of the first step with a wall brick (1xN), or the step count when there is none. */
const firstWallStep = (t: Template) => {
  const i = t.steps.findIndex((step) => step.some((j) => t.bricks[j].p.startsWith('brick_1x')))
  return i < 0 ? t.steps.length : i
}
const stepOf = (t: Template, b: Brick) => t.steps.findIndex((step) => step.includes(t.bricks.indexOf(b)))

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
        if (t.kind === 'building') expect(t.bricks.length).toBeLessThanOrEqual(400)
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
      expect.arrayContaining([
        'house_blue', 'house_tall', 'restaurant', 'garage', 'fire_station', 'police_station', 'police_hq', 'skyscraper',
      ]),
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

  it('buildings: figures inside stand there before the walls go up', () => {
    for (const t of TEMPLATES.filter((tpl) => tpl.kind === 'building')) {
      const walls = t.bricks.filter((b) => b.p.startsWith('brick_1x'))
      const inside = (f: Brick) =>
        f.x > Math.min(...walls.map((w) => w.x)) && f.x < Math.max(...walls.map((w) => w.x)) &&
        f.z > Math.min(...walls.map((w) => w.z)) && f.z < Math.max(...walls.map((w) => w.z))
      for (const f of figures(t).filter(inside)) {
        expect(stepOf(t, f), `${t.id}: ${f.id}`).toBeLessThan(firstWallStep(t))
      }
    }
  })

  it('restaurant: a chef in the kitchen, a waiter, customers at the tables and a menu board', () => {
    const r = getTemplate('restaurant')!
    const style = (print: string) => figures(r).filter((f) => f.fig?.print === print)
    expect(style('chef')).toHaveLength(1)
    expect(style('apron')).toHaveLength(1)
    const counterZ = Math.min(...r.bricks.filter((b) => b.p === 'counter_1x2').map((b) => b.z))
    expect(style('chef')[0].z).toBeGreaterThan(counterZ) // behind the counter, by the stoves
    const tables = r.bricks.filter((b) => b.p === 'table_2x2')
    const customers = figures(r).filter((f) => !['chef', 'apron'].includes(f.fig!.print))
    expect(customers.length).toBeGreaterThanOrEqual(2)
    expect(customers.length).toBeLessThanOrEqual(4)
    // Each customer stands right beside a table.
    for (const c of customers) {
      expect(tables.some((t) => Math.abs(t.x + 1 - (c.x + 0.5)) <= 2.5 && Math.abs(t.z + 1 - (c.z + 0.5)) <= 2.5)).toBe(true)
    }
    expect(r.bricks.some((b) => b.p === 'print_menu_1x2')).toBe(true)
  })

  it('police_hq: on a gray plate, with a desk and computer, a jail cell holding the robber, sirens and officers', () => {
    const t = getTemplate('police_hq')!
    expect(t.kind).toBe('building')
    expect(t.difficulty).toBe(3)
    expect(t.tags).toContain('police')
    expect(t.baseplate).toEqual({ w: 32, d: 24, c: 24 })
    for (const p of ['computer_1x2', 'bars_1x4x3', 'bed_2x4', 'print_police_2x2', 'door_1x4x6', 'fence_1x4']) {
      expect(t.bricks.some((b) => b.p === p), p).toBe(true)
    }
    const sirens = t.bricks.filter((b) => b.p === 'round_1x1')
    expect(sirens.some((b) => b.c === 16)).toBe(true) // trans red
    expect(sirens.some((b) => b.c === 17)).toBe(true) // trans blue
    const officers = figures(t).filter((f) => f.fig?.print === 'police')
    expect(officers.length).toBeGreaterThanOrEqual(2)
    expect(officers.length).toBeLessThanOrEqual(3)
    const robbers = figures(t).filter((f) => f.fig?.print === 'stripes')
    expect(robbers).toHaveLength(1)
    // The robber is locked in: inside the box the cell's bars and bed span.
    const cell = t.bricks.filter((b) => b.p === 'bars_1x4x3' || b.p === 'bed_2x4')
    const ext = (b: Brick) => footprint(PART_BY_ID[b.p], b.r)
    const x0 = Math.min(...cell.map((b) => b.x))
    const z0 = Math.min(...cell.map((b) => b.z))
    const x1 = Math.max(...cell.map((b) => b.x + ext(b).fx))
    const z1 = Math.max(...cell.map((b) => b.z + ext(b).fz))
    const [robber] = robbers
    expect(robber.x).toBeGreaterThanOrEqual(x0)
    expect(robber.z).toBeGreaterThanOrEqual(z0)
    expect(robber.x + ext(robber).fx).toBeLessThanOrEqual(x1)
    expect(robber.z + ext(robber).fz).toBeLessThanOrEqual(z1)
  })

  it('skyscraper: eight floors of blue glass, a lobby door and an antenna and flag on the roof', () => {
    const t = getTemplate('skyscraper')!
    expect(t.kind).toBe('building')
    expect(t.difficulty).toBe(3)
    expect([16, 24]).toContain(t.baseplate.w)
    expect(t.baseplate.d).toBe(t.baseplate.w)
    const height = Math.max(...t.bricks.map(top))
    expect(height).toBeGreaterThanOrEqual(96)
    expect(height).toBeLessThanOrEqual(MAX_HEIGHT_PLATES)
    const windows = t.bricks.filter((b) => b.p.startsWith('window_'))
    expect(windows.filter((w) => w.c === 17).length).toBeGreaterThanOrEqual(8 * 4)
    // Glass on every floor: windows start at 8 or more different heights.
    expect(new Set(windows.map((w) => w.y)).size).toBeGreaterThanOrEqual(8)
    expect(t.bricks.some((b) => b.p === 'door_1x4x6' && b.y <= 1)).toBe(true)
    for (const p of ['antenna_1x1', 'flag_1x2']) {
      expect(t.bricks.filter((b) => b.p === p).every((b) => b.y > height - 30), p).toBe(true)
      expect(t.bricks.some((b) => b.p === p), p).toBe(true)
    }
  })

  it('rocket: a white and red rocket with nose cone, fins and engine by a launch tower, the astronaut on the gantry', () => {
    const t = getTemplate('rocket')!
    expect(t.difficulty).toBe(3)
    expect(t.baseplate).toMatchObject({ w: 16, d: 16 })
    const [cone] = t.bricks.filter((b) => b.p === 'cone_2x2')
    const [engine] = t.bricks.filter((b) => b.p === 'engine_2x2')
    expect(cone).toBeDefined()
    expect(engine).toBeDefined()
    expect([cone.x, cone.z]).toEqual([engine.x, engine.z]) // one rocket: the nose right above the engine
    expect(cone.y).toBeGreaterThan(engine.y + 20)
    const body = t.bricks.filter((b) => b.x === cone.x && b.z === cone.z && b.y > engine.y && b.y < cone.y)
    expect(body.some((b) => b.c === 0)).toBe(true)
    expect(body.some((b) => b.c === 2)).toBe(true)
    expect(t.bricks.filter((b) => b.p === 'fin_1x3').length).toBeGreaterThanOrEqual(3)
    expect(t.bricks.some((b) => b.p === 'print_star_1x1' || b.p === 'flag_1x2')).toBe(true)
    const astronauts = figures(t).filter((f) => f.fig?.hat === 'space')
    expect(astronauts).toHaveLength(1)
    expect(astronauts[0].y).toBeGreaterThan(12) // up on the gantry, not on the ground
  })

  it('robot: legs, body, arms and a head with printed eyes, an antenna on top and red chest lights', () => {
    const t = getTemplate('robot')!
    expect(t.kind).toBe('prop')
    expect(t.difficulty).toBe(2)
    expect([8, 16]).toContain(t.baseplate.w)
    const height = Math.max(...t.bricks.map(top))
    const [eyes] = t.bricks.filter((b) => b.p === 'print_eyes_1x2')
    expect(eyes).toBeDefined()
    expect(eyes.y).toBeGreaterThan(height * 0.6)
    const antenna = t.bricks.filter((b) => b.p === 'antenna_1x1')
    expect(antenna.length).toBeGreaterThan(0)
    expect(Math.max(...antenna.map(top))).toBe(height)
    const lights = t.bricks.filter((b) => b.c === 16)
    expect(lights.length).toBeGreaterThanOrEqual(2)
    expect(lights.every((b) => b.y > height * 0.3 && b.y < eyes.y)).toBe(true)
  })

  it('tags: garage, fire_station and police stations and vehicles', () => {
    expect(getTemplate('garage')?.tags).toContain('garage')
    expect(getTemplate('fire_station')?.tags).toContain('fire_station')
    expect(getTemplate('police_station')?.tags).toContain('police')
    expect(getTemplate('police_hq')?.tags).toContain('police')
    expect(getTemplate('police_car')?.tags).toContain('police')
    expect(getTemplate('fire_truck')?.tags).toContain('fire')
  })
})
