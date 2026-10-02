import { getTemplate } from '../../content/templates'
import { CELL, placementCells } from '../../core/city'
import type { Baseplate, Blueprint, BlueprintKind, CityState } from '../../core/types'

/**
 * Top-down map of a city for the import preview and the City's picker cards: grass, painted
 * ground (water, pavement, sand), roads, rails, and a coloured block per building, vehicle or prop.
 * Drawn on a 2D canvas (instant, no WebGL); '' without a canvas. Checked visually, not unit-tested
 * (needs a DOM).
 */

export const CITY_THUMB_SIZE = 240

/** Fewest cells across the picture, so one small house is not a blur filling it. */
const MIN_VIEW = 8
const GRASS ='#7cc66b'
const ROAD = '#5b6470'
const RAIL = '#8a5a2b'
const GROUND: Record<'water' | 'pavement' | 'sand', string> = { water: '#3b8fd9', pavement: '#c9ccd1', sand: '#ecd27a' }
const KIND_COLOR: Record<BlueprintKind, string> = { building: '#e3000b', vehicle: '#0055bf', prop: '#ffd500' }

export function cityThumbnail(city: CityState, blueprints: Blueprint[]): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = CITY_THUMB_SIZE
  canvas.height = CITY_THUMB_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const byId = new Map(blueprints.map((b) => [b.id, b]))
  const cellsOf = (keys: string[] | undefined) => (keys ?? []).map((key) => key.split(',').map(Number) as [number, number])
  const roads = cellsOf(city.roads)
  const rails = cellsOf(city.rails)
  const ground = (['water', 'pavement', 'sand'] as const).map((kind) => ({ color: GROUND[kind], cells: cellsOf(city.terrain?.[kind]) }))
  const drawn = [...roads, ...rails, ...ground.flatMap((g) => g.cells)]
  const blocks = city.placements.map((p) => {
    const template = p.source.startsWith('tpl:') ? getTemplate(p.source.slice(4)) : undefined
    const bp = byId.get(p.source)
    const plate: Baseplate = bp?.baseplate ?? template?.baseplate ?? { w: CELL, d: CELL }
    const { cw, cd } = placementCells(p, plate)
    return { cx: p.cx, cz: p.cz, cw, cd, color: KIND_COLOR[bp?.kind ?? template?.kind ?? 'building'] }
  })
  // Framed on what was built (a margin of one cell, at least MIN_VIEW cells), not the whole empty map.
  const xs = [...drawn.map(([x]) => x), ...blocks.flatMap((b) => [b.cx, b.cx + b.cw - 1])]
  const zs = [...drawn.map(([, z]) => z), ...blocks.flatMap((b) => [b.cz, b.cz + b.cd - 1])]
  const span = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 3 : city.size
  const view = Math.min(city.size, Math.max(MIN_VIEW, span))
  const centre = (vs: number[]) => (vs.length ? (Math.min(...vs) + Math.max(...vs) + 1) / 2 : city.size / 2)
  const clampOrigin = (c: number) => Math.min(Math.max(c - view / 2, 0), city.size - view)
  const ox = clampOrigin(centre(xs))
  const oz = clampOrigin(centre(zs))
  const cell = CITY_THUMB_SIZE / view

  ctx.fillStyle = GRASS
  ctx.fillRect(0, 0, CITY_THUMB_SIZE, CITY_THUMB_SIZE)
  const fill = (cells: Array<[number, number]>, color: string) => {
    ctx.fillStyle = color
    for (const [cx, cz] of cells) ctx.fillRect((cx - ox) * cell, (cz - oz) * cell, Math.ceil(cell), Math.ceil(cell))
  }
  for (const g of ground) fill(g.cells, g.color)
  fill(roads, ROAD)
  fill(rails, RAIL)
  const inset = Math.max(1, cell * 0.12)
  for (const b of blocks) {
    ctx.fillStyle = b.color
    ctx.fillRect((b.cx - ox) * cell + inset, (b.cz - oz) * cell + inset, b.cw * cell - 2 * inset, b.cd * cell - 2 * inset)
  }
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}
