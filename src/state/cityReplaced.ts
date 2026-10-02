/**
 * "The kid's city was replaced as a whole" (a city import). A tiny module of its own so the share
 * flow, which is part of the menu's first paint, need not import the City editor (and with it
 * three.js): the editor registers itself here when it loads, and has nothing to reset before that.
 */
const listeners = new Set<() => void>()

/** Runs `fn` after every wholesale city replacement; returns the unsubscribe function. */
export function onCityReplaced(fn: () => void): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function notifyCityReplaced(): void {
  for (const fn of listeners) fn()
}
