import { create } from 'zustand'

/**
 * Where the car is, published by the vehicle a few times per second, plus how many vehicle
 * controllers exist. Production-safe (unlike the dev-only `window.__btDrive`), so e2e specs can
 * check the production build: the drive UI mirrors it on a hidden `drive-status` element.
 */
export interface DriveStatus {
  x: number
  z: number
  /** Forward speed (studs / s), negative when reversing. */
  speed: number
  /** Vehicle controllers alive right now (1 while driving, 0 otherwise). */
  controllers: number
  /** Vehicle controllers created since the page loaded. */
  builds: number
  setPose: (x: number, z: number, speed: number) => void
  controllerAdded: () => void
  controllerRemoved: () => void
}

export const useDriveStatus = create<DriveStatus>()((set, get) => ({
  x: 0,
  z: 0,
  speed: 0,
  controllers: 0,
  builds: 0,
  setPose: (x, z, speed) => set({ x, z, speed }),
  controllerAdded: () => set({ controllers: get().controllers + 1, builds: get().builds + 1 }),
  controllerRemoved: () => set({ controllers: get().controllers - 1 }),
}))
