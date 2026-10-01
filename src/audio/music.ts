import { useApp } from '../state/useApp'
import { currentAudioContext, onAudioStateChange } from './context'

/**
 * Background music: `public/audio/music.m4a` (AAC, ~175 s) looped while the 🎵 toggle is on.
 *
 * - Starts only once the shared AudioContext runs, i.e. after the first gesture unlocked it
 *   (iOS / Android autoplay rules), with a gentle fade-in.
 * - The file is fetched when the browser is idle after the menu appeared, and decoded once the
 *   context exists. A decoded AudioBuffer loops sample-exact (an <audio loop> leaves a gap at the
 *   seam). Decoded PCM is ~62 MB, so devices reporting ≤ 2 GB memory, and browsers that fail to
 *   decode, stream it through an <audio loop> element instead.
 * - Pauses while the page is hidden and picks up where it left off.
 * - Dips under loud sound effects (`duckMusic`).
 * Nothing here throws: without audio the game just stays quiet.
 */

export const MUSIC_URL = `${import.meta.env.BASE_URL}audio/music.m4a`
/** Music level (0..1) under the sound effects. */
export const MUSIC_VOLUME = 0.35
const FADE_IN = 1.5
const FADE_OUT = 0.3
/** While ducked the music plays at this fraction of its level. */
export const DUCK_LEVEL = 0.4
const DUCK_DOWN = 0.06
const DUCK_UP = 0.4

type Track = AudioBuffer | HTMLAudioElement

let duck: GainNode | null = null
let duckCtx: AudioContext | null = null
let bytes: Promise<ArrayBuffer | null> | null = null
let loading: Promise<Track | null> | null = null

/** What is playing now: a looping buffer source (with its offset bookkeeping) or the fallback element. */
let playing: { source: AudioBufferSourceNode; fade: GainNode; startedAt: number; duration: number } | null = null
let elementPlaying = false
let element: HTMLAudioElement | null = null
let elementFade: GainNode | null = null
/** Where in the track (s) to pick up after a pause. */
let offset = 0

const wanted = () =>
  useApp.getState().musicOn && (typeof document === 'undefined' || document.visibilityState !== 'hidden')

function lowMemory(): boolean {
  const memory = (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory
  return typeof memory === 'number' && memory <= 2
}

/** The ducking stage every music source plays through, once per context. */
function duckBus(c: AudioContext): GainNode {
  if (!duck || duckCtx !== c) {
    duck = c.createGain()
    duck.gain.value = 1
    duck.connect(c.destination)
    duckCtx = c
  }
  return duck
}

function fetchBytes(): Promise<ArrayBuffer | null> {
  bytes ??= fetch(MUSIC_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null)
    .then((data) => {
      if (!data) bytes = null // offline before the file was cached: try again later
      return data
    })
  return bytes
}

function makeElement(): HTMLAudioElement | null {
  try {
    if (typeof Audio === 'undefined') return null
    const el = new Audio(MUSIC_URL)
    el.loop = true
    el.preload = 'auto'
    return el
  } catch {
    return null
  }
}

function decode(c: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Callback form too: older Safari has no promise-returning decodeAudioData.
  return new Promise((resolve, reject) => {
    const p = c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined
    p?.catch(reject)
  })
}

function load(c: AudioContext): Promise<Track | null> {
  loading ??= (async (): Promise<Track | null> => {
    if (lowMemory()) return makeElement()
    const data = await fetchBytes()
    if (!data) return null
    try {
      return await decode(c, data)
    } catch {
      return makeElement()
    }
  })().then((track) => {
    if (!track) loading = null
    return track
  })
  return loading
}

function fadeIn(c: AudioContext, gain: GainNode) {
  const t = c.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, t + FADE_IN)
}

function start(c: AudioContext, track: Track) {
  if ('getChannelData' in track) {
    const fade = c.createGain()
    fade.connect(duckBus(c))
    const source = c.createBufferSource()
    source.buffer = track
    source.loop = true
    source.connect(fade)
    const at = offset % track.duration
    source.start(0, at)
    fadeIn(c, fade)
    playing = { source, fade, startedAt: c.currentTime - at, duration: track.duration }
    return
  }
  element = track
  if (!elementFade) {
    elementFade = c.createGain()
    c.createMediaElementSource(track).connect(elementFade)
    elementFade.connect(duckBus(c))
  }
  fadeIn(c, elementFade)
  elementPlaying = true
  void track.play().catch(() => {
    elementPlaying = false
  })
}

function pause() {
  const c = currentAudioContext()
  if (playing && c) {
    const { source, fade, startedAt, duration } = playing
    playing = null
    offset = (c.currentTime - startedAt) % duration
    try {
      const t = c.currentTime
      fade.gain.cancelScheduledValues(t)
      fade.gain.setValueAtTime(fade.gain.value, t)
      fade.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT)
      source.stop(t + FADE_OUT + 0.05)
    } catch {
      /* ignore */
    }
  }
  if (elementPlaying && element) {
    elementPlaying = false
    element.pause()
  }
}

let syncing = false
let again = false

/** Brings playback in line with the toggle, page visibility and the context's state. */
async function sync(): Promise<void> {
  if (syncing) {
    again = true
    return
  }
  syncing = true
  try {
    do {
      again = false
      if (!wanted()) {
        pause()
        continue
      }
      const c = currentAudioContext()
      // Not unlocked yet (or suspended by the system): wait for the next state change.
      if (!c || c.state !== 'running' || playing || elementPlaying) continue
      const track = await load(c)
      if (track && wanted() && c.state === 'running' && !playing && !elementPlaying) start(c, track)
    } while (again)
  } catch {
    /* audio must never break the game */
  } finally {
    syncing = false
  }
}

const resync = () => void sync()

/**
 * Dips the music to DUCK_LEVEL for `hold` seconds (a horn, a siren, a fanfare), then brings it back.
 * A no-op while no music plays.
 */
export function duckMusic(hold = 0.6): void {
  try {
    const c = currentAudioContext()
    if (!duck || !c || duckCtx !== c) return
    const g = duck.gain
    const t = c.currentTime
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(DUCK_LEVEL, t + DUCK_DOWN)
    g.setValueAtTime(DUCK_LEVEL, t + hold)
    g.linearRampToValueAtTime(1, t + hold + DUCK_UP)
  } catch {
    /* ignore */
  }
}

/** Runs `fn` once the browser is idle (after first paint), or after a short delay where unsupported. */
function whenIdle(fn: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 4000 })
  else window.setTimeout(fn, 1500)
}

let installed = false

/**
 * Starts managing the music: call once at startup. It fetches the file when the browser is idle,
 * starts after the first gesture and follows the 🎵 toggle and page visibility from then on.
 */
export function installMusic(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return
  installed = true
  onAudioStateChange(resync)
  document.addEventListener('visibilitychange', resync)
  useApp.subscribe((s, prev) => {
    if (s.musicOn === prev.musicOn) return
    if (s.musicOn && !lowMemory()) void fetchBytes()
    resync()
  })
  whenIdle(() => {
    if (useApp.getState().musicOn && !lowMemory()) void fetchBytes()
    resync()
  })
}

/** Test hook: forgets every node and the loaded track. */
export function resetMusicForTests(): void {
  duck = null
  duckCtx = null
  bytes = null
  loading = null
  playing = null
  elementPlaying = false
  element = null
  elementFade = null
  offset = 0
}
