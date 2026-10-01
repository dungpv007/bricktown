import { hasUnsavedChanges } from '../persistence/autosave'
import { usePersistStatus } from '../persistence/status'
import { useApp } from '../state/useApp'

/**
 * True when reloading for an app update loses nothing and surprises no one: the kid is on the main
 * menu, with no save-slot menu open and no slot operation running, and no change that cannot be saved
 * (while writes are blocked a flush "succeeds" without writing, so a reload would drop that work).
 */
export function isSafeToReload(): boolean {
  const status = usePersistStatus.getState()
  return (
    useApp.getState().mode === 'menu' &&
    status.slotActivity === 0 &&
    !(status.writeBlocked && hasUnsavedChanges())
  )
}

type VisibilitySource = Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>

/**
 * Calls `listener` whenever something `isSafeToReload` depends on changes, and when the app comes back
 * to the front (a save that failed before may work now). Returns an unsubscribe.
 */
export function onSafetyChange(
  listener: () => void,
  doc: VisibilitySource | undefined = typeof document === 'undefined' ? undefined : document,
): () => void {
  const stopApp = useApp.subscribe((s, prev) => {
    if (s.mode !== prev.mode) listener()
  })
  const stopStatus = usePersistStatus.subscribe((s, prev) => {
    if (s.slotActivity !== prev.slotActivity || s.writeBlocked !== prev.writeBlocked) listener()
  })
  const onVisibility = () => {
    if (doc?.visibilityState === 'visible') listener()
  }
  doc?.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopApp()
    stopStatus()
    doc?.removeEventListener('visibilitychange', onVisibility)
  }
}
