import type { Blueprint, WorkshopState } from './types'

interface ComposeInput {
  name: string
  workshop: WorkshopState
  /** Id for a brand-new blueprint (ignored when `existing` is given). */
  id: string
  now: number
  /** The blueprint being edited, if the workshop was opened from one. */
  existing?: Blueprint
}

/** Snapshot of the workshop as a blueprint. Updating `existing` keeps its id, createdAt, tags and templateId. */
export function composeBlueprint({ name, workshop, id, now, existing }: ComposeInput): Blueprint {
  const base = {
    name: name.trim(),
    kind: workshop.kind,
    baseplate: { ...workshop.baseplate },
    bricks: [...workshop.bricks],
    updatedAt: now,
  }
  if (!existing) return { ...base, id, tags: [], createdAt: now }
  return { ...existing, ...base }
}
