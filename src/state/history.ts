export interface History<T> {
  /** Record `state` (the value BEFORE a change) so it can be restored later. Clears redo. */
  push(state: T): void
  /** Returns the previous snapshot, remembering `current` for redo; undefined if none. */
  undo(current: T): T | undefined
  /** Returns the next snapshot, remembering `current` for undo; undefined if none. */
  redo(current: T): T | undefined
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
}

export function createHistory<T>(limit = 100): History<T> {
  let past: T[] = []
  let future: T[] = []

  return {
    push(state) {
      past.push(state)
      if (past.length > limit) past = past.slice(past.length - limit)
      future = []
    },
    undo(current) {
      const prev = past.pop()
      if (prev === undefined) return undefined
      future.push(current)
      return prev
    },
    redo(current) {
      const next = future.pop()
      if (next === undefined) return undefined
      past.push(current)
      return next
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() {
      past = []
      future = []
    },
  }
}
