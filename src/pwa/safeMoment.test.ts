import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginSlotActivity, usePersistStatus } from '../persistence/status'
import { useApp } from '../state/useApp'
import { isSafeToReload, onSafetyChange } from './safeMoment'

beforeEach(() => {
  useApp.getState().setMode('menu')
  usePersistStatus.setState({ slotActivity: 0 })
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
    stop()
    useApp.getState().setMode('menu')
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
