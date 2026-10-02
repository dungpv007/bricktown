import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../state/useApp'
import {
  coin,
  engineParams,
  error,
  fanfare,
  horn,
  installAudioUnlock,
  MAX_VOICES,
  paint,
  pop,
  resetAudioForTests,
  snap,
  soundLength,
  sfxMasterGain,
  SOUNDS,
  startEngine,
  success,
  thunk,
  whoosh,
} from './sfx'

/** Minimal AudioContext double that records how many sources (oscillators, noise) were started. */
class FakeParam {
  value = 0
  setValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
  setTargetAtTime = vi.fn()
  cancelScheduledValues = vi.fn()
}
class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()
  Q = new FakeParam()
  type = ''
  buffer: unknown = null
  connect = vi.fn()
  start = vi.fn(() => {
    FakeAudioContext.started++
  })
  stop = vi.fn()
}
class FakeAudioContext {
  static created = 0
  static started = 0
  static last: FakeAudioContext | null = null
  /** Every gain node made, in order: the first one is the sound-effects master. */
  static gains: FakeNode[] = []
  state = 'suspended'
  currentTime = 0
  sampleRate = 8000
  destination = new FakeNode()
  resume = vi.fn(() => {
    this.state = 'running'
    return Promise.resolve()
  })
  constructor() {
    FakeAudioContext.created++
    FakeAudioContext.last = this
  }
  createGain = () => {
    const node = new FakeNode()
    FakeAudioContext.gains.push(node)
    return node
  }
  createOscillator = () => new FakeNode()
  createBiquadFilter = () => new FakeNode()
  createBufferSource = () => new FakeNode()
  createBuffer = (_ch: number, length: number) => {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
}

const g = globalThis as unknown as { AudioContext?: unknown }
/** Moves the clock of the context the module created. */
const ctxTime = (t: number) => {
  if (FakeAudioContext.last) FakeAudioContext.last.currentTime = t
}

/** Sources (oscillators, noise bursts, vibrato LFOs) a sound starts. */
const sources = (name: keyof typeof SOUNDS) => SOUNDS[name].tones.reduce((n, t) => n + (t.vibrato ? 2 : 1), 0)

beforeEach(() => {
  FakeAudioContext.created = 0
  FakeAudioContext.started = 0
  FakeAudioContext.last = null
  FakeAudioContext.gains = []
  g.AudioContext = FakeAudioContext
  resetAudioForTests()
  useApp.setState({ sfxOn: true, musicOn: true, sfxVolume: 0.5 })
})
afterEach(() => {
  delete g.AudioContext
  resetAudioForTests()
  useApp.setState({ sfxOn: true, musicOn: true, sfxVolume: 0.5 })
})

describe('sfx volume', () => {
  it('maps the slider to the master gain: 0.5 is the original level, 0 silent, 1 double', () => {
    expect(sfxMasterGain(0.5)).toBeCloseTo(0.35)
    expect(sfxMasterGain(0)).toBe(0)
    expect(sfxMasterGain(1)).toBeCloseTo(0.7)
    expect(sfxMasterGain(2)).toBeCloseTo(0.7)
    expect(sfxMasterGain(-1)).toBe(0)
  })

  it('creates the master at the saved volume and follows later changes live', () => {
    useApp.getState().setSfxVolume(1)
    snap()
    const master = FakeAudioContext.gains[0]
    expect(master.gain.value).toBeCloseTo(0.7)
    useApp.getState().setSfxVolume(0.25)
    expect(master.gain.setTargetAtTime).toHaveBeenCalledTimes(1)
    expect(master.gain.setTargetAtTime.mock.calls[0][0]).toBeCloseTo(0.175)
  })

  it('leaves the master alone while no sound was made yet', () => {
    useApp.getState().setSfxVolume(0.9)
    expect(FakeAudioContext.created).toBe(0)
  })
})

describe('sfx', () => {
  it('plays every voice of a sound while sound effects are on', () => {
    snap()
    expect(FakeAudioContext.started).toBe(sources('snap'))
    success()
    expect(FakeAudioContext.started).toBe(sources('snap') + sources('success'))
  })

  it('does nothing, and never creates the context, while sound effects are off', () => {
    useApp.getState().setSfxOn(false)
    for (const fn of [snap, pop, paint, error, success, fanfare, whoosh, thunk, coin, () => horn('fire')]) fn()
    expect(startEngine()).toBeNull()
    expect(FakeAudioContext.started).toBe(0)
    expect(FakeAudioContext.created).toBe(0)
  })

  it('ignores the music toggle', () => {
    useApp.getState().setMusicOn(false)
    pop()
    expect(FakeAudioContext.started).toBe(sources('pop'))
  })

  it('plays again after switching back on', () => {
    useApp.getState().setSfxOn(false)
    pop()
    useApp.getState().setSfxOn(true)
    pop()
    expect(FakeAudioContext.started).toBe(sources('pop'))
  })

  it('shares one context and is a safe no-op without WebAudio', () => {
    snap()
    pop()
    expect(FakeAudioContext.created).toBe(1)
    delete g.AudioContext
    resetAudioForTests()
    expect(() => horn()).not.toThrow()
    expect(() => fanfare()).not.toThrow()
    expect(startEngine()).toBeNull()
  })

  it('caps how many sounds play at once, keeps a slot for horns and fanfares, and frees voices as they end', () => {
    for (let i = 0; i < MAX_VOICES + 3; i++) pop()
    const clicks = (MAX_VOICES - 1) * sources('pop')
    expect(FakeAudioContext.started).toBe(clicks)
    fanfare() // the reserved slot
    expect(FakeAudioContext.started).toBe(clicks + sources('fanfare'))
    ctxTime(soundLength(SOUNDS.pop) + 0.01)
    pop()
    expect(FakeAudioContext.started).toBe(clicks + sources('fanfare') + sources('pop'))
  })

  it('plays the horn of each vehicle kind, ignoring rapid repeats', () => {
    horn('police')
    expect(FakeAudioContext.started).toBe(sources('sirenPolice'))
    horn('police') // same instant: ignored
    expect(FakeAudioContext.started).toBe(sources('sirenPolice'))
    ctxTime(5)
    horn('truck')
    expect(FakeAudioContext.started).toBe(sources('sirenPolice') + sources('hornTruck'))
  })

  it('has well-formed sound definitions', () => {
    for (const sound of Object.values(SOUNDS)) {
      expect(sound.tones.length).toBeGreaterThan(0)
      expect(soundLength(sound)).toBeLessThan(2) // effects stay short
      if (sound.jitter !== undefined) expect(sound.jitter).toBeLessThan(0.2)
      for (const t of sound.tones) {
        expect(t.dur).toBeGreaterThan(0)
        expect(t.freq).toBeGreaterThan(0)
        if (t.freqEnd !== undefined) expect(t.freqEnd).toBeGreaterThan(0) // exponential ramps need > 0
        expect(t.at).toBeGreaterThanOrEqual(0)
        expect(t.gain).toBeGreaterThan(0)
        expect(t.gain).toBeLessThanOrEqual(1)
        expect(t.attack ?? 0).toBeLessThan(t.dur)
      }
    }
  })
})

describe('engine hum', () => {
  it('rises in pitch and level with speed, clamped to 0..1', () => {
    const idle = engineParams(0)
    const top = engineParams(1)
    expect(top.freq).toBeGreaterThan(idle.freq)
    expect(top.gain).toBeGreaterThan(idle.gain)
    expect(engineParams(-3)).toEqual(idle)
    expect(engineParams(7)).toEqual(top)
    expect(top.gain).toBeLessThanOrEqual(0.2) // subtle
    expect(idle.gain).toBeLessThanOrEqual(0.01) // nearly silent standing still
  })

  it('starts two oscillators and stops them once', () => {
    const hum = startEngine()
    expect(hum).not.toBeNull()
    expect(FakeAudioContext.started).toBe(2)
    expect(() => {
      hum!.setSpeed(0.5)
      hum!.stop()
      hum!.stop()
      hum!.setSpeed(1)
    }).not.toThrow()
  })
})

describe('installAudioUnlock', () => {
  it('creates and resumes the context on the first gesture, then stops listening', () => {
    const handlers = new Map<string, () => void>()
    const target = {
      addEventListener: vi.fn((name: string, fn: () => void) => handlers.set(name, fn)),
      removeEventListener: vi.fn((name: string) => handlers.delete(name)),
    }
    const stop = installAudioUnlock(target)
    expect(FakeAudioContext.created).toBe(0)
    handlers.get('pointerdown')?.()
    expect(FakeAudioContext.created).toBe(1)
    expect(handlers.size).toBe(0) // running now: all listeners removed
    stop()
  })

  it('returns a function that removes the listeners', () => {
    const handlers = new Map<string, () => void>()
    const target = {
      addEventListener: vi.fn((name: string, fn: () => void) => handlers.set(name, fn)),
      removeEventListener: vi.fn((name: string) => handlers.delete(name)),
    }
    const stop = installAudioUnlock(target)
    expect(handlers.size).toBeGreaterThan(0)
    stop()
    expect(handlers.size).toBe(0)
  })
})
