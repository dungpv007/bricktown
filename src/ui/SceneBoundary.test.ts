import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../state/useApp'
import { resetFailedScenes } from './lazyScene'
import { retryFailedScenesOnMenu } from './SceneBoundary'

vi.mock('./lazyScene', () => ({ resetFailedScenes: vi.fn() }))

describe('retryFailedScenesOnMenu', () => {
  let stop: () => void = () => undefined
  beforeEach(() => {
    vi.mocked(resetFailedScenes).mockClear()
    useApp.getState().setMode('workshop')
    stop = retryFailedScenesOnMenu()
  })
  afterEach(() => stop())

  it('forgets failed scene loads whenever the app returns to the menu, however it got there', () => {
    expect(resetFailedScenes).not.toHaveBeenCalled()
    useApp.getState().setMode('menu') // e.g. the top bar back button on the error screen
    expect(resetFailedScenes).toHaveBeenCalledTimes(1)
    useApp.getState().setLang('en')
    useApp.getState().setMode('drive')
    expect(resetFailedScenes).toHaveBeenCalledTimes(1)
    useApp.getState().setMode('menu')
    expect(resetFailedScenes).toHaveBeenCalledTimes(2)
  })

  it('stops when unsubscribed', () => {
    stop()
    useApp.getState().setMode('menu')
    expect(resetFailedScenes).not.toHaveBeenCalled()
  })
})
