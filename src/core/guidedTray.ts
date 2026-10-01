import { figKey, isFigure } from './figures'
import { getPart } from './parts/catalog'
import { targetAnchor, type PickHit } from './pick'
import { footprint } from './rotation'
import type { Brick, FigStyle, PartDef, Rot } from './types'
import { platesToWorld } from './units'

/** How close (world units = studs) a dragged piece must come to a target for Easy mode to snap it there. */
export const SNAP_RADIUS = 3

/** One card of the Guided tray: a part in one colour (a figure: in one look) and the bricks it stands for. */
export interface TrayCard {
  /** Stable while the step lasts: `part-colour` (plus the look, for figures). */
  key: string
  p: string
  c: number
  /** The figure's look, for a minifigure card. */
  fig?: FigStyle
  /** The bricks of this kind still to place, in step order. */
  bricks: Brick[]
}

/** Groups bricks into tray cards, in order of first appearance. */
export function trayCards(bricks: readonly Brick[]): TrayCard[] {
  const cards = new Map<string, TrayCard>()
  for (const b of bricks) {
    const fig = isFigure(b) && b.fig ? b.fig : undefined
    const key = fig ? `${b.p}-${b.c}-${figKey(fig)}` : `${b.p}-${b.c}`
    const card = cards.get(key)
    if (card) card.bricks.push(b)
    else cards.set(key, { key, p: b.p, c: b.c, ...(fig ? { fig } : {}), bricks: [b] })
  }
  return [...cards.values()]
}

/** Distance (world units) from `point` to the box `brick` fills; 0 on or inside it. */
export function distanceToBrick(point: readonly [number, number, number], brick: Brick): number {
  const part = getPart(brick.p)
  const { fx, fz } = footprint(part, brick.r)
  const gap = (v: number, lo: number, hi: number) => Math.max(lo - v, 0, v - hi)
  const dx = gap(point[0], brick.x, brick.x + fx)
  const dy = gap(point[1], platesToWorld(brick.y), platesToWorld(brick.y + part.h))
  const dz = gap(point[2], brick.z, brick.z + fz)
  return Math.hypot(dx, dy, dz)
}

/**
 * Easy-mode magnet: the target nearest to `point` (where the finger points in the scene) that is at
 * most `radius` away, or null. Ties go to the earlier target (step order).
 */
export function snapTarget(targets: readonly Brick[], point: readonly [number, number, number], radius: number): Brick | null {
  let best: Brick | null = null
  let bestDistance = Infinity
  for (const t of targets) {
    const d = distanceToBrick(point, t)
    if (d <= radius && d < bestDistance) {
      best = t
      bestDistance = d
    }
  }
  return best
}

/**
 * Normal mode: where a dragged piece at quarter turns `r` would go. Over a target ghost that is the
 * ghost's spot (the turn must still match); elsewhere the spot under the finger, as in the workshop.
 */
export function dropAnchor(hit: PickHit, ghost: Brick | null, part: PartDef, r: Rot): { x: number; y: number; z: number } {
  return ghost ? { x: ghost.x, y: ghost.y, z: ghost.z } : targetAnchor(hit, part, r)
}
