import { describe, expect, it, vi } from 'vitest'
import { CHUNK_RELOAD_KEY, failedModuleUrl, loadChunk, type ChunkRetryDeps } from './chunkRetry'

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  }
}

function deps(overrides: Partial<ChunkRetryDeps> = {}): ChunkRetryDeps & { storage: ReturnType<typeof memoryStorage> } {
  return {
    storage: memoryStorage(),
    reload: vi.fn(),
    flush: vi.fn(async () => true),
    wait: async () => undefined,
    importFresh: vi.fn(() => fail()),
    ...overrides,
  } as ChunkRetryDeps & { storage: ReturnType<typeof memoryStorage> }
}

const fail = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))

describe('loadChunk', () => {
  it('resolves with the module when the first try works', async () => {
    const d = deps()
    await expect(loadChunk(async () => 'mod', d)).resolves.toBe('mod')
    expect(d.reload).not.toHaveBeenCalled()
  })

  it('a chunk that loads fine keeps the session mark: another failing chunk still cannot reload', async () => {
    const d = deps()
    void loadChunk(fail, d)
    await vi.waitFor(() => expect(d.reload).toHaveBeenCalledTimes(1))
    await loadChunk(async () => 'picker', d)
    await expect(loadChunk(fail, d)).rejects.toThrow('Failed to fetch')
    expect(d.reload).toHaveBeenCalledTimes(1)
  })

  it('retries a named module under a fresh URL (the failed URL is remembered by the browser)', async () => {
    const url = 'https://app.test/assets/DriveScene-abc.js'
    const load = vi.fn(() => Promise.reject(new TypeError(`Failed to fetch dynamically imported module: ${url}`)))
    const importFresh = vi.fn(async () => 'fresh')
    await expect(loadChunk(load, deps({ importFresh }))).resolves.toBe('fresh')
    expect(load).toHaveBeenCalledTimes(1)
    expect(importFresh).toHaveBeenCalledWith(url)
  })

  it('retries once after a failure', async () => {
    const load = vi.fn().mockImplementationOnce(fail).mockResolvedValueOnce('mod')
    const d = deps()
    await expect(loadChunk(load, d)).resolves.toBe('mod')
    expect(load).toHaveBeenCalledTimes(2)
    expect(d.reload).not.toHaveBeenCalled()
  })

  it('saves, marks the session and reloads once when the retry fails too (and never settles)', async () => {
    const load = vi.fn(fail)
    const d = deps()
    let settled = false
    void loadChunk(load, d).then(
      () => (settled = true),
      () => (settled = true),
    )
    await vi.waitFor(() => expect(d.reload).toHaveBeenCalledTimes(1))
    expect(d.flush).toHaveBeenCalled()
    expect(d.storage.map.get(CHUNK_RELOAD_KEY)).toBe('1')
    expect(load).toHaveBeenCalledTimes(2)
    await Promise.resolve()
    expect(settled).toBe(false) // the page is going away: keep the loading screen up
  })

  it('does not reload again in the same session: the error reaches the scene boundary', async () => {
    const d = deps({ storage: memoryStorage({ [CHUNK_RELOAD_KEY]: '1' }) })
    await expect(loadChunk(fail, d)).rejects.toThrow('Failed to fetch')
    expect(d.reload).not.toHaveBeenCalled()
  })

  it('does not reload when the save could not be written', async () => {
    const d = deps({ flush: vi.fn(async () => false) })
    await expect(loadChunk(fail, d)).rejects.toThrow('Failed to fetch')
    expect(d.reload).not.toHaveBeenCalled()
  })

  it('without storage (blocked) it never reloads, so it cannot loop', async () => {
    const d = deps({ storage: null })
    await expect(loadChunk(fail, d)).rejects.toThrow('Failed to fetch')
    expect(d.reload).not.toHaveBeenCalled()
  })
})

describe('failedModuleUrl', () => {
  it('finds the module URL in Chrome and Firefox messages', () => {
    expect(failedModuleUrl(new TypeError('Failed to fetch dynamically imported module: http://localhost:5173/src/scenes/drive/DriveScene.tsx'))).toBe(
      'http://localhost:5173/src/scenes/drive/DriveScene.tsx',
    )
    expect(failedModuleUrl(new TypeError('error loading dynamically imported module: https://x.test/assets/City-1a2b.js?v=3'))).toBe(
      'https://x.test/assets/City-1a2b.js',
    )
  })
  it('is null when the message names no module (Safari) or it is not an error', () => {
    expect(failedModuleUrl(new TypeError('Importing a module script failed.'))).toBeNull()
    expect(failedModuleUrl('boom')).toBeNull()
  })
})
