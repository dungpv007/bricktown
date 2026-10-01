import { describe, expect, it, vi } from 'vitest'
import { createUpdateApplier } from './updateApplier'

describe('createUpdateApplier', () => {
  const setup = (safe: boolean, flushOk = true) => {
    const state = { safe }
    const apply = vi.fn()
    const reload = vi.fn()
    const flush = vi.fn(async () => flushOk)
    const applier = createUpdateApplier({ isSafe: () => state.safe, flush, apply, reload })
    return { state, apply, reload, flush, applier }
  }

  it('does nothing until an update is waiting', async () => {
    const { applier, apply, flush, reload } = setup(true)
    await applier.check()
    expect(flush).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('saves then applies straight away when the update arrives on a safe screen', async () => {
    const { applier, apply, flush, reload } = setup(true)
    await applier.updateReady()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled() // only once the new version controls the page
  })

  it('waits for a safe screen (the main menu), then applies once', async () => {
    const { applier, apply, state } = setup(false)
    await applier.updateReady()
    await applier.check()
    expect(apply).not.toHaveBeenCalled()
    state.safe = true
    await Promise.all([applier.check(), applier.check()])
    await applier.check()
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting when the save fails, and tries again later', async () => {
    const flushResults = [false, true]
    const apply = vi.fn()
    const applier = createUpdateApplier({
      isSafe: () => true,
      flush: async () => flushResults.shift()!,
      apply,
      reload: vi.fn(),
    })
    await applier.updateReady()
    expect(apply).not.toHaveBeenCalled()
    await applier.check()
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('reloads when the new version takes control and the app is still safe, saving first', async () => {
    const { applier, flush, reload } = setup(true)
    await applier.updateReady()
    await applier.controlling()
    expect(flush).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)
    await applier.check()
    await applier.controlling()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('defers the reload when the kid entered a scene before the new version took control', async () => {
    const { applier, apply, flush, reload, state } = setup(true)
    await applier.updateReady()
    expect(apply).toHaveBeenCalledTimes(1)
    state.safe = false // tapped into a scene while the new version activates
    await applier.controlling()
    expect(reload).not.toHaveBeenCalled()
    await applier.check()
    expect(reload).not.toHaveBeenCalled()
    flush.mockClear()
    state.safe = true // back on the menu
    await applier.check()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('does not reload while the save fails; reloads on a later check once it works', async () => {
    const flushResults = [false, true]
    const reload = vi.fn()
    const applier = createUpdateApplier({
      isSafe: () => true,
      flush: async () => flushResults.shift() ?? true,
      apply: vi.fn(),
      reload,
    })
    await applier.controlling() // e.g. another tab activated the new version
    expect(reload).not.toHaveBeenCalled()
    await applier.check()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when the app stops being safe while saving', async () => {
    const state = { safe: true }
    const reload = vi.fn()
    const applier = createUpdateApplier({
      isSafe: () => state.safe,
      flush: async () => {
        state.safe = false // the kid opened the slot menu meanwhile
        return true
      },
      apply: vi.fn(),
      reload,
    })
    await applier.controlling()
    expect(reload).not.toHaveBeenCalled()
  })
})
