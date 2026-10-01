/**
 * Loading a lazy chunk (a scene) robustly: after a deploy, an app that was open on an older version
 * may ask for a chunk file that no longer exists. Retry once (a network blip), then save and reload
 * the page once per session so the app picks up the current version; if even that did not help,
 * let the error reach the scene boundary (friendly error screen) instead of reloading in a loop.
 * The mark is never cleared within the session (another chunk loading fine says nothing about this one).
 */

export const CHUNK_RELOAD_KEY = 'bricktown-chunk-reload'
const RETRY_DELAY_MS = 400

export interface ChunkRetryDeps {
  /** sessionStorage (null when unavailable: then never reload, so it cannot loop). */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  reload: () => void
  /** Writes pending game data; resolves false when that failed (then do not reload). */
  flush: () => Promise<boolean>
  wait: (ms: number) => Promise<void>
  /**
   * Imports `url` under a fresh query string. Browsers remember a failed module URL for the life of
   * the page, so retrying the same URL fails again without even asking the network.
   */
  importFresh: (url: string) => Promise<unknown>
}

/** The module URL in a failed dynamic import's message (Chrome and Firefox name it; Safari does not). */
export function failedModuleUrl(error: unknown): string | null {
  const message = error instanceof Error ? error.message : ''
  const m = /(https?:\/\/\S+\.(?:m?js|jsx|tsx?))(?:\?\S*)?\s*$/.exec(message)
  return m ? m[1]! : null
}

const never = <T>() => new Promise<T>(() => undefined)

export async function loadChunk<T>(load: () => Promise<T>, deps: ChunkRetryDeps): Promise<T> {
  const { storage } = deps
  try {
    let mod: T
    try {
      mod = await load()
    } catch (first) {
      await deps.wait(RETRY_DELAY_MS)
      const url = failedModuleUrl(first)
      mod = url ? ((await deps.importFresh(url)) as T) : await load()
    }
    return mod
  } catch (error) {
    if (!storage || storage.getItem(CHUNK_RELOAD_KEY) !== null) throw error
    if (!(await deps.flush())) throw error
    storage.setItem(CHUNK_RELOAD_KEY, '1')
    deps.reload()
    return never<T>() // the page is going away: keep the loading screen up meanwhile
  }
}
