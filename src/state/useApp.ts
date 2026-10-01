import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type Mode = 'menu' | 'workshop' | 'guided' | 'city' | 'drive'
export type Lang = 'vi' | 'en'
export type Difficulty = 'easy' | 'normal'
export type SlotId = 1 | 2 | 3

export interface AppState {
  mode: Mode
  lang: Lang
  slotId: SlotId
  difficulty: Difficulty
  setMode: (mode: Mode) => void
  setLang: (lang: Lang) => void
  setDifficulty: (difficulty: Difficulty) => void
  setSlot: (slotId: SlotId) => void
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

/** localStorage that never throws (missing in node tests, blocked in private modes). */
function safeStorage(): StateStorage {
  try {
    if (typeof localStorage === 'undefined') return noopStorage
    const ls = localStorage
    return {
      getItem: (k) => {
        try { return ls.getItem(k) } catch { return null }
      },
      setItem: (k, v) => {
        try { ls.setItem(k, v) } catch { /* storage full or blocked */ }
      },
      removeItem: (k) => {
        try { ls.removeItem(k) } catch { /* ignore */ }
      },
    }
  } catch {
    return noopStorage
  }
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      mode: 'menu',
      lang: 'vi',
      slotId: 1,
      difficulty: 'easy',
      setMode: (mode) => set({ mode }),
      setLang: (lang) => set({ lang }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setSlot: (slotId) => set({ slotId }),
    }),
    {
      name: 'bricktown-prefs',
      storage: createJSONStorage(safeStorage),
      partialize: (s) => ({ lang: s.lang, difficulty: s.difficulty }),
    },
  ),
)
