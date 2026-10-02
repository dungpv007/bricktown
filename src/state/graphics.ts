/**
 * Graphics settings (pure): the presets, what AUTO picks from device signals, what each toggle means for
 * the renderer, and the governor that watches frame times (adaptive resolution, one-off auto downgrade).
 * React and the browser stay out of here (see useGraphics.ts) so all of it is unit-tested.
 */

/** A preset the player can choose: battery saver, balanced, best looking. */
export type GraphicsLevel = 'battery' | 'balanced' | 'best'
/** What is stored: a level, AUTO (decided from the device) or the player's own toggles. */
export type GraphicsPreset = 'auto' | GraphicsLevel | 'custom'

export type ShadowQuality = 'off' | 'low' | 'high'
export type Resolution = 'low' | 'mid' | 'high'
export type FpsCap = 30 | 60
export type NpcDensity = 'off' | 'few' | 'many'

/** The individual switches under the preset (changing one makes the preset "custom"). */
export interface GraphicsToggles {
  shadows: ShadowQuality
  /** The pixel-ratio cap. */
  resolution: Resolution
  /** Frame cap for scenes that animate continuously (driving, a living city). */
  fps: FpsCap
  /** City life (cars, trains, people), on top of the 🚦 switch. */
  npc: NpcDensity
  /** City water shimmer. */
  water: boolean
  /** Distant LEGO mountains around the City (simple ring when off). */
  horizon: boolean
  /** Automatic day / night cycle in the City. */
  autoDayNight: boolean
  /** Studs drawn on far models (off: far models may use stud-less stand-ins). */
  farStuds: boolean
}

export const GRAPHICS_LEVELS: readonly GraphicsLevel[] = ['battery', 'balanced', 'best']
export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = ['auto', 'battery', 'balanced', 'best', 'custom']

/** Phone or not (tablets and computers share the larger caps). */
export type FormFactor = 'phone' | 'tablet'

/** The preset's toggles. Phones default to 30 fps in Cân bằng (battery), bigger screens to 60. */
export function presetToggles(level: GraphicsLevel, form: FormFactor): GraphicsToggles {
  switch (level) {
    case 'battery':
      return { shadows: 'off', resolution: 'low', fps: 30, npc: 'few', water: false, horizon: false, autoDayNight: false, farStuds: false }
    case 'balanced':
      return { shadows: 'low', resolution: 'mid', fps: form === 'phone' ? 30 : 60, npc: 'many', water: true, horizon: true, autoDayNight: false, farStuds: false }
    case 'best':
      return { shadows: 'high', resolution: 'high', fps: 60, npc: 'many', water: true, horizon: true, autoDayNight: true, farStuds: true }
  }
}

/** What the browser tells about the device (all optional: unknown never counts against it). */
export interface DeviceSignals {
  /** `navigator.deviceMemory` (GB, Chromium only, capped at 8). */
  memoryGb?: number
  /** `navigator.hardwareConcurrency`. */
  cores?: number
  /** A phone or tablet: mobile user agent, or a touch-first (coarse pointer) device. */
  mobile: boolean
  /** `devicePixelRatio`. */
  dpr: number
  /** WebGL `UNMASKED_RENDERER_WEBGL`, when the browser gives it. */
  renderer?: string
}

/** GPUs that struggle with a full 3D town: software rasterisers and old low-end mobile chips. */
const WEAK_GPU = /swiftshader|llvmpipe|software|mali-[4t][0-9]{2}\b|mali-t[0-9]|adreno[^0-9]*[1-4][0-9]{2}\b|powervr sgx|powervr rogue ge|videocore/i
/** Desktop-class GPUs: the only ones AUTO trusts with Đẹp nhất. */
const STRONG_GPU = /nvidia|geforce|radeon(?!.*vega 3)|apple m[1-9]|intel.*(iris|arc)/i

/**
 * AUTO: most phones and tablets get Cân bằng, weak ones (≤ 2 GB, ≤ 4 cores, a weak or software GPU)
 * Tiết kiệm pin; only a well-equipped computer gets Đẹp nhất.
 */
export function resolveAutoPreset(s: DeviceSignals): GraphicsLevel {
  const known = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0
  const weakGpu = s.renderer !== undefined && WEAK_GPU.test(s.renderer)
  const lowMemory = known(s.memoryGb) && s.memoryGb <= 2
  const fewCores = known(s.cores) && s.cores <= 4
  if (weakGpu || lowMemory) return 'battery'
  if (s.mobile) return fewCores ? 'battery' : 'balanced'
  const strongGpu = s.renderer !== undefined && STRONG_GPU.test(s.renderer)
  const roomy = (!known(s.memoryGb) || s.memoryGb >= 8) && known(s.cores) && s.cores >= 8
  return strongGpu && roomy ? 'best' : 'balanced'
}

/** The level a stored preset stands for (custom: null, it has its own toggles). */
export function levelOf(preset: GraphicsPreset, signals: DeviceSignals): GraphicsLevel | null {
  if (preset === 'custom') return null
  return preset === 'auto' ? resolveAutoPreset(signals) : preset
}

/** The toggles in effect for a stored preset. */
export function effectiveToggles(preset: GraphicsPreset, custom: GraphicsToggles | undefined, signals: DeviceSignals, form: FormFactor): GraphicsToggles {
  const level = levelOf(preset, signals)
  if (level !== null) return presetToggles(level, form)
  return custom ?? presetToggles(resolveAutoPreset(signals), form)
}

/** One step down (battery stays battery). */
export const lowerLevel = (level: GraphicsLevel): GraphicsLevel => (level === 'best' ? 'balanced' : 'battery')

/** What the scenes read. */
export interface RenderConfig {
  /** Highest pixel ratio drawn (the adaptive step lowers it, never below `minDpr`). */
  maxDpr: number
  minDpr: number
  shadows: boolean
  /** Shadow map quality: 'low' keeps each scene's usual map, 'high' doubles it. */
  shadowQuality: Exclude<ShadowQuality, 'off'> | null
  /** Frame cap for continuously animated scenes. */
  fps: FpsCap
  /** Fraction of the City's ambient life (0 = none). */
  npcFactor: number
  water: boolean
  horizon: boolean
  autoDayNight: boolean
  farStuds: boolean
  /** Edge smoothing: off from a pixel ratio of 2 (the pixels already smooth the edges). */
  antialias: boolean
}

/** Pixel-ratio caps per resolution: phones 1.5, tablets 1.75 in the middle setting. */
const DPR_CAP: Record<Resolution, Record<FormFactor, number>> = {
  low: { phone: 1, tablet: 1 },
  mid: { phone: 1.5, tablet: 1.75 },
  high: { phone: 2, tablet: 2 },
}

const NPC_FACTOR: Record<NpcDensity, number> = { off: 0, few: 0.5, many: 1 }

/** The renderer settings for `toggles` on a screen of `deviceDpr` pixels per CSS pixel. */
export function renderConfig(toggles: GraphicsToggles, form: FormFactor, deviceDpr: number): RenderConfig {
  const device = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1
  const maxDpr = Math.min(device, DPR_CAP[toggles.resolution][form])
  return {
    maxDpr,
    minDpr: Math.min(1, maxDpr),
    shadows: toggles.shadows !== 'off',
    shadowQuality: toggles.shadows === 'off' ? null : toggles.shadows,
    fps: toggles.fps,
    npcFactor: NPC_FACTOR[toggles.npc],
    water: toggles.water,
    horizon: toggles.horizon,
    autoDayNight: toggles.autoDayNight,
    farStuds: toggles.farStuds,
    antialias: maxDpr < 2,
  }
}

/** A scene's shadow map side for the configured quality (`base`: its usual size). */
export const shadowMapSize = (config: Pick<RenderConfig, 'shadowQuality'>, base: number): number =>
  config.shadowQuality === 'high' ? Math.min(4096, base * 2) : base

/** One adaptive resolution step (pixel ratio). */
export const DPR_STEP = 0.25

/** The pixel ratio drawn: the cap minus the adaptive steps, never under the floor. */
export const adaptedDpr = (config: Pick<RenderConfig, 'maxDpr' | 'minDpr'>, steps: number): number =>
  Math.max(config.minDpr, config.maxDpr - steps * DPR_STEP)

/** Timing rules of the governor (ms). */
export const GOVERNOR = {
  /** A frame interval this much over the target is slow, under `goodRatio` is fine. */
  slowRatio: 1.5,
  goodRatio: 1.2,
  /** Gaps longer than this are idle time (render on demand), not slow frames. */
  maxGapMs: 250,
  /** Slow this long: one resolution step down. */
  dprAfterMs: 3000,
  /** Fine this long: one resolution step back up. */
  recoverAfterMs: 12000,
  /** Slow this long (resolution already lowered or not): one preset step down, once. */
  downgradeAfterMs: 5000,
  /** Fine this long clears the slow timers (so short hiccups never add up). */
  forgiveAfterMs: 1000,
  /** Smoothing of the frame interval (exponential moving average weight of a new frame). */
  smoothing: 0.1,
} as const

export type GovernorAction = 'dprDown' | 'dprUp' | 'downgrade'

/**
 * Watches the intervals between drawn frames of a continuously animated scene against its target
 * (1000 / fps cap) and decides, with hysteresis: lower the resolution one step after about 3 s of slow
 * frames, raise it again after a long fine stretch, and step the preset down once after about 5 s of
 * slow frames. Idle gaps (render on demand) are ignored, so a still scene is never judged.
 */
export class PerfGovernor {
  private ema = 0
  private slowMs = 0
  private slowTotalMs = 0
  private goodMs = 0
  private downgraded = false
  steps = 0

  constructor(
    private readonly maxSteps: number,
    /** Whether a preset downgrade is allowed (Cân bằng and Đẹp nhất). */
    private readonly canDowngrade: boolean,
  ) {}

  /** Feeds one frame interval; returns what to do now, if anything. */
  sample(intervalMs: number, targetMs: number): GovernorAction | null {
    if (!(intervalMs > 0) || intervalMs > GOVERNOR.maxGapMs) return null
    this.ema = this.ema === 0 ? intervalMs : this.ema + (intervalMs - this.ema) * GOVERNOR.smoothing
    if (this.ema > targetMs * GOVERNOR.slowRatio) {
      this.slowMs += intervalMs
      this.slowTotalMs += intervalMs
      this.goodMs = 0
    } else if (this.ema < targetMs * GOVERNOR.goodRatio) {
      this.goodMs += intervalMs
      if (this.goodMs >= GOVERNOR.forgiveAfterMs) {
        this.slowMs = 0
        this.slowTotalMs = 0
      }
    }
    if (this.canDowngrade && !this.downgraded && this.slowTotalMs >= GOVERNOR.downgradeAfterMs) {
      this.downgraded = true
      this.slowMs = 0
      this.slowTotalMs = 0
      return 'downgrade'
    }
    if (this.slowMs >= GOVERNOR.dprAfterMs && this.steps < this.maxSteps) {
      this.steps += 1
      this.slowMs = 0
      return 'dprDown'
    }
    if (this.goodMs >= GOVERNOR.recoverAfterMs && this.steps > 0) {
      this.steps -= 1
      this.goodMs = 0
      return 'dprUp'
    }
    return null
  }
}

/** How many adaptive steps fit between the cap and the floor. */
export const maxDprSteps = (config: Pick<RenderConfig, 'maxDpr' | 'minDpr'>): number =>
  Math.max(0, Math.round((config.maxDpr - config.minDpr) / DPR_STEP))

/** Keeps only valid stored toggles (anything else: the fallback's value). */
export function sanitizeToggles(value: unknown, fallback: GraphicsToggles): GraphicsToggles {
  if (typeof value !== 'object' || value === null) return fallback
  const v = value as Record<string, unknown>
  const pick = <T>(key: keyof GraphicsToggles, allowed: readonly T[]): T =>
    allowed.includes(v[key] as T) ? (v[key] as T) : (fallback[key] as T)
  const bool = (key: keyof GraphicsToggles): boolean => (typeof v[key] === 'boolean' ? (v[key] as boolean) : (fallback[key] as boolean))
  return {
    shadows: pick<ShadowQuality>('shadows', ['off', 'low', 'high']),
    resolution: pick<Resolution>('resolution', ['low', 'mid', 'high']),
    fps: pick<FpsCap>('fps', [30, 60]),
    npc: pick<NpcDensity>('npc', ['off', 'few', 'many']),
    water: bool('water'),
    horizon: bool('horizon'),
    autoDayNight: bool('autoDayNight'),
    farStuds: bool('farStuds'),
  }
}
