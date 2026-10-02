import { describe, expect, it } from 'vitest'
import { PARTS, PART_BY_ID, PART_CATEGORIES, getPart } from './catalog'
import { PRINT_BY_ID } from '../prints'

describe('part catalog', () => {
  it('has 69 unique part ids', () => {
    expect(PARTS).toHaveLength(69)
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(69)
  })

  it('every part has w, d, h >= 1 as integers', () => {
    for (const p of PARTS) {
      for (const n of [p.w, p.d, p.h]) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('every part category is listed in PART_CATEGORIES', () => {
    for (const p of PARTS) expect(PART_CATEGORIES).toContain(p.category)
    expect(PART_CATEGORIES).toEqual([
      'brick', 'plate', 'slope', 'round', 'door_window', 'wheel', 'furniture', 'nature', 'decor', 'figure',
    ])
  })

  it('PART_BY_ID indexes every part', () => {
    expect(Object.keys(PART_BY_ID)).toHaveLength(69)
    for (const p of PARTS) expect(PART_BY_ID[p.id]).toBe(p)
  })

  it('getPart returns a part and throws on unknown id', () => {
    expect(getPart('brick_2x4')).toMatchObject({ w: 2, d: 4, h: 3, studs: true, sym: 2 })
    expect(() => getPart('nope')).toThrow()
  })

  it('matches spec for representative parts', () => {
    expect(getPart('slope_2x4')).toMatchObject({ shape: 'slope', w: 4, d: 2, h: 3, sym: 1 })
    expect(getPart('tile_2x2')).toMatchObject({ shape: 'tile', h: 1, studs: false, sym: 4 })
    expect(getPart('cone_1x1')).toMatchObject({ shape: 'cone', studs: false, sym: 4 })
    expect(getPart('door_1x4x6')).toMatchObject({ w: 4, d: 1, h: 18, sym: 1 })
    expect(getPart('wheel_large')).toMatchObject({ w: 2, d: 3, h: 8, sym: 2, tags: ['wheel'] })
    expect(getPart('lamp_1x1')).toMatchObject({ h: 12, sym: 4 })
    expect(getPart('flower_1x1')).toMatchObject({ category: 'nature', h: 2, sym: 4 })
  })

  it('has the rocket, police and furniture parts', () => {
    expect(getPart('cone_2x2')).toMatchObject({ category: 'round', w: 2, d: 2, h: 6, studs: false, sym: 4 })
    expect(getPart('dish_2x2')).toMatchObject({ w: 2, d: 2, h: 2, studs: false, sym: 4 })
    expect(getPart('antenna_1x1')).toMatchObject({ w: 1, d: 1, h: 6, studs: false, sym: 4 })
    expect(getPart('bars_1x4x3')).toMatchObject({ category: 'door_window', w: 4, d: 1, h: 9, sym: 2 })
    expect(getPart('steering_1x2')).toMatchObject({ category: 'furniture', w: 2, d: 1, h: 3, sym: 1 })
    expect(getPart('computer_1x2')).toMatchObject({ category: 'furniture', w: 2, d: 1, h: 4, sym: 1, print: 'screen' })
    expect(getPart('bed_2x4')).toMatchObject({ category: 'furniture', w: 2, d: 4, h: 3, sym: 1 })
    expect(getPart('flag_1x2')).toMatchObject({ category: 'decor', w: 2, d: 1, h: 9, sym: 1 })
    expect(getPart('fin_1x3')).toMatchObject({ w: 1, d: 3, h: 6, studs: false, sym: 1 })
    expect(getPart('engine_2x2')).toMatchObject({ w: 2, d: 2, h: 3, studs: false, sym: 4 })
  })

  it('has flat printed tiles in the decor category, long side along X', () => {
    const printed = PARTS.filter((p) => p.shape === 'tile_print')
    expect(printed.map((p) => p.id)).toEqual([
      'print_police_2x2', 'print_fire_2x2', 'print_clock_2x2', 'print_stop_2x2', 'print_arrow_2x2',
      'print_menu_1x2', 'print_screen_1x2', 'print_eyes_1x2', 'print_number_1x2',
      'print_heart_1x1', 'print_star_1x1', 'print_fish_1x1',
    ])
    for (const p of printed) {
      // A print looks different after a quarter turn, so no rotational symmetry.
      expect(p, p.id).toMatchObject({ category: 'decor', h: 1, studs: false, sym: 1 })
      expect(p.w, p.id).toBeGreaterThanOrEqual(p.d)
      expect(p.print, p.id).toBeDefined()
    }
    expect(getPart('print_menu_1x2')).toMatchObject({ w: 2, d: 1 })
    expect(getPart('print_heart_1x1')).toMatchObject({ w: 1, d: 1 })
  })

  it('has upright shop sign boards with a print on both faces', () => {
    const boards = PARTS.filter((p) => p.id.startsWith('board_'))
    expect(boards.map((p) => p.id)).toEqual([
      'board_sushi_1x6', 'board_bakery_1x6', 'board_toys_1x6', 'board_grocery_1x6', 'board_taxi_1x2',
    ])
    for (const p of boards) {
      expect(p, p.id).toMatchObject({ category: 'decor', shape: 'box', d: 1, studs: false, sym: 1 })
      expect(PRINT_BY_ID[p.print!], p.id).toMatchObject({ w: 2, h: 1 })
    }
  })

  it('every print a part carries exists and has the size of the area it is drawn on', () => {
    for (const p of PARTS.filter((q) => q.print)) {
      const print = PRINT_BY_ID[p.print!]
      expect(print, p.id).toBeDefined()
      if (p.shape === 'tile_print') expect([print.w, print.h], p.id).toEqual([p.w, p.d])
    }
  })
})
