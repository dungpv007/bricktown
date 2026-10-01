import { registerSW } from 'virtual:pwa-register'
import { flushAutosave } from '../persistence/autosave'
import { useApp } from '../state/useApp'
import { createUpdateApplier } from './updateApplier'

/**
 * Registers the service worker in "prompt" mode: a new version downloads in the background but only
 * takes over (and reloads the page) when the kid is on the main menu, after saving. The running app
 * therefore never loses the chunk files of the version it was started with.
 */
export function registerUpdates(): void {
  const applier = createUpdateApplier({
    isSafe: () => useApp.getState().mode === 'menu',
    flush: flushAutosave,
    apply: () => void updateSW(true), // only called after registration (from onNeedRefresh)
  })
  const updateSW = registerSW({
    onNeedRefresh: () => void applier.updateReady(),
    onRegisteredSW: (_url, registration) => {
      // A tablet app stays open for days: look for a new version whenever it comes back to the front.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration?.update().catch(() => undefined) // offline: fine
      })
    },
  })
  useApp.subscribe((s, prev) => {
    if (s.mode !== prev.mode) void applier.check()
  })
}
