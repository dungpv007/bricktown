import { COLORS } from './colors'
import { newId } from './ids'
import { canPlace } from './model'
import { Occupancy } from './occupancy'
import { PART_BY_ID } from './parts/catalog'
import { rotEquivalent } from './rotation'
import type { Blueprint, Brick, GuidedState, LocalizedText, Template } from './types'

/**
 * Groups brick indices into build steps: layer by layer (y, then z, then x), at most `maxPerStep`
 * per step (values below 1 count as 1).
 */
export function autoSteps(bricks: Brick[], maxPerStep = 4): number[][] {
  const max = maxPerStep >= 1 ? Math.floor(maxPerStep) : 1
  const order = bricks
    .map((_, i) => i)
    .sort((a, b) => bricks[a].y - bricks[b].y || bricks[a].z - bricks[b].z || bricks[a].x - bricks[b].x)
  const steps: number[][] = []
  let current: number[] = []
  for (const i of order) {
    const startsNewLayer = current.length > 0 && bricks[current[0]].y !== bricks[i].y
    if (current.length >= max || startsNewLayer) {
      steps.push(current)
      current = []
    }
    current.push(i)
  }
  if (current.length > 0) steps.push(current)
  return steps
}

export type PlacedCandidate = Pick<Brick, 'p' | 'x' | 'y' | 'z' | 'r' | 'c'>

/** Same part, color and position, and a rotation that looks identical. */
export function matchesTarget(placed: PlacedCandidate, target: Brick): boolean {
  const part = PART_BY_ID[target.p]
  return (
    placed.p === target.p &&
    placed.c === target.c &&
    placed.x === target.x &&
    placed.y === target.y &&
    placed.z === target.z &&
    part !== undefined &&
    rotEquivalent(part, placed.r, target.r)
  )
}

/** The bricks of `step` that are not placed yet, in step order. */
function pendingOf(template: Template, step: number, placedIds: readonly string[]): Brick[] {
  const indices = template.steps[step] ?? []
  return indices.map((i) => template.bricks[i]).filter((b) => !placedIds.includes(b.id))
}

export function findMatch(
  template: Template,
  step: number,
  placedIds: readonly string[],
  candidate: PlacedCandidate,
): Brick | null {
  return pendingOf(template, step, placedIds).find((b) => matchesTarget(candidate, b)) ?? null
}

export function stepComplete(template: Template, step: number, placedIds: readonly string[]): boolean {
  return pendingOf(template, step, placedIds).length === 0
}

export function nextPending(template: Template, step: number, placedIds: readonly string[]): Brick | null {
  return pendingOf(template, step, placedIds)[0] ?? null
}

/** The template bricks the kid has already placed (never touches the free-build workshop model). */
export function placedBricks(template: Template, guided: GuidedState | null): Brick[] {
  if (!guided) return []
  return template.bricks.filter((b) => guided.placed.includes(b.id))
}

export function templateToBlueprint(template: Template, lang: keyof LocalizedText): Blueprint {
  const now = Date.now()
  return {
    id: newId('bp'),
    name: template.name[lang],
    kind: template.kind,
    tags: [...template.tags],
    baseplate: { ...template.baseplate },
    bricks: template.bricks.map((b) => ({ ...b })),
    createdAt: now,
    updatedAt: now,
    templateId: template.id,
  }
}

/** Returns a list of problems; an empty list means the template is sound. */
export function validateTemplate(t: Template): string[] {
  const problems: string[] = []

  const ids = new Set<string>()
  t.bricks.forEach((b, i) => {
    if (ids.has(b.id)) problems.push(`brick ${i}: duplicate id ${b.id}`)
    ids.add(b.id)
    if (!PART_BY_ID[b.p]) problems.push(`brick ${b.id}: unknown part ${b.p}`)
    if (!Number.isInteger(b.c) || b.c < 0 || b.c >= COLORS.length) {
      problems.push(`brick ${b.id}: color ${b.c} out of range`)
    }
  })

  const seen = new Map<number, number>()
  for (const step of t.steps) {
    for (const i of step) {
      if (!Number.isInteger(i) || i < 0 || i >= t.bricks.length) {
        problems.push(`step references unknown brick index ${i}`)
      } else {
        seen.set(i, (seen.get(i) ?? 0) + 1)
      }
    }
  }
  t.bricks.forEach((b, i) => {
    const n = seen.get(i) ?? 0
    if (n === 0) problems.push(`brick ${b.id}: not in any step`)
    else if (n > 1) problems.push(`brick ${b.id}: appears in ${n} steps`)
  })

  // Kids may place a step's bricks in any order, so each brick must fit using only the bricks of
  // earlier steps (support, bounds, collisions), and must not overlap another brick of its step.
  const earlier: Brick[] = []
  t.steps.forEach((step, s) => {
    if (step.length === 0) problems.push(`step ${s}: empty`)
    const stepBricks = step.map((i) => t.bricks[i]).filter((b) => b !== undefined && PART_BY_ID[b.p] !== undefined)
    const sameStep = new Occupancy()
    for (const b of stepBricks) {
      const error = canPlace(earlier, b, t.baseplate) ?? (sameStep.collides(b) ? 'collision' : null)
      if (error) problems.push(`brick ${b.id}: cannot be placed in step order (${error})`)
      sameStep.add(b)
    }
    earlier.push(...stepBricks)
  })
  return problems
}
