import { describe, expect, it } from 'vitest'
import {
  adaptedDpr,
  effectiveToggles,
  GOVERNOR,
  maxDprSteps,
  PerfGovernor,
  presetToggles,
  renderConfig,
  resolveAutoPreset,
  sanitizeToggles,
  shadowMapSize,
  type GovernorAction,
} from './graphics'

describe('resolveAutoPreset', () => {
  it('gives most phones and tablets Cân bằng', () => {
    expect(resolveAutoPreset({ mobile: true, dpr: 3.5, cores: 8, memoryGb: 8, renderer: 'Adreno (TM) 750' })).toBe('balanced')
    expect(resolveAutoPreset({ mobile: true, dpr: 2, cores: 6, renderer: 'Apple GPU' })).toBe('balanced')
    // Nothing known: no reason to assume the worst.
    expect(resolveAutoPreset({ mobile: true, dpr: 2 })).toBe('balanced')
  })

  it('gives low-end devices Tiết kiệm pin', () => {
    expect(resolveAutoPreset({ mobile: true, dpr: 2, memoryGb: 2, cores: 8 })).toBe('battery')
    expect(resolveAutoPreset({ mobile: true, dpr: 2, cores: 4 })).toBe('battery')
    expect(resolveAutoPreset({ mobile: true, dpr: 2, cores: 8, renderer: 'Mali-T830' })).toBe('battery')
    expect(resolveAutoPreset({ mobile: true, dpr: 2, cores: 8, renderer: 'Adreno (TM) 308' })).toBe('battery')
    // A computer drawing in software.
    expect(resolveAutoPreset({ mobile: false, dpr: 1, cores: 16, memoryGb: 8, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' })).toBe('battery')
  })

  it('keeps Đẹp nhất for well-equipped computers with a strong GPU', () => {
    expect(resolveAutoPreset({ mobile: false, dpr: 2, cores: 10, memoryGb: 8, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' })).toBe('best')
    expect(resolveAutoPreset({ mobile: false, dpr: 1, cores: 12, renderer: 'NVIDIA GeForce RTX 3060' })).toBe('best')
    // Strong GPU, but a phone: still Cân bằng (battery matters more than looks there).
    expect(resolveAutoPreset({ mobile: true, dpr: 3, cores: 8, memoryGb: 8, renderer: 'Apple M2' })).toBe('balanced')
    // A computer with an ordinary GPU or few cores.
    expect(resolveAutoPreset({ mobile: false, dpr: 1, cores: 8, memoryGb: 8, renderer: 'Intel(R) UHD Graphics 620' })).toBe('balanced')
    expect(resolveAutoPreset({ mobile: false, dpr: 1, cores: 4, memoryGb: 8, renderer: 'NVIDIA GeForce GTX 1050' })).toBe('balanced')
  })
})

describe('presets and toggles', () => {
  it('Tiết kiệm pin: 30 fps, pixel ratio 1, no shadows, few cars, still water, no auto day/night, simple horizon', () => {
    expect(presetToggles('battery', 'phone')).toEqual({
      shadows: 'off',
      resolution: 'low',
      fps: 30,
      npc: 'few',
      water: false,
      horizon: false,
      autoDayNight: false,
      farStuds: false,
    })
  })

  it('Đẹp nhất: 60 fps, high resolution, high shadows, everything on', () => {
    expect(presetToggles('best', 'phone')).toEqual({
      shadows: 'high',
      resolution: 'high',
      fps: 60,
      npc: 'many',
      water: true,
      horizon: true,
      autoDayNight: true,
      farStuds: true,
    })
  })

  it('Cân bằng runs phones at 30 fps and bigger screens at 60', () => {
    expect(presetToggles('balanced', 'phone').fps).toBe(30)
    expect(presetToggles('balanced', 'tablet').fps).toBe(60)
  })

  it('AUTO follows the device; custom keeps the player toggles', () => {
    const phone = { mobile: true, dpr: 3, cores: 8 }
    expect(effectiveToggles('auto', undefined, phone, 'phone')).toEqual(presetToggles('balanced', 'phone'))
    expect(effectiveToggles('best', undefined, phone, 'phone')).toEqual(presetToggles('best', 'phone'))
    const custom = { ...presetToggles('battery', 'phone'), fps: 60 as const }
    expect(effectiveToggles('custom', custom, phone, 'phone')).toEqual(custom)
  })

  it('stored toggles keep only valid values', () => {
    const fallback = presetToggles('balanced', 'tablet')
    expect(sanitizeToggles({ shadows: 'ultra', fps: 30, water: 'yes', npc: 'few' }, fallback)).toEqual({ ...fallback, fps: 30, npc: 'few' })
    expect(sanitizeToggles(null, fallback)).toEqual(fallback)
  })
})

describe('renderConfig', () => {
  it('caps the pixel ratio: phones 1.5, tablets 1.75 in the middle setting, 1 for low, 2 for high', () => {
    const mid = presetToggles('balanced', 'phone')
    expect(renderConfig(mid, 'phone', 3.5).maxDpr).toBe(1.5)
    expect(renderConfig(mid, 'tablet', 3).maxDpr).toBe(1.75)
    expect(renderConfig(presetToggles('battery', 'phone'), 'phone', 3.5).maxDpr).toBe(1)
    expect(renderConfig(presetToggles('best', 'phone'), 'phone', 3.5).maxDpr).toBe(2)
    // Never above what the screen has.
    expect(renderConfig(presetToggles('best', 'tablet'), 'tablet', 1).maxDpr).toBe(1)
  })

  it('maps each toggle', () => {
    const c = renderConfig({ ...presetToggles('best', 'tablet'), shadows: 'off', npc: 'few', water: false }, 'tablet', 2)
    expect(c).toMatchObject({ shadows: false, shadowQuality: null, fps: 60, npcFactor: 0.5, water: false, horizon: true, autoDayNight: true, farStuds: true })
    expect(renderConfig({ ...presetToggles('battery', 'phone'), npc: 'off' }, 'phone', 2).npcFactor).toBe(0)
    expect(renderConfig(presetToggles('balanced', 'tablet'), 'tablet', 2).npcFactor).toBe(1)
  })

  it('turns antialiasing off from a pixel ratio of 2', () => {
    expect(renderConfig(presetToggles('best', 'phone'), 'phone', 3).antialias).toBe(false)
    expect(renderConfig(presetToggles('balanced', 'phone'), 'phone', 3).antialias).toBe(true)
  })

  it('doubles the shadow map for high shadows (at most 4096)', () => {
    expect(shadowMapSize({ shadowQuality: 'low' }, 1024)).toBe(1024)
    expect(shadowMapSize({ shadowQuality: 'high' }, 1024)).toBe(2048)
    expect(shadowMapSize({ shadowQuality: 'high' }, 4096)).toBe(4096)
  })

  it('adaptive steps lower the pixel ratio, never under the floor', () => {
    const c = renderConfig(presetToggles('balanced', 'tablet'), 'tablet', 2)
    expect(maxDprSteps(c)).toBe(3)
    expect(adaptedDpr(c, 0)).toBe(1.75)
    expect(adaptedDpr(c, 1)).toBe(1.5)
    expect(adaptedDpr(c, 9)).toBe(1)
  })
})

describe('PerfGovernor', () => {
  const TARGET = 1000 / 30
  /** Feeds `ms` worth of frames `interval` apart; returns the actions taken. */
  const run = (g: PerfGovernor, interval: number, ms: number) => {
    const actions: GovernorAction[] = []
    for (let t = 0; t < ms; t += interval) {
      const a = g.sample(interval, TARGET)
      if (a) actions.push(a)
    }
    return actions
  }

  it('lowers the resolution after about 3 s of slow frames, then steps the preset down once at about 5 s', () => {
    const g = new PerfGovernor(3, true)
    expect(run(g, 80, 2800)).toEqual([])
    expect(run(g, 80, 400)).toEqual(['dprDown'])
    expect(g.steps).toBe(1)
    expect(run(g, 80, 2000)).toEqual(['downgrade'])
    // Only once: still slow afterwards only lowers the resolution further.
    expect(run(g, 80, 10_000)).not.toContain('downgrade')
  })

  it('forgives short hiccups: slow stretches broken by a second of smooth frames never add up', () => {
    const g = new PerfGovernor(3, true)
    for (let i = 0; i < 5; i++) {
      expect(run(g, 80, 2400)).toEqual([])
      run(g, 20, 1500) // smooth again (the average comes back down first)
    }
    expect(g.steps).toBe(0)
  })

  it('ignores idle gaps (render on demand) and frames at the target', () => {
    const g = new PerfGovernor(3, true)
    expect(run(g, 2000, 60_000)).toEqual([])
    expect(run(g, TARGET, 60_000)).toEqual([])
  })

  it('raises the resolution back slowly after a long smooth stretch', () => {
    const g = new PerfGovernor(3, false)
    run(g, 80, 3500)
    expect(g.steps).toBe(1)
    expect(run(g, TARGET, GOVERNOR.recoverAfterMs - 2000)).toEqual([])
    expect(run(g, TARGET, 4000)).toEqual(['dprUp'])
    expect(g.steps).toBe(0)
  })

  it('never steps the preset down when not allowed (Tiết kiệm pin, custom)', () => {
    const g = new PerfGovernor(0, false)
    expect(run(g, 100, 30_000)).toEqual([])
  })
})
