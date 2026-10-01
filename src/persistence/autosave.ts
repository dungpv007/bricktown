import type { SaveData } from '../core/types'
import { useApp } from '../state/useApp'
import { useGame } from '../state/useGame'
import { saveSlot } from './saves'
import { usePersistStatus } from './status'

export const AUTOSAVE_DELAY_MS = 2000

/** The data object that is already persisted (or was just loaded); never re-written. */
let cleanData: SaveData | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let persistRequested = false

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/** Declares `data` as already persisted so autosave skips it (used right after load/import); null forgets it. */
export function markClean(data: SaveData | null): void {
  cleanData = data
  clearTimer()
}

/**
 * Writes the current game data to the current slot now, if it changed since the last write.
 * Resolves false only when a write was attempted and failed. While writes are blocked (the slot
 * could not be read at load) nothing is written and this resolves true.
 */
export async function flushAutosave(): Promise<boolean> {
  clearTimer()
  const { data, loaded } = useGame.getState()
  const status = usePersistStatus.getState()
  if (!loaded || data === cleanData || status.writeBlocked) return true
  const ok = await saveSlot(useApp.getState().slotId, data)
  if (ok) {
    cleanData = data
    if (usePersistStatus.getState().error === 'save') usePersistStatus.getState().set({ error: null })
  } else {
    usePersistStatus.getState().set({ error: 'save' })
  }
  return ok
}

function requestPersistentStorage() {
  if (persistRequested) return
  persistRequested = true
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch {
    /* not supported */
  }
}

/** Starts debounced autosave of `useGame.data`; returns a function that stops it. */
export function startAutosave(): () => void {
  requestPersistentStorage()

  const unsubscribe = useGame.subscribe((state, prev) => {
    if (!state.loaded || state.data === prev.data) return
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void flushAutosave()
    }, AUTOSAVE_DELAY_MS)
  })

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flushAutosave()
  }
  const onPageHide = () => void flushAutosave()
  const hasDom = typeof document !== 'undefined' && typeof window !== 'undefined'
  if (hasDom) {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
  }

  return () => {
    unsubscribe()
    clearTimer()
    if (hasDom) {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }
}
