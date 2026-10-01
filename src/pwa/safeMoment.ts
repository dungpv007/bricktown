import { usePersistStatus } from '../persistence/status'
import { useApp } from '../state/useApp'

/**
 * True when reloading for an app update loses nothing and surprises no one: the kid is on the main
 * menu, with no save-slot menu open and no slot operation running.
 */
export function isSafeToReload(): boolean {
  return useApp.getState().mode === 'menu' && usePersistStatus.getState().slotActivity === 0
}

/** Calls `listener` whenever something `isSafeToReload` depends on changes; returns an unsubscribe. */
export function onSafetyChange(listener: () => void): () => void {
  const stopApp = useApp.subscribe((s, prev) => {
    if (s.mode !== prev.mode) listener()
  })
  const stopStatus = usePersistStatus.subscribe((s, prev) => {
    if (s.slotActivity !== prev.slotActivity) listener()
  })
  return () => {
    stopApp()
    stopStatus()
  }
}
