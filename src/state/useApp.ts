import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { DEVICE_CLASSES, type DeviceClass } from './deviceClass'

export type Mode = 'menu' | 'workshop' | 'guided' | 'city' | 'drive' | 'maze' | 'mazeDrive'
export type Lang = 'vi' | 'en'
export type Difficulty = 'easy' | 'normal'
export type SlotId = 1 | 2 | 3

export interface AppState {
  mode: Mode
  lang: Lang
  slotId: SlotId
  difficulty: Difficulty
  /** Sound effects off. */
  muted: boolean
  /** Workshop colour picker folded into one button, per device class (unset: see `colorsCollapsed`). */
  colorsCollapsed: Partial<Record<DeviceClass, boolean>>
  setMode: (mode: Mode) => void
  setLang: (lang: Lang) => void
  setDifficulty: (difficulty: Difficulty) => void
  setSlot: (slotId: SlotId) => void
  setMuted: (muted: boolean) => void
  setColorsCollapsed: (deviceClass: DeviceClass, collapsed: boolean) => void
}

/** Whether the colour picker is folded on `deviceClass`: the kid's choice, else folded on portrait phones only. */
export const colorsCollapsed = (s: Pick<AppState, 'colorsCollapsed'>, deviceClass: DeviceClass): boolean =>
  s.colorsCollapsed[deviceClass] ?? deviceClass === 'phonePortrait'

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

type Prefs = Pick<AppState, 'lang' | 'difficulty' | 'slotId' | 'muted' | 'colorsCollapsed'>

/** Keeps only persisted preference values that are valid; anything else falls back to defaults. */
export function sanitizePrefs(persisted: unknown): Partial<Prefs> {
  const out: Partial<Prefs> = {}
  if (typeof persisted !== 'object' || persisted === null) return out
  const p = persisted as Record<string, unknown>
  if (LANGS.includes(p.lang as Lang)) out.lang = p.lang as Lang
  if (DIFFICULTIES.includes(p.difficulty as Difficulty)) out.difficulty = p.difficulty as Difficulty
  if (SLOT_IDS.includes(p.slotId as SlotId)) out.slotId = p.slotId as SlotId
  if (typeof p.muted === 'boolean') out.muted = p.muted
  if (typeof p.colorsCollapsed === 'object' && p.colorsCollapsed !== null) {
    const saved = p.colorsCollapsed as Record<string, unknown>
    const kept: Partial<Record<DeviceClass, boolean>> = {}
    for (const c of DEVICE_CLASSES) if (typeof saved[c] === 'boolean') kept[c] = saved[c] as boolean
    out.colorsCollapsed = kept
  }
  return out
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      mode: 'menu',
      lang: 'vi',
      slotId: 1,
      difficulty: 'easy',
      muted: false,
      colorsCollapsed: {},
      setMode: (mode) => set({ mode }),
      setLang: (lang) => set({ lang }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setSlot: (slotId) => set({ slotId }),
      setMuted: (muted) => set({ muted }),
      setColorsCollapsed: (deviceClass, collapsed) =>
        set((s) => ({ colorsCollapsed: { ...s.colorsCollapsed, [deviceClass]: collapsed } })),
    }),
    {
      name: 'bricktown-prefs',
      storage: createJSONStorage(safeStorage),
      partialize: (s) => ({
        lang: s.lang,
        difficulty: s.difficulty,
        slotId: s.slotId,
        muted: s.muted,
        colorsCollapsed: s.colorsCollapsed,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted) }),
    },
  ),
)
