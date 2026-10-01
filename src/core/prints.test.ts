import { describe, expect, it } from 'vitest'
import { PRINTS, PRINT_ATLAS, PRINT_BY_ID, printRect, printUv } from './prints'

describe('print registry', () => {
  it('has unique ids, each with a whole-cell size', () => {
    expect(new Set(PRINTS.map((p) => p.id)).size).toBe(PRINTS.length)
    for (const p of PRINTS) {
      expect(Number.isInteger(p.w) && p.w >= 1, p.id).toBe(true)
      expect(Number.isInteger(p.h) && p.h >= 1, p.id).toBe(true)
      expect(PRINT_BY_ID[p.id]).toBe(p)
    }
  })

  it('has the printed-tile designs', () => {
    expect(PRINTS.map((p) => p.id)).toEqual(
      expect.arrayContaining(['police', 'fire', 'clock', 'stop', 'arrow', 'menu', 'screen', 'robot_eyes', 'number_112', 'heart', 'star']),
    )
  })

  it('packs every print inside the atlas without overlaps', () => {
    const used = new Set<string>()
    for (const p of PRINTS) {
      const r = printRect(p.id)
      expect([r.w, r.h], p.id).toEqual([p.w, p.h])
      expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= PRINT_ATLAS.cols && r.y + r.h <= PRINT_ATLAS.rows, p.id).toBe(true)
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let y = r.y; y < r.y + r.h; y++) {
          const cell = `${x},${y}`
          expect(used.has(cell), `${p.id} overlaps at ${cell}`).toBe(false)
          used.add(cell)
        }
      }
    }
  })

  it('maps a print to its rectangle in texture space (v = 1 is the top row of the atlas canvas)', () => {
    for (const p of PRINTS) {
      const r = printRect(p.id)
      const uv = printUv(p.id)
      expect(uv.u0).toBeCloseTo(r.x / PRINT_ATLAS.cols, 6)
      expect(uv.u1).toBeCloseTo((r.x + r.w) / PRINT_ATLAS.cols, 6)
      expect(uv.v1).toBeCloseTo(1 - r.y / PRINT_ATLAS.rows, 6)
      expect(uv.v0).toBeCloseTo(1 - (r.y + r.h) / PRINT_ATLAS.rows, 6)
      for (const v of [uv.u0, uv.u1, uv.v0, uv.v1]) expect(v >= 0 && v <= 1, p.id).toBe(true)
    }
  })

  it('throws for an unknown print id', () => {
    expect(() => printRect('nope')).toThrow()
    expect(() => printUv('nope')).toThrow()
  })
})
