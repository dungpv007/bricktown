import { figKey, isFigure } from './figures'
import { getPart } from './parts/catalog'
import { targetAnchor, type PickHit, type Vec3 } from './pick'
import { footprint } from './rotation'
import type { Brick, FigStyle, PartDef, Rot } from './types'
import { platesToWorld } from './units'

/**
 * How close on screen (CSS pixels, about a fingertip) the finger must come to a target for Easy mode
 * to snap the dragged piece there. Measured on screen so targets high up a tall build snap too.
 */
export const SNAP_PX = 64

export interface ScreenPoint { x: number; y: number }
/** Where a world point appears on screen. */
export type ScreenProjection = (p: Vec3) => ScreenPoint

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

/** The 8 corners (world units) of the box `brick` fills. */
export function brickCorners(brick: Brick): Vec3[] {
  const part = getPart(brick.p)
  const { fx, fz } = footprint(part, brick.r)
  const y0 = platesToWorld(brick.y)
  const y1 = platesToWorld(brick.y + part.h)
  const out: Vec3[] = []
  for (const x of [brick.x, brick.x + fx]) for (const y of [y0, y1]) for (const z of [brick.z, brick.z + fz]) out.push([x, y, z])
  return out
}

/**
 * Easy-mode magnet: the target whose on-screen box (the bounds of its projected corners) is nearest
 * to `finger`, if it is at most `maxPx` away; null otherwise. With the finger inside several boxes the
 * one whose centre is nearer wins; exact ties go to the earlier target (step order).
 */
export function snapTargetOnScreen(
  targets: readonly Brick[],
  finger: ScreenPoint,
  project: ScreenProjection,
  maxPx: number,
): Brick | null {
  let best: Brick | null = null
  let bestEdge = Infinity
  let bestCentre = Infinity
  for (const t of targets) {
    const pts = brickCorners(t).map(project)
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const [l, r, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const edge = Math.hypot(Math.max(l - finger.x, 0, finger.x - r), Math.max(top - finger.y, 0, finger.y - bottom))
    const centre = Math.hypot((l + r) / 2 - finger.x, (top + bottom) / 2 - finger.y)
    if (edge > maxPx) continue
    if (edge < bestEdge || (edge === bestEdge && centre < bestCentre)) {
      best = t
      bestEdge = edge
      bestCentre = centre
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
