import { create } from 'zustand'
import type { HornKind } from '../audio/horns'
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

export type Pedal = 'gas' | 'reverse'

/** Where to set the car down: ground position and heading (radians around +Y, 0 = facing -Z). */
export interface VehiclePlacement {
  x: number
  z: number
  yaw: number
}

export interface DriveInputState extends DriveControls {
  /** Pointers (fingers) holding each pedal: it stays down until the last one lifts. */
  pedalPointers: Readonly<Record<Pedal, ReadonlySet<number>>>
  /** Incremented by the flip button; the car rights itself whenever it changes. */
  flipSeq: number
  /** Incremented by `requestPlace`; the car is then set down at `placeTarget`. */
  placeSeq: number
  placeTarget: VehiclePlacement | null
  /** The horn `honk` plays: set from the vehicle being driven. */
  hornKind: HornKind
  setHornKind: (kind: HornKind) => void
  setStick: (stick: number) => void
  pressPedal: (pedal: Pedal, pointerId: number) => void
  releasePedal: (pedal: Pedal, pointerId: number) => void
  keyDown: (code: string) => void
  keyUp: (code: string) => void
  requestFlip: () => void
  /** Sets the car down, at rest, at (x, z) facing `yaw` (0 = -Z); e.g. back to a maze's start. */
  requestPlace: (place: VehiclePlacement) => void
  honk: () => void
  /** Releases every control (leaving the scene, window blur, app hidden). */
  reset: () => void
  read: () => DriveInput
}

const NO_KEYS: ReadonlySet<string> = new Set()
const NO_POINTERS: ReadonlySet<number> = new Set()
const NO_PEDALS: Record<Pedal, ReadonlySet<number>> = { gas: NO_POINTERS, reverse: NO_POINTERS }

/** `pointers` held on `pedal`, with the pedal's flag (`gas` / `reverse`) kept in step. */
function pedalUpdate(state: DriveInputState, pedal: Pedal, pointers: ReadonlySet<number>) {
  return { pedalPointers: { ...state.pedalPointers, [pedal]: pointers }, [pedal]: pointers.size > 0 }
}

/**
 * Calls `release` whenever the app loses the player's attention: the window loses focus (alt-tab,
 * a system dialog) or the page is hidden (home button, app switcher, screen lock). Lifting a finger
 * in that moment never reaches the page, so held controls would otherwise stay held. Returns the
 * function that stops listening.
 */
export function releaseOnInterruption(
  win: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>,
  release: () => void,
): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') release()
  }
  win.addEventListener('blur', release)
  doc.addEventListener('visibilitychange', onVisibility)
  return () => {
    win.removeEventListener('blur', release)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}

export const useDriveInput = create<DriveInputState>()((set, get) => ({
  stick: 0,
  gas: false,
  reverse: false,
  keys: NO_KEYS,
  pedalPointers: NO_PEDALS,
  flipSeq: 0,
  placeSeq: 0,
  placeTarget: null,
  hornKind: 'car',
  setHornKind: (hornKind) => set({ hornKind }),
  setStick: (stick) => set({ stick: clamp1(stick) }),
  pressPedal: (pedal, pointerId) => {
    const held = get().pedalPointers[pedal]
    if (held.has(pointerId)) return
    set(pedalUpdate(get(), pedal, new Set([...held, pointerId])))
  },
  releasePedal: (pedal, pointerId) => {
    const held = get().pedalPointers[pedal]
    if (!held.has(pointerId)) return
    const rest = new Set(held)
    rest.delete(pointerId)
    set(pedalUpdate(get(), pedal, rest))
  },
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
  requestFlip: () => set({ flipSeq: get().flipSeq + 1 }),
  requestPlace: (place) => set({ placeSeq: get().placeSeq + 1, placeTarget: place }),
  honk: () => horn(get().hornKind),
  reset: () => set({ stick: 0, gas: false, reverse: false, keys: NO_KEYS, pedalPointers: NO_PEDALS }),
  read: () => combineDriveInput(get()),
}))
