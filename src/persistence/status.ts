import { create } from 'zustand'

export type PersistError = 'load' | 'save' | null

export interface PersistStatus {
  /** 'load': current slot could not be read; 'save': last write failed. UI shows a warning icon. */
  error: PersistError
  /** When true autosave never writes (the slot's real contents are unknown, so don't overwrite). */
  writeBlocked: boolean
  set: (s: { error: PersistError; writeBlocked?: boolean }) => void
}

export const usePersistStatus = create<PersistStatus>()((set) => ({
  error: null,
  writeBlocked: false,
  set: ({ error, writeBlocked }) => set((s) => ({ error, writeBlocked: writeBlocked ?? s.writeBlocked })),
}))
