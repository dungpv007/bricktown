import { useApp } from '../state/useApp'
import { ensureAudioContext, resetAudioContextForTests } from './context'
import type { HornKind } from './horns'
import { duckMusic, resetMusicForTests } from './music'

export { installAudioUnlock, unlockAudio } from './context'

/**
 * Synthesized sound effects (WebAudio, no sample files, nothing to license). Every function is a
 * safe no-op while sound effects are off or when the browser has no AudioContext, so game code can
 * call them unconditionally.
 *
 * Levels: each voice's `gain` (0..1) goes through one master gain (MASTER_GAIN), so the loudest
 * sounds peak around 0.3 of full scale and a few overlapping ones stay clear of clipping.
 */

export type SoundName =
  | 'snap'
  | 'pop'
  | 'paint'
  | 'error'
  | 'success'
  | 'fanfare'
  | 'whoosh'
  | 'thunk'
  | 'coin'
  | 'horn'
  | 'hornTruck'
  | 'sirenPolice'
  | 'sirenFire'

/**
 * One voice: an oscillator note, or a burst of white noise through a band-pass filter. It starts
 * `at` seconds after the call and its pitch (or the noise band) glides from `freq` to `freqEnd`.
 */
export interface Tone {
  type: OscillatorType | 'noise'
  /** Oscillator pitch, or the centre of the noise band (Hz). */
  freq: number
  freqEnd?: number
  at: number
  dur: number
  /** Peak level, 0..1 (before the master gain). */
  gain: number
  /** Seconds to reach `gain`; default 5 ms (a crisp start). Horns and whooshes swell in slower. */
  attack?: number
  /** Hold `gain` and release over the last 50 ms (horns, sirens) instead of decaying all along. */
  sustain?: boolean
  /** Low-pass cutoff in Hz, to soften harsh waveforms. */
  lowpass?: number
  /** Band-pass width for noise (Q); default 1. Higher = more tonal. */
  q?: number
  /** Pitch wobble: `rate` Hz, `depth` Hz either side (the spring in "boing"). */
  vibrato?: { rate: number; depth: number }
}

export interface Sound {
  tones: readonly Tone[]
  /** Random pitch variation, e.g. 0.06 = up to ±6 %, so repeated clicks do not sound robotic. */
  jitter?: number
  /** Loud or long: the background music dips under it. */
  duck?: boolean
}

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

export const SOUNDS: Record<SoundName, Sound> = {
  // A plastic "click": a bright noise transient (the stud snapping in) over a short resonant
  // body tone and a low thock. Pitch varies a little per brick.
  snap: {
    jitter: 0.06,
    tones: [
      { type: 'noise', freq: 3200, freqEnd: 1800, q: 1.2, at: 0, dur: 0.025, gain: 0.9 },
      { type: 'triangle', freq: 1250, freqEnd: 880, at: 0, dur: 0.06, gain: 0.45 },
      { type: 'sine', freq: 300, freqEnd: 180, at: 0, dur: 0.05, gain: 0.35 },
    ],
  },
  // A softer, lower "pop": a brick pulled off.
  pop: {
    jitter: 0.08,
    tones: [
      { type: 'noise', freq: 1200, freqEnd: 600, q: 0.8, at: 0, dur: 0.03, gain: 0.35 },
      { type: 'sine', freq: 520, freqEnd: 160, at: 0, dur: 0.12, gain: 0.55 },
    ],
  },
  // Two rising bubbles: a splash of paint.
  paint: {
    tones: [
      { type: 'sine', freq: 420, freqEnd: 760, at: 0, dur: 0.09, gain: 0.55 },
      { type: 'sine', freq: 560, freqEnd: 980, at: 0.08, dur: 0.11, gain: 0.5 },
    ],
  },
  // A friendly cartoon "boing" (a sprung, falling wobble) for "not there", never a harsh buzz.
  error: {
    tones: [
      { type: 'sine', freq: 260, freqEnd: 120, at: 0, dur: 0.4, gain: 0.6, vibrato: { rate: 14, depth: 25 } },
      { type: 'triangle', freq: 130, freqEnd: 60, at: 0, dur: 0.3, gain: 0.25, vibrato: { rate: 14, depth: 12 } },
    ],
  },
  // A short "ta-da": a guided step done.
  success: {
    tones: [
      { type: 'triangle', freq: C5, at: 0, dur: 0.1, gain: 0.45 },
      { type: 'triangle', freq: E5, at: 0, dur: 0.1, gain: 0.4 },
      { type: 'triangle', freq: G5, at: 0.12, dur: 0.38, gain: 0.45 },
      { type: 'triangle', freq: C6, at: 0.12, dur: 0.38, gain: 0.4 },
    ],
  },
  // A brassy fanfare (arpeggio, then a held major chord with a sparkle): model built, maze won.
  fanfare: {
    duck: true,
    tones: [
      { type: 'sawtooth', freq: C5, at: 0, dur: 0.14, gain: 0.3, lowpass: 2400 },
      { type: 'sawtooth', freq: E5, at: 0.14, dur: 0.14, gain: 0.3, lowpass: 2400 },
      { type: 'sawtooth', freq: G5, at: 0.28, dur: 0.16, gain: 0.3, lowpass: 2400 },
      { type: 'sawtooth', freq: C6, at: 0.46, dur: 0.75, gain: 0.28, lowpass: 2400, attack: 0.02, sustain: true },
      { type: 'sawtooth', freq: G5, at: 0.46, dur: 0.75, gain: 0.22, lowpass: 2400, attack: 0.02, sustain: true },
      { type: 'sawtooth', freq: E5, at: 0.46, dur: 0.75, gain: 0.22, lowpass: 2400, attack: 0.02, sustain: true },
      { type: 'triangle', freq: 2093, at: 0.46, dur: 0.45, gain: 0.15 },
    ],
  },
  // Air rushing past: a brick or part picked up and dragged.
  whoosh: {
    jitter: 0.1,
    tones: [{ type: 'noise', freq: 400, freqEnd: 2000, q: 0.7, at: 0, dur: 0.22, gain: 0.35, attack: 0.08 }],
  },
  // A heavy, soft "thunk": a building set down in the city.
  thunk: {
    jitter: 0.05,
    tones: [
      { type: 'sine', freq: 150, freqEnd: 70, at: 0, dur: 0.16, gain: 0.8 },
      { type: 'noise', freq: 600, freqEnd: 300, q: 0.7, at: 0, dur: 0.05, gain: 0.3 },
      { type: 'triangle', freq: 300, freqEnd: 200, at: 0, dur: 0.06, gain: 0.2 },
    ],
  },
  // A bell-like "ding" with a shimmer on top: a coin picked up.
  coin: {
    tones: [
      { type: 'triangle', freq: 1318.51, at: 0, dur: 0.07, gain: 0.4 },
      { type: 'triangle', freq: 1975.53, at: 0.06, dur: 0.35, gain: 0.4 },
      { type: 'sine', freq: 3951.07, at: 0.06, dur: 0.2, gain: 0.1 },
    ],
  },
  // Car horn "beep-beep": a major third (F4 + A4), twice.
  horn: {
    duck: true,
    tones: [
      { type: 'sawtooth', freq: 349.23, at: 0, dur: 0.14, gain: 0.28, lowpass: 1600, attack: 0.01, sustain: true },
      { type: 'sawtooth', freq: 440, at: 0, dur: 0.14, gain: 0.28, lowpass: 1600, attack: 0.01, sustain: true },
      { type: 'sawtooth', freq: 349.23, at: 0.2, dur: 0.22, gain: 0.28, lowpass: 1600, attack: 0.01, sustain: true },
      { type: 'sawtooth', freq: 440, at: 0.2, dur: 0.22, gain: 0.28, lowpass: 1600, attack: 0.01, sustain: true },
    ],
  },
  // Truck / bus air horn: a deep three-note chord that starts a touch flat and swells in.
  hornTruck: {
    duck: true,
    tones: [
      { type: 'sawtooth', freq: 151, freqEnd: 155.56, at: 0, dur: 0.7, gain: 0.3, lowpass: 900, attack: 0.04, sustain: true },
      { type: 'sawtooth', freq: 180, freqEnd: 185, at: 0, dur: 0.7, gain: 0.26, lowpass: 900, attack: 0.04, sustain: true },
      { type: 'sawtooth', freq: 227, freqEnd: 233.08, at: 0, dur: 0.7, gain: 0.22, lowpass: 900, attack: 0.04, sustain: true },
    ],
  },
  // Police two-tone siren, a short burst: hi-lo-hi-lo.
  sirenPolice: {
    duck: true,
    tones: [960, 720, 960, 720].map((freq, i) => ({
      type: 'square' as const,
      freq,
      at: i * 0.28,
      dur: 0.3,
      gain: 0.2,
      lowpass: 2000,
      attack: 0.01,
      sustain: true,
    })),
  },
  // Fire engine wail, a short burst: a long rise then a fall (the two halves cross-fade).
  sirenFire: {
    duck: true,
    tones: [
      { type: 'sawtooth', freq: 500, freqEnd: 1300, at: 0, dur: 0.75, gain: 0.24, lowpass: 1800, attack: 0.05, sustain: true },
      { type: 'sawtooth', freq: 1300, freqEnd: 600, at: 0.7, dur: 0.6, gain: 0.24, lowpass: 1800, attack: 0.05, sustain: true },
    ],
  },
}

const MASTER_GAIN = 0.35
const ATTACK = 0.005
const RELEASE = 0.05
/** At most this many sounds at once; extra ones are dropped (a kid tapping fast stays cheap and clean). */
export const MAX_VOICES = 6
/** Horns are only honked so often (a held key or a drumming finger). */
const HORN_GAP = 0.25

/** How long a sound lasts (s), from its first voice's start to its last voice's end. */
export function soundLength(sound: Sound): number {
  return Math.max(...sound.tones.map((t) => t.at + t.dur))
}

let master: GainNode | null = null
let masterCtx: AudioContext | null = null
let noise: AudioBuffer | null = null
/** End times (context seconds) of the sounds playing now. */
let voiceEnds: number[] = []
let lastHornAt = -Infinity

/** The context and the sound-effects bus, created on first use; null without WebAudio. */
function output(): { c: AudioContext; out: GainNode } | null {
  const c = ensureAudioContext()
  if (!c) return null
  if (!master || masterCtx !== c) {
    master = c.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(c.destination)
    masterCtx = c
    noise = null
    voiceEnds = []
  }
  return { c, out: master }
}

/** One second of white noise, shared by every noise voice. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noise
}

function playTone(c: AudioContext, out: AudioNode, tone: Tone, pitch: number, startAt: number) {
  const t0 = startAt + tone.at
  const t1 = t0 + tone.dur
  const freq = tone.freq * pitch
  const freqEnd = tone.freqEnd === undefined ? undefined : tone.freqEnd * pitch

  const env = c.createGain()
  const attack = tone.attack ?? ATTACK
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.linearRampToValueAtTime(tone.gain, t0 + attack)
  if (tone.sustain) {
    env.gain.setValueAtTime(tone.gain, Math.max(t0 + attack, t1 - RELEASE))
    env.gain.linearRampToValueAtTime(0.0001, t1)
  } else {
    env.gain.exponentialRampToValueAtTime(0.0001, t1)
  }
  env.connect(out)

  let source: AudioScheduledSourceNode
  let pitched: AudioParam
  let node: AudioNode
  if (tone.type === 'noise') {
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c)
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = tone.q ?? 1
    src.connect(band)
    source = src
    pitched = band.frequency
    node = band
  } else {
    const osc = c.createOscillator()
    osc.type = tone.type
    source = osc
    pitched = osc.frequency
    node = osc
    if (tone.vibrato) {
      const lfo = c.createOscillator()
      const depth = c.createGain()
      lfo.frequency.value = tone.vibrato.rate
      depth.gain.value = tone.vibrato.depth * pitch
      lfo.connect(depth)
      depth.connect(osc.frequency)
      lfo.start(t0)
      lfo.stop(t1 + 0.02)
    }
  }
  pitched.setValueAtTime(freq, t0)
  if (freqEnd !== undefined) pitched.exponentialRampToValueAtTime(freqEnd, t1)

  if (tone.lowpass !== undefined) {
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = tone.lowpass
    node.connect(filter)
    node = filter
  }
  node.connect(env)
  // Noise starts at a random point of the shared buffer so no two bursts are identical.
  if (tone.type === 'noise') (source as AudioBufferSourceNode).start(t0, Math.random() * 0.5)
  else source.start(t0)
  source.stop(t1 + 0.02)
}

/** Plays `name`; returns false when it was skipped (sound off, no WebAudio, too many voices). */
function play(name: SoundName): boolean {
  if (!useApp.getState().sfxOn) return false
  try {
    const o = output()
    if (!o) return false
    const { c, out } = o
    if (c.state !== 'running') void c.resume().catch(() => undefined)
    const now = c.currentTime
    voiceEnds = voiceEnds.filter((end) => end > now)
    if (voiceEnds.length >= MAX_VOICES) return false
    const sound = SOUNDS[name]
    const jitter = sound.jitter ?? 0
    const pitch = 1 + (Math.random() * 2 - 1) * jitter
    for (const tone of sound.tones) playTone(c, out, tone, pitch, now)
    const length = soundLength(sound)
    voiceEnds.push(now + length)
    if (sound.duck) duckMusic(Math.max(0.6, length))
    return true
  } catch {
    /* audio must never break the game */
    return false
  }
}

const HORN_SOUNDS: Record<HornKind, SoundName> = {
  car: 'horn',
  truck: 'hornTruck',
  police: 'sirenPolice',
  fire: 'sirenFire',
}

export const snap = (): void => void play('snap')
export const pop = (): void => void play('pop')
export const paint = (): void => void play('paint')
export const error = (): void => void play('error')
/** Short "ta-da": a step done. */
export const success = (): void => void play('success')
/** Big finish: a model complete, a maze won. */
export const fanfare = (): void => void play('fanfare')
export const whoosh = (): void => void play('whoosh')
export const thunk = (): void => void play('thunk')
export const coin = (): void => void play('coin')

/** The horn (or siren burst) of `kind`; repeated presses closer than HORN_GAP are ignored. */
export function horn(kind: HornKind = 'car'): void {
  const c = useApp.getState().sfxOn ? ensureAudioContext() : null
  if (c && c.currentTime - lastHornAt < HORN_GAP) return
  if (play(HORN_SOUNDS[kind]) && c) lastHornAt = c.currentTime
}

/** A running engine sound; follow the car with `setSpeed`, end it with `stop`. */
export interface EngineHum {
  /** 0 = idle .. 1 = top speed. */
  setSpeed: (fraction: number) => void
  stop: () => void
}

/** Engine pitch (Hz) and level at `fraction` (0..1) of top speed: a low idle rising with speed. */
export function engineParams(fraction: number): { freq: number; gain: number; cutoff: number } {
  const s = Math.max(0, Math.min(1, fraction))
  return { freq: 55 + 75 * s, gain: 0.05 + 0.1 * s, cutoff: 250 + 600 * s }
}

/**
 * Starts a quiet engine hum (sawtooth + a sub-octave square through a low-pass that opens with
 * speed). Null when sound effects are off or there is no WebAudio. Not counted as a voice.
 */
export function startEngine(): EngineHum | null {
  if (!useApp.getState().sfxOn) return null
  try {
    const o = output()
    if (!o) return null
    const { c, out } = o
    const p = engineParams(0)
    const t = c.currentTime
    const level = c.createGain()
    level.gain.setValueAtTime(0.0001, t)
    level.gain.linearRampToValueAtTime(p.gain, t + 0.4)
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = p.cutoff
    filter.Q.value = 2
    const main = c.createOscillator()
    main.type = 'sawtooth'
    main.frequency.value = p.freq
    const sub = c.createOscillator()
    sub.type = 'square'
    sub.frequency.value = p.freq / 2
    const subLevel = c.createGain()
    subLevel.gain.value = 0.5
    main.connect(filter)
    sub.connect(subLevel)
    subLevel.connect(filter)
    filter.connect(level)
    level.connect(out)
    main.start(t)
    sub.start(t)
    let stopped = false
    return {
      setSpeed: (fraction) => {
        if (stopped) return
        try {
          const q = engineParams(fraction)
          const now = c.currentTime
          // Smooth glides (time constant 0.15 s): the car reports its speed a few times per second.
          main.frequency.setTargetAtTime(q.freq, now, 0.15)
          sub.frequency.setTargetAtTime(q.freq / 2, now, 0.15)
          filter.frequency.setTargetAtTime(q.cutoff, now, 0.15)
          level.gain.setTargetAtTime(q.gain, now, 0.15)
        } catch {
          /* ignore */
        }
      },
      stop: () => {
        if (stopped) return
        stopped = true
        try {
          const now = c.currentTime
          level.gain.cancelScheduledValues(now)
          level.gain.setValueAtTime(level.gain.value, now)
          level.gain.linearRampToValueAtTime(0.0001, now + 0.15)
          main.stop(now + 0.2)
          sub.stop(now + 0.2)
        } catch {
          /* ignore */
        }
      },
    }
  } catch {
    return null
  }
}

/** Test hook: forgets the shared context and buses so the next call builds fresh ones. */
export function resetAudioForTests(): void {
  resetAudioContextForTests()
  resetMusicForTests()
  master = null
  masterCtx = null
  noise = null
  voiceEnds = []
  lastHornAt = -Infinity
}
