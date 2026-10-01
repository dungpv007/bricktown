import { create } from 'zustand'

export type PersistError = 'load' | 'save' | null

export interface PersistStatus {
  /** 'load': current slot could not be read; 'save': last write failed. UI shows a warning icon. */
  error: PersistError
  /** When true autosave never writes (the slot's real contents are unknown, so don't overwrite). */
  writeBlocked: boolean
  /**
   * Open save-slot menus plus running slot operations (switch / delete / import / export). While
   * above 0 the app must not reload for an update: a pending choice or an in-flight write would be lost.
   */
  slotActivity: number
  set: (s: { error: PersistError; writeBlocked?: boolean }) => void
}

export const usePersistStatus = create<PersistStatus>()((set) => ({
  error: null,
  writeBlocked: false,
  slotActivity: 0,
  set: ({ error, writeBlocked }) => set((s) => ({ error, writeBlocked: writeBlocked ?? s.writeBlocked })),
}))

/** Marks slot activity until the returned function is called (extra calls do nothing). */
export function beginSlotActivity(): () => void {
  usePersistStatus.setState((s) => ({ slotActivity: s.slotActivity + 1 }))
  let ended = false
  return () => {
    if (ended) return
    ended = true
    usePersistStatus.setState((s) => ({ slotActivity: s.slotActivity - 1 }))
  }
}

/** Runs a slot operation, marked as slot activity until it settles. */
export async function withSlotActivity<T>(operation: () => Promise<T>): Promise<T> {
  const end = beginSlotActivity()
  try {
    return await operation()
  } finally {
    end()
  }
}

/** What the save warning icon reports: the slot could not be read ('load'), the last write failed ('save'), or nothing. */
export function persistWarning(s: Pick<PersistStatus, 'error' | 'writeBlocked'>): 'load' | 'save' | null {
  if (s.error === 'load' || s.writeBlocked) return 'load'
  return s.error
}
