import { useApp } from '../state/useApp'
import { currentAudioContext, onAudioStateChange } from './context'

/**
 * Background music: `public/audio/music.m4a` (mono AAC 40 kbps, ~900 KB, ~175 s) looped while the
 * 🎵 toggle is on. Optional and kept cheap:
 *
 * - Nothing is created or fetched until a user gesture happens while music is on (`primeMusic`).
 *   The <audio> element is created and `load()`ed inside that gesture: iOS then lets the same
 *   element `play()` later, after the fetch finished. A play the browser still refuses
 *   (NotAllowedError) is simply retried at the next gesture.
 * - The file is fetched once, whole (no Range request), and played from a Blob URL: the service
 *   worker caches that response at runtime (CacheFirst, 'bt-audio') so music plays offline later,
 *   and Safari never has to range-read a cached response. Only the compressed file is in memory.
 *   A tiny gap at the loop seam is accepted.
 * - The element goes through the AudioContext (MediaElementAudioSourceNode -> fade -> duck) for the
 *   1.5 s fade-in, the fade-out and ducking: `element.volume` is read-only on iOS.
 * - Fades out and pauses while the page is hidden or music is off; the element keeps its position.
 * Nothing here throws: without audio the game just stays quiet.
 */

export const MUSIC_URL = `${import.meta.env.BASE_URL}audio/music.m4a`
/** Loudest music level (0..1, under the sound effects): the volume slider's top. The default 0.5 gives 0.35. */
export const MUSIC_MAX = 0.7
/** The gain the music plays at for a volume setting `volume` (0..1). */
export const musicLevel = (volume: number): number => MUSIC_MAX * Math.min(1, Math.max(0, volume))
const currentLevel = (): number => musicLevel(useApp.getState().musicVolume)
/** Time constant (s) of the glide to a new volume: quick, but no zipper noise. */
const VOLUME_GLIDE = 0.05
const FADE_IN = 1.5
const FADE_OUT = 0.3
/** While ducked the music plays at this fraction of its level. */
export const DUCK_LEVEL = 0.4
const DUCK_DOWN = 0.06
const DUCK_UP = 0.4

let element: HTMLAudioElement | null = null
let blobUrl: Promise<string | null> | null = null
/** When the last download failed (ms); retries wait RETRY_AFTER_MS or an `online` event. */
let failedAt = 0
const RETRY_AFTER_MS = 30_000
let srcSet = false
/** element -> fade -> duck -> destination, built the first time the music plays. */
let fade: GainNode | null = null
let duck: GainNode | null = null
let chainCtx: AudioContext | null = null
let routed = false
let playing = false
/** Bumped on every play / pause so a pending fade-out pause cannot stop a newer play. */
let playToken = 0

const wanted = () =>
  useApp.getState().musicOn && (typeof document === 'undefined' || document.visibilityState !== 'hidden')

/** Fetches the whole file once and returns a Blob URL for it (null when offline and not cached yet). */
function fetchTrack(): Promise<string | null> {
  if (!blobUrl) {
    // Offline and not cached yet: do not send one failing request per tap.
    if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return Promise.resolve(null)
    let request: Promise<string | null>
    try {
      request = fetch(MUSIC_URL)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => (blob ? URL.createObjectURL(blob) : null))
        .catch(() => null)
    } catch {
      request = Promise.resolve(null) // no fetch / no Blob URLs
    }
    blobUrl = request.then((url) => {
      if (!url) {
        blobUrl = null // try again later (not before RETRY_AFTER_MS, or when the network is back)
        failedAt = Date.now()
      } else {
        failedAt = 0
      }
      return url
    })
  }
  return blobUrl
}

/** Routes the element through the fade and duck gains (once). False without WebAudio routing. */
function route(c: AudioContext, el: HTMLAudioElement): boolean {
  if (routed) return chainCtx === c
  routed = true // a MediaElementSource can only ever be made once per element
  try {
    duck = c.createGain()
    duck.connect(c.destination)
    fade = c.createGain()
    fade.gain.value = 0.0001
    fade.connect(duck)
    c.createMediaElementSource(el).connect(fade)
    chainCtx = c
    return true
  } catch {
    fade = duck = null
    return false
  }
}

/** Starts the element if everything is ready; safe to call often (and synchronously inside a gesture). */
function tryPlay(): void {
  const el = element
  const c = currentAudioContext()
  if (!el || !srcSet || playing || !c || !wanted()) return
  const token = ++playToken
  if (route(c, el) && fade) {
    const t = c.currentTime
    fade.gain.cancelScheduledValues(t)
    fade.gain.setValueAtTime(Math.max(0.0001, fade.gain.value), t)
    fade.gain.linearRampToValueAtTime(currentLevel(), t + FADE_IN)
  } else {
    el.volume = currentLevel() // plain (iOS ignores it) element: no fades or ducking
  }
  playing = true
  try {
    void el.play().catch(() => {
      // Refused (e.g. NotAllowedError outside a gesture on iOS): the next gesture tries again.
      if (token === playToken) playing = false
    })
  } catch {
    playing = false
  }
}

function pause(): void {
  const el = element
  if (!playing || !el) return
  playing = false
  const token = ++playToken
  const c = currentAudioContext()
  if (fade && c && chainCtx === c && c.state === 'running') {
    const t = c.currentTime
    fade.gain.cancelScheduledValues(t)
    fade.gain.setValueAtTime(fade.gain.value, t)
    fade.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT)
    window.setTimeout(() => {
      if (token === playToken) el.pause()
    }, FADE_OUT * 1000)
  } else {
    el.pause()
  }
}

/**
 * Glides the running music to the current volume setting, without restarting it. A no-op while
 * nothing plays (a pending fade-out or pause must not be undone: the next play starts at the new level).
 */
function applyVolume(): void {
  try {
    const el = element
    if (!playing || !el) return
    const c = currentAudioContext()
    if (fade && c && chainCtx === c) {
      const t = c.currentTime
      const g = fade.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
      g.setTargetAtTime(currentLevel(), t, VOLUME_GLIDE)
    } else if (!routed) {
      el.volume = currentLevel() // plain element; read-only on iOS, where routing is used anyway
    }
  } catch {
    /* ignore */
  }
}

/** Once the track is fetched, hands it to the element and plays (if still wanted). */
function loadAndPlay(): void {
  void fetchTrack().then((url) => {
    if (!url || !element) return
    if (!srcSet) {
      element.src = url
      srcSet = true
    }
    tryPlay()
  })
}

/**
 * Call from inside a user gesture (any tap, and the 🎵 toggle switching music on): creates the
 * element there, starts the fetch once, and (re)tries playing synchronously.
 */
export function primeMusic(): void {
  try {
    if (!useApp.getState().musicOn) return
    if (!element) {
      if (typeof Audio === 'undefined') return
      element = new Audio()
      element.loop = true
      element.preload = 'auto'
      element.load() // inside the gesture: iOS allows this element to play later
    }
    if (srcSet) tryPlay()
    else loadAndPlay()
  } catch {
    /* audio must never break the game */
  }
}

/** Follows the toggle, page visibility and the context's state (no gesture here: never creates the element). */
function sync(): void {
  try {
    if (!wanted()) pause()
    else tryPlay()
  } catch {
    /* ignore */
  }
}

/**
 * Dips the music to DUCK_LEVEL for `hold` seconds (a horn, a siren, a fanfare), then brings it back.
 * A no-op while no music plays.
 */
export function duckMusic(hold = 0.6): void {
  try {
    const c = currentAudioContext()
    if (!playing || !duck || !c || chainCtx !== c) return
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

const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const
let installed = false

/**
 * Starts managing the music: call once at startup. Every gesture primes it (cheap no-op while music
 * is off or already playing); from then on it follows the 🎵 toggle and page visibility.
 */
export function installMusic(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return
  installed = true
  const onGesture = () => {
    if (!playing) primeMusic()
  }
  for (const name of GESTURES) window.addEventListener(name, onGesture, true)
  onAudioStateChange(sync)
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('online', () => {
    failedAt = 0 // the network is back: the next tap may try the download again
  })
  useApp.subscribe((s, prev) => {
    if (s.musicOn !== prev.musicOn) sync()
    if (s.musicVolume !== prev.musicVolume) applyVolume()
  })
}

/** Test hook: forgets the element and nodes. */
export function resetMusicForTests(): void {
  element = null
  blobUrl = null
  failedAt = 0
  srcSet = false
  fade = null
  duck = null
  chainCtx = null
  routed = false
  playing = false
  playToken = 0
}
