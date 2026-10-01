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

const LANGS: readonly Lang[] = ['vi', 'en']
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal']
const SLOT_IDS: readonly SlotId[] = [1, 2, 3]

/** Keeps only persisted preference values that are valid; anything else falls back to defaults. */
export function sanitizePrefs(persisted: unknown): Partial<Pick<AppState, 'lang' | 'difficulty' | 'slotId'>> {
  const out: Partial<Pick<AppState, 'lang' | 'difficulty' | 'slotId'>> = {}
  if (typeof persisted !== 'object' || persisted === null) return out
  const p = persisted as Record<string, unknown>
  if (LANGS.includes(p.lang as Lang)) out.lang = p.lang as Lang
  if (DIFFICULTIES.includes(p.difficulty as Difficulty)) out.difficulty = p.difficulty as Difficulty
  if (SLOT_IDS.includes(p.slotId as SlotId)) out.slotId = p.slotId as SlotId
  return out
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
      partialize: (s) => ({ lang: s.lang, difficulty: s.difficulty, slotId: s.slotId }),
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted) }),
    },
  ),
)
