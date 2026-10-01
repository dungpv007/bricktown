import { beforeEach, describe, expect, it } from 'vitest'
import { beginSlotActivity, persistWarning, usePersistStatus, withSlotActivity } from './status'

const activity = () => usePersistStatus.getState().slotActivity

beforeEach(() => {
  usePersistStatus.setState({ error: null, writeBlocked: false, slotActivity: 0 })
})

describe('slot activity', () => {
  it('counts overlapping activities and each end counts once', () => {
    const endMenu = beginSlotActivity()
    const endOp = beginSlotActivity()
    expect(activity()).toBe(2)
    endOp()
    endOp()
    expect(activity()).toBe(1)
    endMenu()
    expect(activity()).toBe(0)
  })

  it('withSlotActivity is active while the operation runs, and ends even when it throws', async () => {
    let resolve!: (v: string) => void
    const running = withSlotActivity(() => new Promise<string>((r) => (resolve = r)))
    expect(activity()).toBe(1)
    resolve('done')
    await expect(running).resolves.toBe('done')
    expect(activity()).toBe(0)

    await expect(withSlotActivity(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(activity()).toBe(0)
  })

  it('setting the error keeps the activity count', () => {
    beginSlotActivity()
    usePersistStatus.getState().set({ error: 'save' })
    expect(activity()).toBe(1)
  })
})

describe('persistWarning', () => {
  it('is null when saving works', () => {
    expect(persistWarning({ error: null, writeBlocked: false })).toBeNull()
  })
  it("is 'save' when the last write failed", () => {
    expect(persistWarning({ error: 'save', writeBlocked: false })).toBe('save')
  })
  it("is 'load' when the slot could not be read or writes are blocked", () => {
    expect(persistWarning({ error: 'load', writeBlocked: true })).toBe('load')
    expect(persistWarning({ error: null, writeBlocked: true })).toBe('load')
  })
})
