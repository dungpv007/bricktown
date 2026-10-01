import { describe, expect, it, vi } from 'vitest'
import { createUpdateApplier } from './updateApplier'

describe('createUpdateApplier', () => {
  const setup = (safe: boolean, flushOk = true) => {
    const state = { safe }
    const apply = vi.fn()
    const flush = vi.fn(async () => flushOk)
    const applier = createUpdateApplier({ isSafe: () => state.safe, flush, apply })
    return { state, apply, flush, applier }
  }

  it('does nothing until an update is waiting', async () => {
    const { applier, apply, flush } = setup(true)
    await applier.check()
    expect(flush).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('saves then applies straight away when the update arrives on a safe screen', async () => {
    const { applier, apply, flush } = setup(true)
    await applier.updateReady()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
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
    const applier = createUpdateApplier({ isSafe: () => true, flush: async () => flushResults.shift()!, apply })
    await applier.updateReady()
    expect(apply).not.toHaveBeenCalled()
    await applier.check()
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
