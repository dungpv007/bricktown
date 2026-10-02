import { create } from 'zustand'

/**
 * The kid's vehicles that drive on the City's roads with the ambient cars (core/npc `PlacedCar`).
 * The NPC renderer owns both: `useDrivingCars` says which placements are driving right now (the
 * City then hides their static model), `placedCarPoses` where each one is this frame (so a tap on a
 * moving car still selects its placement). Both are empty while city life is off.
 */

export interface LiveCar {
  /** Centre on the ground and unit heading (studs). */
  x: number
  z: number
  hx: number
  hz: number
  /** Size as drawn (studs): along its heading, across it, and tall. */
  length: number
  width: number
  height: number
}

/** Written by the NPC renderer every frame; plain map, nothing re-renders when it changes. */
export const placedCarPoses = new Map<string, LiveCar>()

interface DrivingCars {
  /** Placement ids whose car is driving. */
  ids: ReadonlySet<string>
  setIds: (ids: ReadonlySet<string>) => void
}

export const useDrivingCars = create<DrivingCars>()((set, get) => ({
  ids: new Set(),
  setIds: (ids) => {
    const now = get().ids
    if (now.size === ids.size && [...ids].every((id) => now.has(id))) return
    for (const id of placedCarPoses.keys()) if (!ids.has(id)) placedCarPoses.delete(id)
    set({ ids })
  },
}))

/** The world box (studs) around a driving car, for taps; null when that placement is not driving. */
export function drivingCarBox(id: string): { min: [number, number, number]; max: [number, number, number] } | null {
  if (!useDrivingCars.getState().ids.has(id)) return null
  const car = placedCarPoses.get(id)
  if (!car) return null
  // Axis-aligned around the turned car (generous at a bend: easier to hit).
  const hx = Math.abs(car.hx)
  const hz = Math.abs(car.hz)
  const ex = (car.length * hx + car.width * hz) / 2
  const ez = (car.length * hz + car.width * hx) / 2
  return { min: [car.x - ex, 0, car.z - ez], max: [car.x + ex, car.height, car.z + ez] }
}
