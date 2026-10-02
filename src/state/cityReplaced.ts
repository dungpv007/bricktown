/**
 * "The current city was replaced as a whole": the kid switched to another of their cities, made a
 * new one (empty, a copy of the sample town, a duplicate), deleted the current one, or a shared
 * city was added (it becomes current). Listeners: the City editor drops its undo history and
 * selection (undo must never write one city's snapshot into another), the City camera re-frames.
 * A tiny module of its own so the share
 * flow, which is part of the menu's first paint, need not import the City editor (and with it
 * three.js): the editor registers itself here when it loads, and has nothing to reset before that.
 */
const listeners = new Set<() => void>()

/** Runs `fn` after every change of the current city as a whole; returns the unsubscribe function. */
export function onCityReplaced(fn: () => void): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function notifyCityReplaced(): void {
  for (const fn of listeners) fn()
}
