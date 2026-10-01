import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySave } from '../core/serialize'
import { applySave } from '../persistence/session'
import { beginSlotActivity, usePersistStatus } from '../persistence/status'
import { useApp } from '../state/useApp'
import { useGame } from '../state/useGame'
import { isSafeToReload, onSafetyChange } from './safeMoment'

const addBrick = () => {
  const ws = useGame.getState().data.workshop
  useGame.getState().setWorkshop({ ...ws, bricks: [...ws.bricks, { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }] })
}

beforeEach(() => {
  useApp.getState().setMode('menu')
  usePersistStatus.setState({ slotActivity: 0, error: null, writeBlocked: false })
  applySave(createEmptySave())
})

describe('isSafeToReload', () => {
  it('is true only on the main menu with no slot menu open and no slot operation running', () => {
    expect(isSafeToReload()).toBe(true)
    useApp.getState().setMode('workshop')
    expect(isSafeToReload()).toBe(false)
    useApp.getState().setMode('menu')
    const end = beginSlotActivity()
    expect(isSafeToReload()).toBe(false)
    end()
    expect(isSafeToReload()).toBe(true)
  })

  it('is false while writes are blocked and the game changed since load (that work cannot be saved)', () => {
    usePersistStatus.getState().set({ error: 'load', writeBlocked: true })
    expect(isSafeToReload()).toBe(true) // nothing to lose yet
    addBrick()
    expect(isSafeToReload()).toBe(false)
    usePersistStatus.getState().set({ error: null, writeBlocked: false }) // e.g. the slot loaded again
    expect(isSafeToReload()).toBe(true) // a normal flush can save it now
  })
})

describe('onSafetyChange', () => {
  let stop: () => void = () => undefined
  afterEach(() => stop())

  it('calls back when the mode or the slot activity changes, not on other changes', () => {
    const listener = vi.fn()
    stop = onSafetyChange(listener)
    useApp.getState().setLang('en')
    usePersistStatus.getState().set({ error: 'save' })
    expect(listener).not.toHaveBeenCalled()
    useApp.getState().setMode('city')
    expect(listener).toHaveBeenCalledTimes(1)
    const end = beginSlotActivity()
    end()
    expect(listener).toHaveBeenCalledTimes(3)
    usePersistStatus.getState().set({ error: 'load', writeBlocked: true })
    expect(listener).toHaveBeenCalledTimes(4)
    stop()
    useApp.getState().setMode('menu')
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('calls back when the app comes back to the front (a save that failed may work now)', () => {
    const listener = vi.fn()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' as DocumentVisibilityState })
    stop = onSafetyChange(listener, doc)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(listener).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
