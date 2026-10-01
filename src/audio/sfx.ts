import { useApp } from '../state/useApp'

/**
 * Synthesized sound effects (WebAudio, no files). Every function is a safe no-op when muted or
 * when the browser has no AudioContext, so game code can call them unconditionally.
 */

export type SoundName = 'snap' | 'pop' | 'paint' | 'error' | 'success' | 'horn' | 'coin'

/** One oscillator note: starts `at` seconds after the call and glides from `freq` to `freqEnd`. */
export interface Tone {
  type: OscillatorType
  freq: number
  freqEnd?: number
  at: number
  dur: number
  gain: number
  /** Low-pass cutoff in Hz, to soften harsh waveforms. */
  lowpass?: number
}

export const SOUNDS: Record<SoundName, readonly Tone[]> = {
  // A short plastic "click": brick pressed onto a stud.
  snap: [
    { type: 'triangle', freq: 1100, freqEnd: 520, at: 0, dur: 0.07, gain: 0.7 },
    { type: 'square', freq: 220, freqEnd: 160, at: 0, dur: 0.05, gain: 0.25, lowpass: 900 },
  ],
  // A soft downward blip: brick removed.
  pop: [{ type: 'sine', freq: 640, freqEnd: 140, at: 0, dur: 0.14, gain: 0.8 }],
  // Two rising bubbles: a splash of paint.
  paint: [
    { type: 'sine', freq: 420, freqEnd: 760, at: 0, dur: 0.09, gain: 0.55 },
    { type: 'sine', freq: 560, freqEnd: 980, at: 0.08, dur: 0.11, gain: 0.5 },
  ],
  // Two low, soft buzzes: "not there".
  error: [
    { type: 'sawtooth', freq: 190, freqEnd: 150, at: 0, dur: 0.14, gain: 0.35, lowpass: 700 },
    { type: 'sawtooth', freq: 170, freqEnd: 125, at: 0.17, dur: 0.2, gain: 0.35, lowpass: 700 },
  ],
  // A bright rising arpeggio: step or model complete.
  success: [
    { type: 'triangle', freq: 523.25, at: 0, dur: 0.14, gain: 0.6 },
    { type: 'triangle', freq: 659.25, at: 0.1, dur: 0.14, gain: 0.6 },
    { type: 'triangle', freq: 783.99, at: 0.2, dur: 0.14, gain: 0.6 },
    { type: 'triangle', freq: 1046.5, at: 0.3, dur: 0.34, gain: 0.65 },
  ],
  // A two-note car horn (a major third, held).
  horn: [
    { type: 'sawtooth', freq: 349.23, at: 0, dur: 0.38, gain: 0.3, lowpass: 1400 },
    { type: 'sawtooth', freq: 440, at: 0, dur: 0.38, gain: 0.3, lowpass: 1400 },
  ],
  // A bright two-note "ding-ding": a coin picked up.
  coin: [
    { type: 'square', freq: 987.77, at: 0, dur: 0.08, gain: 0.3, lowpass: 3500 },
    { type: 'square', freq: 1318.51, at: 0.07, dur: 0.26, gain: 0.3, lowpass: 3500 },
  ],
}

const MASTER_GAIN = 0.35
const ATTACK = 0.005

type AudioContextCtor = new () => AudioContext

let ctx: AudioContext | null = null
let master: GainNode | null = null

function contextCtor(): AudioContextCtor | undefined {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return g.AudioContext ?? g.webkitAudioContext
}

/** Creates the shared AudioContext on first use. Null when unsupported or construction fails. */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = contextCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(ctx.destination)
  } catch {
    ctx = null
    master = null
  }
  return ctx
}

/** (Re)starts the context. iOS only allows this inside a user gesture, so it is retried on each one. */
export function unlockAudio(): void {
  const c = ensureContext()
  if (c && c.state !== 'running') void c.resume().catch(() => undefined)
}

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const

/**
 * Creates and resumes the AudioContext on the first user gestures (required by iOS Safari), then
 * stops listening once the context is running. Returns a function that removes the listeners.
 */
export function installAudioUnlock(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const onGesture = () => {
    unlockAudio()
    if (ctx?.state === 'running') stop()
  }
  const stop = () => {
    for (const name of GESTURES) target.removeEventListener(name, onGesture, true)
  }
  for (const name of GESTURES) target.addEventListener(name, onGesture, true)
  return stop
}

function playTone(c: AudioContext, out: AudioNode, tone: Tone) {
  const t0 = c.currentTime + tone.at
  const t1 = t0 + tone.dur
  const osc = c.createOscillator()
  osc.type = tone.type
  osc.frequency.setValueAtTime(tone.freq, t0)
  if (tone.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(tone.freqEnd, t1)

  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.linearRampToValueAtTime(tone.gain, t0 + ATTACK)
  env.gain.exponentialRampToValueAtTime(0.0001, t1)

  let node: AudioNode = osc
  if (tone.lowpass !== undefined) {
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = tone.lowpass
    osc.connect(filter)
    node = filter
  }
  node.connect(env)
  env.connect(out)
  osc.start(t0)
  osc.stop(t1 + 0.02)
}

function play(name: SoundName): void {
  if (useApp.getState().muted) return
  try {
    const c = ensureContext()
    if (!c || !master) return
    if (c.state !== 'running') void c.resume().catch(() => undefined)
    for (const tone of SOUNDS[name]) playTone(c, master, tone)
  } catch {
    /* audio must never break the game */
  }
}

export const snap = () => play('snap')
export const pop = () => play('pop')
export const paint = () => play('paint')
export const error = () => play('error')
export const success = () => play('success')
export const horn = () => play('horn')
export const coin = () => play('coin')

/** Test hook: forgets the shared context so the next call builds a fresh one. */
export function resetAudioForTests(): void {
  ctx = null
  master = null
}
