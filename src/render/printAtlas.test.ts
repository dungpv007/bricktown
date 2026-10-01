import { describe, expect, it } from 'vitest'
import { PRINTS, PRINT_ATLAS, printRect } from '../core/prints'
import { PRINT_DRAWERS, createPrintTexture, drawPrintAtlas } from './printAtlas'

/** A stand-in 2D context that accepts every call, recording translations and draw calls. */
function fakeContext() {
  const calls: string[] = []
  const gradient = { addColorStop: () => undefined }
  const target: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 10 }),
    translate: (x: number, y: number) => calls.push(`translate ${x},${y}`),
  }
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key]
      return (...args: unknown[]) => {
        calls.push(key)
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${key}: non-finite argument`)
      }
    },
    set(t, key: string, value) {
      t[key] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('print atlas', () => {
  it('has exactly one drawer per registered print', () => {
    expect(Object.keys(PRINT_DRAWERS).sort()).toEqual(PRINTS.map((p) => p.id).sort())
  })

  it('draws each print inside its own atlas rectangle, without errors', () => {
    const { ctx, calls } = fakeContext()
    drawPrintAtlas(ctx)
    for (const p of PRINTS) {
      const r = printRect(p.id)
      expect(calls, p.id).toContain(`translate ${r.x * PRINT_ATLAS.cellPx},${r.y * PRINT_ATLAS.cellPx}`)
    }
    expect(calls.filter((c) => c === 'fill').length).toBeGreaterThanOrEqual(PRINTS.length)
  })

  it('makes no texture without a DOM canvas', () => {
    expect(createPrintTexture()).toBeNull()
  })
})
