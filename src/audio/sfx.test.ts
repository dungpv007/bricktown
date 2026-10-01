import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../state/useApp'
import { error, horn, installAudioUnlock, paint, pop, resetAudioForTests, snap, SOUNDS, success } from './sfx'

/** Minimal AudioContext double that records how many oscillators were started. */
class FakeParam {
  value = 0
  setValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
}
class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()
  type = ''
  connect = vi.fn()
  start = vi.fn(() => {
    FakeAudioContext.started++
  })
  stop = vi.fn()
}
class FakeAudioContext {
  static created = 0
  static started = 0
  state = 'suspended'
  currentTime = 0
  destination = new FakeNode()
  resume = vi.fn(() => {
    this.state = 'running'
    return Promise.resolve()
  })
  constructor() {
    FakeAudioContext.created++
  }
  createGain = () => new FakeNode()
  createOscillator = () => new FakeNode()
  createBiquadFilter = () => new FakeNode()
}

const g = globalThis as unknown as { AudioContext?: unknown }

beforeEach(() => {
  FakeAudioContext.created = 0
  FakeAudioContext.started = 0
  g.AudioContext = FakeAudioContext
  resetAudioForTests()
  useApp.setState({ muted: false })
})
afterEach(() => {
  delete g.AudioContext
  resetAudioForTests()
  useApp.setState({ muted: false })
})

describe('sfx', () => {
  it('plays every tone of a sound when not muted', () => {
    snap()
    expect(FakeAudioContext.started).toBe(SOUNDS.snap.length)
    success()
    expect(FakeAudioContext.started).toBe(SOUNDS.snap.length + SOUNDS.success.length)
  })

  it('does nothing, and never creates the context, while muted', () => {
    useApp.getState().setMuted(true)
    for (const fn of [snap, pop, paint, error, success, horn]) fn()
    expect(FakeAudioContext.started).toBe(0)
    expect(FakeAudioContext.created).toBe(0)
  })

  it('plays again after unmuting', () => {
    useApp.getState().setMuted(true)
    pop()
    useApp.getState().setMuted(false)
    pop()
    expect(FakeAudioContext.started).toBe(SOUNDS.pop.length)
  })

  it('shares one context and is a safe no-op without WebAudio', () => {
    snap()
    pop()
    expect(FakeAudioContext.created).toBe(1)
    delete g.AudioContext
    resetAudioForTests()
    expect(() => horn()).not.toThrow()
  })

  it('has well-formed tone definitions', () => {
    for (const tones of Object.values(SOUNDS)) {
      expect(tones.length).toBeGreaterThan(0)
      for (const t of tones) {
        expect(t.dur).toBeGreaterThan(0)
        expect(t.freq).toBeGreaterThan(0)
        expect(t.at).toBeGreaterThanOrEqual(0)
        expect(t.gain).toBeGreaterThan(0)
        expect(t.gain).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('installAudioUnlock', () => {
  it('creates and resumes the context on the first gesture, then stops listening', () => {
    const handlers = new Map<string, () => void>()
    const target = {
      addEventListener: vi.fn((name: string, fn: () => void) => handlers.set(name, fn)),
      removeEventListener: vi.fn((name: string) => handlers.delete(name)),
    }
    installAudioUnlock(target)
    expect(FakeAudioContext.created).toBe(0)
    handlers.get('pointerdown')?.()
    expect(FakeAudioContext.created).toBe(1)
    expect(handlers.size).toBe(0) // running now: all listeners removed
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
