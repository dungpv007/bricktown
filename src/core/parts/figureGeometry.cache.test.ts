import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_FIG, figKey } from '../figures'
import type { FigStyle } from '../types'
import {
  FIGURE_CACHE_MAX, buildFigureGeometry, figureCacheSize, getFigureGeometry, peekFigureGeometry, setLiveFigureKeys,
} from './figureGeometry'

/** `n` distinct looks (torso and leg colours vary). */
const looks = (n: number, from = 0): FigStyle[] =>
  Array.from({ length: n }, (_, i) => ({ ...DEFAULT_FIG, torso: (from + i) % 16, legs: Math.floor((from + i) / 16) }))

const disposed = (style: FigStyle) => {
  const g = getFigureGeometry(style)
  const seen = { body: false, print: false }
  g.body.addEventListener('dispose', () => (seen.body = true))
  g.print.addEventListener('dispose', () => (seen.print = true))
  return seen
}

describe('figure geometry cache bound', () => {
  afterEach(() => setLiveFigureKeys(() => new Set()))

  it('keeps at most FIGURE_CACHE_MAX looks, evicting and disposing the least recently used', () => {
    const all = looks(FIGURE_CACHE_MAX + 10)
    const first = disposed(all[0])
    const second = disposed(all[1])
    for (const s of all.slice(2, FIGURE_CACHE_MAX)) getFigureGeometry(s)
    expect(figureCacheSize()).toBe(FIGURE_CACHE_MAX)
    const kept = getFigureGeometry(all[0]) // a hit makes it the most recently used
    getFigureGeometry(all[FIGURE_CACHE_MAX]) // one over: the oldest (all[1]) goes
    expect(figureCacheSize()).toBe(FIGURE_CACHE_MAX)
    expect(second).toEqual({ body: true, print: true })
    expect(first).toEqual({ body: false, print: false })
    expect(peekFigureGeometry(all[1])).toBeUndefined()
    expect(peekFigureGeometry(all[0])).toBe(kept)
    for (const s of all.slice(FIGURE_CACHE_MAX + 1)) getFigureGeometry(s)
    expect(figureCacheSize()).toBe(FIGURE_CACHE_MAX)
  })

  it('never evicts looks a scene still shows; it rebuilds an evicted look on demand', () => {
    const live = looks(3, 200)
    setLiveFigureKeys(() => new Set(live.map(figKey)))
    const liveGeoms = live.map(getFigureGeometry)
    const watched = live.map(disposed)
    const dropped = looks(1, 300)[0]
    const droppedGeom = getFigureGeometry(dropped)
    for (const s of looks(FIGURE_CACHE_MAX * 2, 400)) getFigureGeometry(s)
    expect(figureCacheSize()).toBe(FIGURE_CACHE_MAX)
    live.forEach((s, i) => expect(peekFigureGeometry(s)).toBe(liveGeoms[i]))
    for (const w of watched) expect(w).toEqual({ body: false, print: false })
    const rebuilt = getFigureGeometry(dropped)
    expect(rebuilt).not.toBe(droppedGeom)
    expect(rebuilt.body.getAttribute('position').count).toBe(droppedGeom.body.getAttribute('position').count)
  })

  it('grows past the bound rather than drop a live look', () => {
    const live = looks(FIGURE_CACHE_MAX + 4, 1000)
    setLiveFigureKeys(() => new Set(live.map(figKey)))
    for (const s of live) getFigureGeometry(s)
    expect(figureCacheSize()).toBe(FIGURE_CACHE_MAX + 4)
  })

  it('buildFigureGeometry neither reads nor fills the cache', () => {
    const style = looks(1, 5000)[0]
    const own = buildFigureGeometry(style)
    expect(peekFigureGeometry(style)).toBeUndefined()
    expect(getFigureGeometry(style)).not.toBe(own)
    own.body.dispose()
    own.print.dispose()
  })
})
