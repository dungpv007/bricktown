export interface UpdateApplierDeps {
  /** True when reloading loses nothing and surprises no one (the kid is on the main menu). */
  isSafe: () => boolean
  /** Writes pending game data; resolves false when that failed. */
  flush: () => Promise<boolean>
  /** Activates the waiting service worker and reloads the page. */
  apply: () => void
}

/**
 * Applies a downloaded app update only at a safe moment: once an update is waiting, every `check`
 * (call it whenever the screen changes) saves and applies it if the kid is on a safe screen.
 */
export function createUpdateApplier({ isSafe, flush, apply }: UpdateApplierDeps) {
  let waiting = false
  let busy = false
  let applied = false

  const check = async (): Promise<void> => {
    if (!waiting || busy || applied || !isSafe()) return
    busy = true
    try {
      if (!(await flush())) return // keep the update waiting; try again on the next check
      if (!isSafe()) return
      applied = true
      apply()
    } finally {
      busy = false
    }
  }

  return {
    /** The service worker has a new version waiting. */
    updateReady: (): Promise<void> => {
      waiting = true
      return check()
    },
    check,
  }
}
