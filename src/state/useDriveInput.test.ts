import { beforeEach, describe, expect, it } from 'vitest'
import { combineDriveInput, keyAxes, stickAxis, useDriveInput } from './useDriveInput'

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

  it('tracks held keys and clears them all', () => {
    const s = useDriveInput.getState()
    s.keyDown('ArrowUp')
    s.keyDown('ArrowLeft')
    expect(useDriveInput.getState().read()).toEqual({ steer: -1, throttle: 1, brake: false })
    s.keyUp('ArrowUp')
    expect(useDriveInput.getState().read().throttle).toBe(0)
    s.clearKeys()
    expect(useDriveInput.getState().read()).toEqual({ steer: 0, throttle: 0, brake: false })
  })

  it('counts flip requests', () => {
    const before = useDriveInput.getState().flipSeq
    useDriveInput.getState().requestFlip()
    expect(useDriveInput.getState().flipSeq).toBe(before + 1)
  })

  it('reset releases every control', () => {
    const s = useDriveInput.getState()
    s.setStick(1)
    s.setGas(true)
    s.setReverse(true)
    s.keyDown('KeyA')
    s.reset()
    expect(useDriveInput.getState().read()).toEqual({ steer: 0, throttle: 0, brake: false })
  })
})
