import { describe, expect, it } from 'vitest'
import {
  blendLight,
  CITY_TIMES,
  cloneLight,
  CYCLE_HOLD,
  cycleLight,
  hexToLinear,
  lerp3,
  linearToHex,
  nearestTime,
  nextTime,
  presetPhase,
  TIME_PRESETS,
} from './timeOfDay'

const close = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps)

describe('colours', () => {
  it('converts sRGB hex to linear and back', () => {
    expect(hexToLinear('#000000')).toEqual([0, 0, 0])
    expect(hexToLinear('#ffffff')).toEqual([1, 1, 1])
    // Mid grey is darker in linear light.
    expect(hexToLinear('#808080')[0]).toBeCloseTo(0.2158, 3)
    for (const hex of ['#87ceeb', '#ffa56a', '#2b3b6e']) expect(linearToHex(hexToLinear(hex))).toBe(hex)
  })

  it('interpolates triples component-wise', () => {
    const out: [number, number, number] = [0, 0, 0]
    expect(lerp3(out, [0, 1, 2], [2, 3, 6], 0.5)).toEqual([1, 2, 4])
    expect(lerp3(out, [0, 0, 0], [1, 1, 1], 0)).toEqual([0, 0, 0])
  })
})

describe('preset blending', () => {
  it('starts at one preset and ends at the other', () => {
    const out = cloneLight()
    blendLight(out, TIME_PRESETS.noon, TIME_PRESETS.night, 0)
    expect(close(out.sunColor, TIME_PRESETS.noon.sunColor)).toBe(true)
    expect(out.night).toBe(0)
    blendLight(out, TIME_PRESETS.noon, TIME_PRESETS.night, 1)
    expect(close(out.skyHorizon, TIME_PRESETS.night.skyHorizon)).toBe(true)
    expect(out.night).toBe(1)
  })

  it('halfway is the average, and the sun direction stays a unit vector', () => {
    const out = cloneLight()
    blendLight(out, TIME_PRESETS.morning, TIME_PRESETS.sunset, 0.5)
    expect(out.sunIntensity).toBeCloseTo((TIME_PRESETS.morning.sunIntensity + TIME_PRESETS.sunset.sunIntensity) / 2)
    expect(out.skyTop[2]).toBeCloseTo((TIME_PRESETS.morning.skyTop[2] + TIME_PRESETS.sunset.skyTop[2]) / 2)
    expect(Math.hypot(...out.sunDir)).toBeCloseTo(1)
  })

  it('clamps t and never touches the presets', () => {
    const before = JSON.stringify(TIME_PRESETS)
    const out = cloneLight()
    blendLight(out, TIME_PRESETS.noon, TIME_PRESETS.sunset, 3)
    expect(close(out.sunColor, TIME_PRESETS.sunset.sunColor)).toBe(true)
    expect(JSON.stringify(TIME_PRESETS)).toBe(before)
  })

  it('night is darker than noon but not pitch black', () => {
    const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    const n = TIME_PRESETS.night
    expect(n.sunIntensity).toBeLessThan(TIME_PRESETS.noon.sunIntensity)
    expect(lum(n.hemiSky) * n.hemiIntensity).toBeGreaterThan(0.1)
  })
})

describe('the automatic day', () => {
  it('rests on each preset at the start of its quarter', () => {
    const out = cloneLight()
    for (const time of CITY_TIMES) {
      cycleLight(out, presetPhase(time) + (CYCLE_HOLD / 4) * 0.5)
      expect(close(out.sunColor, TIME_PRESETS[time].sunColor)).toBe(true)
      expect(nearestTime(presetPhase(time))).toBe(time)
    }
  })

  it('blends smoothly (small phase steps give small changes) and wraps night -> morning', () => {
    const a = cloneLight()
    const b = cloneLight()
    let worst = 0
    for (let p = 0; p < 1; p += 0.001) {
      cycleLight(a, p)
      cycleLight(b, p + 0.001)
      worst = Math.max(worst, Math.abs(a.night - b.night), ...a.skyHorizon.map((v, i) => Math.abs(v - b.skyHorizon[i])))
    }
    expect(worst).toBeLessThan(0.03)
    cycleLight(a, 0.999999)
    expect(close(a.sunColor, TIME_PRESETS.morning.sunColor, 1e-3)).toBe(true)
    cycleLight(a, 1.25)
    cycleLight(b, 0.25)
    expect(close(a.sunDir, b.sunDir)).toBe(true)
  })

  it('the time button cycles all four presets', () => {
    expect(CITY_TIMES.map(nextTime)).toEqual(['noon', 'sunset', 'night', 'morning'])
  })
})
