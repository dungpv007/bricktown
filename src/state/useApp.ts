import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type Mode = 'menu' | 'workshop' | 'guided' | 'city' | 'drive' | 'maze' | 'mazeDrive'
export type Lang = 'vi' | 'en'
export type Difficulty = 'easy' | 'normal'
export type SlotId = 1 | 2 | 3

export interface AppState {
  mode: Mode
  lang: Lang
  slotId: SlotId
  difficulty: Difficulty
  /** Background music on. */
  musicOn: boolean
  /** Sound effects on. */
  sfxOn: boolean
  setMode: (mode: Mode) => void
  setLang: (lang: Lang) => void
  setDifficulty: (difficulty: Difficulty) => void
  setSlot: (slotId: SlotId) => void
  setMusicOn: (on: boolean) => void
  setSfxOn: (on: boolean) => void
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

type Prefs = Pick<AppState, 'lang' | 'difficulty' | 'slotId' | 'musicOn' | 'sfxOn'>

/**
 * Keeps only persisted preference values that are valid; anything else falls back to defaults.
 * Saves from before the music/sound split had one `muted` flag: muted turns both off.
 */
export function sanitizePrefs(persisted: unknown): Partial<Prefs> {
  const out: Partial<Prefs> = {}
  if (typeof persisted !== 'object' || persisted === null) return out
  const p = persisted as Record<string, unknown>
  if (LANGS.includes(p.lang as Lang)) out.lang = p.lang as Lang
  if (DIFFICULTIES.includes(p.difficulty as Difficulty)) out.difficulty = p.difficulty as Difficulty
  if (SLOT_IDS.includes(p.slotId as SlotId)) out.slotId = p.slotId as SlotId
  const legacyOn = typeof p.muted === 'boolean' ? !p.muted : undefined
  const musicOn = typeof p.musicOn === 'boolean' ? p.musicOn : legacyOn
  const sfxOn = typeof p.sfxOn === 'boolean' ? p.sfxOn : legacyOn
  if (musicOn !== undefined) out.musicOn = musicOn
  if (sfxOn !== undefined) out.sfxOn = sfxOn
  return out
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      mode: 'menu',
      lang: 'vi',
      slotId: 1,
      difficulty: 'easy',
      musicOn: true,
      sfxOn: true,
      setMode: (mode) => set({ mode }),
      setLang: (lang) => set({ lang }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setSlot: (slotId) => set({ slotId }),
      setMusicOn: (musicOn) => set({ musicOn }),
      setSfxOn: (sfxOn) => set({ sfxOn }),
    }),
    {
      name: 'bricktown-prefs',
      storage: createJSONStorage(safeStorage),
      partialize: (s): Prefs => ({ lang: s.lang, difficulty: s.difficulty, slotId: s.slotId, musicOn: s.musicOn, sfxOn: s.sfxOn }),
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted) }),
    },
  ),
)
