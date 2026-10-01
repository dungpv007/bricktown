import { create } from 'zustand'
import { horn } from '../audio/sfx'

/** What the car reads every physics step. */
export interface DriveInput {
  /** -1 = full left, +1 = full right. */
  steer: number
  /** +1 = full gas, -1 = full reverse. */
  throttle: number
  brake: boolean
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

/** Joystick knob offset (px) -> -1..1 with a dead zone so a resting thumb drives straight. */
export function stickAxis(offset: number, radius: number, deadZone = 0.15): number {
  const v = clamp1(offset / radius)
  const mag = Math.abs(v)
  if (mag <= deadZone) return 0
  return (Math.sign(v) * (mag - deadZone)) / (1 - deadZone)
}

const LEFT = ['ArrowLeft', 'KeyA']
const RIGHT = ['ArrowRight', 'KeyD']
const UP = ['ArrowUp', 'KeyW']
const DOWN = ['ArrowDown', 'KeyS']
const BRAKE = ['Space']

/** Keys (`KeyboardEvent.code`) the drive controls listen to. */
export const DRIVE_KEYS: ReadonlySet<string> = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, ...BRAKE])

/** Arrow keys / WASD steer and drive, space brakes. */
export function keyAxes(keys: ReadonlySet<string>): DriveInput {
  const any = (codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0)
  return {
    steer: any(RIGHT) - any(LEFT),
    throttle: any(UP) - any(DOWN),
    brake: any(BRAKE) === 1,
  }
}

export interface DriveControls {
  stick: number
  gas: boolean
  reverse: boolean
  keys: ReadonlySet<string>
}

/** On-screen controls and keyboard together. Holding gas and reverse at once brakes. */
export function combineDriveInput({ stick, gas, reverse, keys }: DriveControls): DriveInput {
  const k = keyAxes(keys)
  const pedals = (gas ? 1 : 0) - (reverse ? 1 : 0)
  const bothPedals = gas && reverse
  return {
    steer: clamp1(stick + k.steer),
    throttle: clamp1(pedals + k.throttle),
    brake: k.brake || bothPedals,
  }
}

export interface DriveInputState extends DriveControls {
  /** Incremented by the flip button; the car rights itself whenever it changes. */
  flipSeq: number
  setStick: (stick: number) => void
  setGas: (gas: boolean) => void
  setReverse: (reverse: boolean) => void
  keyDown: (code: string) => void
  keyUp: (code: string) => void
  clearKeys: () => void
  requestFlip: () => void
  honk: () => void
  /** Releases every control (leaving the scene, window blur). */
  reset: () => void
  read: () => DriveInput
}

const NO_KEYS: ReadonlySet<string> = new Set()

export const useDriveInput = create<DriveInputState>()((set, get) => ({
  stick: 0,
  gas: false,
  reverse: false,
  keys: NO_KEYS,
  flipSeq: 0,
  setStick: (stick) => set({ stick: clamp1(stick) }),
  setGas: (gas) => set({ gas }),
  setReverse: (reverse) => set({ reverse }),
  keyDown: (code) => {
    if (get().keys.has(code)) return
    set({ keys: new Set([...get().keys, code]) })
  },
  keyUp: (code) => {
    if (!get().keys.has(code)) return
    const keys = new Set(get().keys)
    keys.delete(code)
    set({ keys })
  },
  clearKeys: () => set({ keys: NO_KEYS }),
  requestFlip: () => set({ flipSeq: get().flipSeq + 1 }),
  honk: () => horn(),
  reset: () => set({ stick: 0, gas: false, reverse: false, keys: NO_KEYS }),
  read: () => combineDriveInput(get()),
}))
