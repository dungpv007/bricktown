import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { DEVICE_CLASSES, type DeviceClass } from './deviceClass'
import { GRAPHICS_PRESETS, presetToggles, sanitizeToggles, type GraphicsPreset, type GraphicsToggles } from './graphics'

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
  /** Background music volume, 0..1 (the 🎵 toggle stays the on/off switch). */
  musicVolume: number
  /** Sound effects volume, 0..1. */
  sfxVolume: number
  /** Workshop colour picker folded into one button, per device class (unset: see `colorsCollapsed`). */
  colorsCollapsed: Partial<Record<DeviceClass, boolean>>
  /** Ambient City life (cars, trains, people) on; off by default when the device asks for reduced motion. */
  npcOn: boolean
  /** Graphics preset (⚙️ Đồ họa); AUTO is decided from the device (see state/graphics). */
  graphicsPreset: GraphicsPreset
  /** The player's own toggles, used while the preset is 'custom'. */
  graphicsCustom: GraphicsToggles
  setMode: (mode: Mode) => void
  setLang: (lang: Lang) => void
  setDifficulty: (difficulty: Difficulty) => void
  setSlot: (slotId: SlotId) => void
  setMusicOn: (on: boolean) => void
  setSfxOn: (on: boolean) => void
  setMusicVolume: (volume: number) => void
  setSfxVolume: (volume: number) => void
  setColorsCollapsed: (deviceClass: DeviceClass, collapsed: boolean) => void
  setNpcOn: (on: boolean) => void
  setGraphicsPreset: (preset: GraphicsPreset) => void
  /** Switches to 'custom' with these toggles. */
  setGraphicsCustom: (toggles: GraphicsToggles) => void
}

/** Whether the colour picker is folded on `deviceClass`: the kid's choice, else folded on portrait phones only. */
export const colorsCollapsed = (s: Pick<AppState, 'colorsCollapsed'>, deviceClass: DeviceClass): boolean =>
  s.colorsCollapsed[deviceClass] ?? deviceClass === 'phonePortrait'

export const DEFAULT_VOLUME = 0.5

/** A volume clamped to 0..1; anything that is not a finite number becomes `fallback`. */
export function normalizeVolume(value: unknown, fallback: number = DEFAULT_VOLUME): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

/** Whether the device asks for reduced motion (false where it cannot be asked, e.g. in node tests). */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

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

type Prefs = Pick<
  AppState,
  'lang' | 'difficulty' | 'slotId' | 'musicOn' | 'sfxOn' | 'musicVolume' | 'sfxVolume' | 'colorsCollapsed' | 'npcOn' | 'graphicsPreset' | 'graphicsCustom'
>

/** Custom toggles before the player made any: Cân bằng on a tablet. */
const DEFAULT_CUSTOM: GraphicsToggles = presetToggles('balanced', 'tablet')

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
  // Saves from before the volume sliders have neither field: the defaults apply.
  if (typeof p.musicVolume === 'number' && Number.isFinite(p.musicVolume)) out.musicVolume = normalizeVolume(p.musicVolume)
  if (typeof p.sfxVolume === 'number' && Number.isFinite(p.sfxVolume)) out.sfxVolume = normalizeVolume(p.sfxVolume)
  if (typeof p.npcOn === 'boolean') out.npcOn = p.npcOn
  if (GRAPHICS_PRESETS.includes(p.graphicsPreset as GraphicsPreset)) out.graphicsPreset = p.graphicsPreset as GraphicsPreset
  if (p.graphicsCustom !== undefined) out.graphicsCustom = sanitizeToggles(p.graphicsCustom, DEFAULT_CUSTOM)
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
      musicOn: true,
      sfxOn: true,
      musicVolume: DEFAULT_VOLUME,
      sfxVolume: DEFAULT_VOLUME,
      colorsCollapsed: {},
      npcOn: !prefersReducedMotion(),
      graphicsPreset: 'auto',
      graphicsCustom: DEFAULT_CUSTOM,
      setMode: (mode) => set({ mode }),
      setLang: (lang) => set({ lang }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setSlot: (slotId) => set({ slotId }),
      setMusicOn: (musicOn) => set({ musicOn }),
      setSfxOn: (sfxOn) => set({ sfxOn }),
      setMusicVolume: (volume) => set({ musicVolume: normalizeVolume(volume) }),
      setSfxVolume: (volume) => set({ sfxVolume: normalizeVolume(volume) }),
      setColorsCollapsed: (deviceClass, collapsed) =>
        set((s) => ({ colorsCollapsed: { ...s.colorsCollapsed, [deviceClass]: collapsed } })),
      setNpcOn: (npcOn) => set({ npcOn }),
      setGraphicsPreset: (graphicsPreset) => set({ graphicsPreset }),
      setGraphicsCustom: (toggles) => set({ graphicsPreset: 'custom', graphicsCustom: sanitizeToggles(toggles, DEFAULT_CUSTOM) }),
    }),
    {
      name: 'bricktown-prefs',
      storage: createJSONStorage(safeStorage),
      partialize: (s): Prefs => ({
        lang: s.lang,
        difficulty: s.difficulty,
        slotId: s.slotId,
        musicOn: s.musicOn,
        sfxOn: s.sfxOn,
        musicVolume: s.musicVolume,
        sfxVolume: s.sfxVolume,
        colorsCollapsed: s.colorsCollapsed,
        npcOn: s.npcOn,
        graphicsPreset: s.graphicsPreset,
        graphicsCustom: s.graphicsCustom,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePrefs(persisted) }),
    },
  ),
)
