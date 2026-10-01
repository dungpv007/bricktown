export interface UpdateApplierDeps {
  /** True when reloading loses nothing and surprises no one (the kid is on the main menu). */
  isSafe: () => boolean
  /** Writes pending game data; resolves false when that failed. */
  flush: () => Promise<boolean>
  /** Activates the waiting service worker (it then takes control of the page: call `controlling`). */
  apply: () => void
  /** Reloads the page into the new version. */
  reload: () => void
}

/**
 * Applies a downloaded app update only at a safe moment. Once an update is waiting, every `check`
 * (call it whenever the screen changes) saves and activates it if the kid is on a safe screen. When
 * the new version takes control (`controlling`), the page reloads the same way: saved first, and only
 * while still safe; otherwise later checks reload once the app is safe again.
 */
export function createUpdateApplier({ isSafe, flush, apply, reload }: UpdateApplierDeps) {
  let phase: 'idle' | 'waiting' | 'activating' | 'needsReload' | 'reloaded' = 'idle'
  let busy = false

  const check = async (): Promise<void> => {
    if ((phase !== 'waiting' && phase !== 'needsReload') || busy || !isSafe()) return
    busy = true
    try {
      if (!(await flush())) return // keep waiting; try again on the next check
      if (!isSafe()) return
      // Read the phase now: the new version may have taken control while saving.
      if (phase === 'needsReload') {
        phase = 'reloaded'
        reload()
      } else if (phase === 'waiting') {
        phase = 'activating'
        apply()
      }
    } finally {
      busy = false
    }
  }

  return {
    /** The service worker has a new version waiting. */
    updateReady: (): Promise<void> => {
      if (phase === 'idle') phase = 'waiting'
      return check()
    },
    /** The new version now controls the page: reload into it at the next safe moment. */
    controlling: (): Promise<void> => {
      if (phase !== 'reloaded') phase = 'needsReload'
      return check()
    },
    check,
  }
}
