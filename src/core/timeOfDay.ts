/**
 * City time of day (pure): the four presets (morning, noon, sunset, night), blending between two of
 * them, and the automatic day cycle that runs through all four. Colours are linear RGB triples (what
 * three.js lights and shader uniforms take), written into caller-owned objects so a frame loop
 * allocates nothing.
 */

export type CityTime = 'morning' | 'noon' | 'sunset' | 'night'

/** The cycle order (the 🕒 button steps through it too). */
export const CITY_TIMES: readonly CityTime[] = ['morning', 'noon', 'sunset', 'night']

export const CITY_TIME_ICONS: Record<CityTime, string> = { morning: '☀️', noon: '🌞', sunset: '🌅', night: '🌙' }

export type Rgb = [number, number, number]
export type Vec3 = [number, number, number]

/** Everything the City's lighting, sky and night lights read. */
export interface LightState {
  /** Unit vector from the ground towards the sun (or the moon at night). */
  sunDir: Vec3
  sunColor: Rgb
  sunIntensity: number
  hemiSky: Rgb
  hemiGround: Rgb
  hemiIntensity: number
  /** Sky dome: straight up, and at the horizon (also the fog and the far ground). */
  skyTop: Rgb
  skyHorizon: Rgb
  /**
   * Where the sun / moon disc shows on the dome (unit vector). Apart from the light's direction: the
   * City camera never looks more than a degree or so above the horizon, so the disc sits low (the
   * setting sun, the rising moon) while the light keeps an angle that lights the town well.
   */
  discDir: Vec3
  /** The sun / moon disc on the dome. */
  discColor: Rgb
  /** Angular radius of the disc (radians). */
  discSize: number
  /** 0 day … 1 night: street lamps, lit windows, headlights, stars. */
  night: number
}

/** sRGB 0..255 channel -> linear 0..1. */
export const srgbToLinear = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** '#rrggbb' -> linear RGB. */
export function hexToLinear(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [srgbToLinear((n >> 16) & 255), srgbToLinear((n >> 8) & 255), srgbToLinear(n & 255)]
}

/** Linear RGB -> '#rrggbb' (sRGB), e.g. for the dev handle. */
export function linearToHex([r, g, b]: Rgb): string {
  const enc = (v: number) => {
    const c = Math.min(1, Math.max(0, v))
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${enc(r)}${enc(g)}${enc(b)}`
}

/** Unit vector for a compass direction (degrees, 0 = +Z, 90 = +X) and an elevation (degrees). */
export function sunVector(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
}

function preset(p: {
  az: number
  el: number
  sun: string
  sunI: number
  hemiSky: string
  hemiGround: string
  hemiI: number
  top: string
  horizon: string
  disc: string
  discSize: number
  /** Disc direction (degrees). */
  discAz: number
  discEl: number
  night: number
}): LightState {
  return {
    sunDir: sunVector(p.az, p.el),
    sunColor: hexToLinear(p.sun),
    sunIntensity: p.sunI,
    hemiSky: hexToLinear(p.hemiSky),
    hemiGround: hexToLinear(p.hemiGround),
    hemiIntensity: p.hemiI,
    skyTop: hexToLinear(p.top),
    skyHorizon: hexToLinear(p.horizon),
    discDir: sunVector(p.discAz, p.discEl),
    discColor: hexToLinear(p.disc),
    discSize: p.discSize,
    night: p.night,
  }
}

/**
 * The presets. Noon is the City's look from before times of day (the same sun, sky and fog); night
 * stays readable (moonlight and a blue sky light), never pitch black.
 */
export const TIME_PRESETS: Record<CityTime, LightState> = {
  morning: preset({
    az: 115, el: 24, sun: '#ffd49c', sunI: 2.1, hemiSky: '#f2ecff', hemiGround: '#7a9a6a', hemiI: 1.45,
    top: '#6aaee6', horizon: '#f8cfa6', disc: '#fff0c4', discSize: 0.07, discAz: 150, discEl: 1.5, night: 0,
  }),
  noon: preset({
    az: 56, el: 59, sun: '#ffffff', sunI: 2.2, hemiSky: '#ffffff', hemiGround: '#7a9a6a', hemiI: 1.6,
    top: '#4d9be3', horizon: '#87ceeb', disc: '#fffbe8', discSize: 0.05, discAz: 56, discEl: 59, night: 0,
  }),
  sunset: preset({
    az: 250, el: 15, sun: '#ffa060', sunI: 2.0, hemiSky: '#ffd2b0', hemiGround: '#7c8a62', hemiI: 1.45,
    top: '#4a5aa6', horizon: '#ffa56a', disc: '#ffd27a', discSize: 0.1, discAz: 200, discEl: 1, night: 0.35,
  }),
  night: preset({
    az: 220, el: 42, sun: '#9fb6ff', sunI: 0.75, hemiSky: '#6474b0', hemiGround: '#2c3444', hemiI: 1.05,
    top: '#0a1433', horizon: '#2b3b6e', disc: '#eef2ff', discSize: 0.06, discAz: 160, discEl: 2, night: 1,
  }),
}

/** A fresh, independent copy of a state (or of noon). */
export function cloneLight(s: LightState = TIME_PRESETS.noon): LightState {
  return {
    sunDir: [...s.sunDir],
    sunColor: [...s.sunColor],
    sunIntensity: s.sunIntensity,
    hemiSky: [...s.hemiSky],
    hemiGround: [...s.hemiGround],
    hemiIntensity: s.hemiIntensity,
    skyTop: [...s.skyTop],
    skyHorizon: [...s.skyHorizon],
    discDir: [...s.discDir],
    discColor: [...s.discColor],
    discSize: s.discSize,
    night: s.night,
  }
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Component-wise mix of two triples into `out` (which may be `a` or `b`). */
export function lerp3<T extends number[]>(out: T, a: readonly number[], b: readonly number[], t: number): T {
  out[0] = lerp(a[0], b[0], t)
  out[1] = lerp(a[1], b[1], t)
  out[2] = lerp(a[2], b[2], t)
  return out
}

/** `a` blended towards `b` by `t` (0..1, clamped), written into `out`; the sun direction stays a unit vector. */
export function blendLight(out: LightState, a: LightState, b: LightState, t: number): LightState {
  const k = Math.min(1, Math.max(0, t))
  lerp3(out.sunDir, a.sunDir, b.sunDir, k)
  const len = Math.hypot(out.sunDir[0], out.sunDir[1], out.sunDir[2]) || 1
  out.sunDir[0] /= len
  out.sunDir[1] /= len
  out.sunDir[2] /= len
  lerp3(out.sunColor, a.sunColor, b.sunColor, k)
  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, k)
  lerp3(out.hemiSky, a.hemiSky, b.hemiSky, k)
  lerp3(out.hemiGround, a.hemiGround, b.hemiGround, k)
  out.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, k)
  lerp3(out.skyTop, a.skyTop, b.skyTop, k)
  lerp3(out.skyHorizon, a.skyHorizon, b.skyHorizon, k)
  lerp3(out.discDir, a.discDir, b.discDir, k)
  const dl = Math.hypot(out.discDir[0], out.discDir[1], out.discDir[2]) || 1
  out.discDir[0] /= dl
  out.discDir[1] /= dl
  out.discDir[2] /= dl
  lerp3(out.discColor, a.discColor, b.discColor, k)
  out.discSize = lerp(a.discSize, b.discSize, k)
  out.night = lerp(a.night, b.night, k)
  return out
}

/** Copies `s` into `out`. */
export const copyLight = (out: LightState, s: LightState): LightState => blendLight(out, s, s, 0)

/** One automatic day (seconds): morning → noon → sunset → night → morning. */
export const DAY_SECONDS = 300
/** Part of each quarter of the day spent resting on its preset before blending to the next. */
export const CYCLE_HOLD = 0.35

export const smoothstep = (t: number): number => {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

/** Day phase (0..1) where a preset starts its quarter. */
export const presetPhase = (time: CityTime): number => CITY_TIMES.indexOf(time) / CITY_TIMES.length

const wrap = (phase: number) => ((phase % 1) + 1) % 1

/** The light at a phase (0..1, wraps) of the automatic day, written into `out`. */
export function cycleLight(out: LightState, phase: number): LightState {
  const n = CITY_TIMES.length
  const p = wrap(phase) * n
  const i = Math.floor(p) % n
  const local = p - Math.floor(p)
  const t = smoothstep((local - CYCLE_HOLD) / (1 - CYCLE_HOLD))
  return blendLight(out, TIME_PRESETS[CITY_TIMES[i]], TIME_PRESETS[CITY_TIMES[(i + 1) % n]], t)
}

/** The preset the automatic day looks most like at `phase` (what the 🕒 button shows). */
export function nearestTime(phase: number): CityTime {
  const n = CITY_TIMES.length
  const p = wrap(phase) * n
  const i = Math.floor(p) % n
  const local = p - Math.floor(p)
  // Halfway through the blend part of the quarter.
  return local < (1 + CYCLE_HOLD) / 2 ? CITY_TIMES[i] : CITY_TIMES[(i + 1) % n]
}

/** The preset after `time` (the 🕒 button). */
export const nextTime = (time: CityTime): CityTime => CITY_TIMES[(CITY_TIMES.indexOf(time) + 1) % CITY_TIMES.length]
