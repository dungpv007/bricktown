import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { flushAutosave } from '../persistence/autosave'
import { loadChunk, type ChunkRetryDeps } from '../pwa/chunkRetry'

function sessionStore(): ChunkRetryDeps['storage'] {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null // blocked
  }
}

const browserDeps = (): ChunkRetryDeps => ({
  storage: sessionStore(),
  reload: () => window.location.reload(),
  flush: flushAutosave,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  importFresh: (url) => import(/* @vite-ignore */ `${url}?retry=${Date.now()}`),
})

interface Entry {
  failed: boolean
  reset: () => void
}

const entries = new Set<Entry>()

/**
 * `React.lazy` for a scene chunk, loaded through `loadChunk` (retry, then one reload per session).
 * React caches a failed lazy load forever; `resetFailedScenes` lets the next visit try again.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy
export function lazyScene<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): T {
  let current: LazyExoticComponent<T>
  const entry: Entry = {
    failed: false,
    reset: () => {
      if (!entry.failed) return
      entry.failed = false
      current = make()
    },
  }
  const make = () =>
    lazy(() =>
      loadChunk(load, browserDeps()).catch((error: unknown) => {
        entry.failed = true
        throw error
      }),
    )
  current = make()
  entries.add(entry)
  const Scene = (props: object) => {
    const Current = current as unknown as ComponentType<object>
    return <Current {...props} />
  }
  return Scene as unknown as T
}

/** Forget failed scene loads, so entering the scene again downloads it afresh. */
export function resetFailedScenes(): void {
  for (const e of entries) e.reset()
}
