import { beforeEach, describe, expect, it, vi } from 'vitest'
import { combineDriveInput, keyAxes, releaseOnInterruption, stickAxis, useDriveInput } from './useDriveInput'

describe('stickAxis', () => {
  it('maps the knob offset to -1..1 over the radius', () => {
    expect(stickAxis(60, 60)).toBe(1)
    expect(stickAxis(-60, 60)).toBe(-1)
    expect(stickAxis(120, 60)).toBe(1)
  })
  it('ignores small wobbles in the dead zone and rescales the rest', () => {
    expect(stickAxis(5, 60)).toBe(0)
    expect(stickAxis(-5, 60)).toBe(0)
    const half = stickAxis(30, 60, 0.2)
    expect(half).toBeCloseTo((0.5 - 0.2) / 0.8)
  })
})

describe('keyAxes', () => {
  it('maps arrows and WASD', () => {
    expect(keyAxes(new Set(['ArrowUp']))).toEqual({ steer: 0, throttle: 1, brake: false })
    expect(keyAxes(new Set(['KeyS', 'KeyA']))).toEqual({ steer: -1, throttle: -1, brake: false })
    expect(keyAxes(new Set(['ArrowRight', 'Space']))).toEqual({ steer: 1, throttle: 0, brake: true })
  })
  it('cancels opposite keys', () => {
    expect(keyAxes(new Set(['ArrowLeft', 'ArrowRight']))).toEqual({ steer: 0, throttle: 0, brake: false })
  })
})

describe('combineDriveInput', () => {
  const none = { stick: 0, gas: false, reverse: false, keys: new Set<string>() }

  it('is idle with nothing pressed', () => {
    expect(combineDriveInput(none)).toEqual({ steer: 0, throttle: 0, brake: false })
  })
  it('gas and reverse buttons set the throttle', () => {
    expect(combineDriveInput({ ...none, gas: true }).throttle).toBe(1)
    expect(combineDriveInput({ ...none, reverse: true }).throttle).toBe(-1)
  })
  it('both pedals at once brake instead', () => {
    expect(combineDriveInput({ ...none, gas: true, reverse: true })).toEqual({ steer: 0, throttle: 0, brake: true })
  })
  it('adds the stick and the keyboard, clamped', () => {
    expect(combineDriveInput({ ...none, stick: 0.5 }).steer).toBe(0.5)
    expect(combineDriveInput({ ...none, stick: 0.8, keys: new Set(['KeyD']) }).steer).toBe(1)
    expect(combineDriveInput({ ...none, keys: new Set(['KeyW']) }).throttle).toBe(1)
  })
})

describe('useDriveInput store', () => {
  beforeEach(() => useDriveInput.getState().reset())

  it('tracks held keys', () => {
    const s = useDriveInput.getState()
    s.keyDown('ArrowUp')
    s.keyDown('ArrowLeft')
    expect(useDriveInput.getState().read()).toEqual({ steer: -1, throttle: 1, brake: false })
    s.keyUp('ArrowUp')
    expect(useDriveInput.getState().read()).toEqual({ steer: -1, throttle: 0, brake: false })
  })

  it('a pedal held by two fingers stays down until both lift', () => {
    const s = useDriveInput.getState()
    s.pressPedal('gas', 1)
    s.pressPedal('gas', 2)
    expect(useDriveInput.getState().read().throttle).toBe(1)
    s.releasePedal('gas', 1)
    expect(useDriveInput.getState().read().throttle).toBe(1)
    s.releasePedal('gas', 2)
    expect(useDriveInput.getState().read().throttle).toBe(0)
  })

  it('the two pedals track their fingers separately', () => {
    const s = useDriveInput.getState()
    s.pressPedal('gas', 1)
    s.pressPedal('reverse', 2)
    expect(useDriveInput.getState().read()).toEqual({ steer: 0, throttle: 0, brake: true })
    s.releasePedal('reverse', 1) // not the finger on reverse
    expect(useDriveInput.getState().reverse).toBe(true)
    s.releasePedal('reverse', 2)
    expect(useDriveInput.getState().read()).toEqual({ steer: 0, throttle: 1, brake: false })
  })

  it('counts flip requests', () => {
    const before = useDriveInput.getState().flipSeq
    useDriveInput.getState().requestFlip()
    expect(useDriveInput.getState().flipSeq).toBe(before + 1)
  })

  it('reset releases every control', () => {
    const s = useDriveInput.getState()
    s.setStick(1)
    s.pressPedal('gas', 1)
    s.pressPedal('reverse', 2)
    s.keyDown('KeyA')
    s.reset()
    expect(useDriveInput.getState().read()).toEqual({ steer: 0, throttle: 0, brake: false })
  })

  it('after a reset, a finger that never lifted does not keep the next press held', () => {
    const s = useDriveInput.getState()
    s.pressPedal('gas', 1) // its pointerup is lost (app switched away)
    s.reset()
    s.pressPedal('gas', 2)
    s.releasePedal('gas', 2)
    expect(useDriveInput.getState().read().throttle).toBe(0)
    s.releasePedal('gas', 1) // a late lift of the lost finger changes nothing
    expect(useDriveInput.getState().read().throttle).toBe(0)
  })
})

describe('releaseOnInterruption', () => {
  function setUp(release: () => void = vi.fn()) {
    const win = new EventTarget()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState })
    const stop = releaseOnInterruption(win, doc, release)
    return { win, doc, release, stop }
  }

  it('releases when the window loses focus', () => {
    const { win, release } = setUp()
    win.dispatchEvent(new Event('blur'))
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases when the page is hidden, not when it comes back', () => {
    const { doc, release } = setUp()
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(release).toHaveBeenCalledTimes(1)
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('stops listening once stopped', () => {
    const { win, doc, release, stop } = setUp()
    stop()
    win.dispatchEvent(new Event('blur'))
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(release).not.toHaveBeenCalled()
  })

  it('wired to the store reset, hiding the app lets go of held pedals, stick and keys', () => {
    const s = useDriveInput.getState()
    s.reset()
    const { doc, stop } = setUp(s.reset)
    s.pressPedal('gas', 1)
    s.setStick(-1)
    s.keyDown('ArrowUp')
    expect(useDriveInput.getState().read()).toEqual({ steer: -1, throttle: 1, brake: false })
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(useDriveInput.getState().read()).toEqual({ steer: 0, throttle: 0, brake: false })
    stop()
  })
})
