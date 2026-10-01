/**
 * The one shared AudioContext (sound effects and music), created lazily and unlocked by the first
 * user gesture: iOS Safari and Android Chrome keep audio silent until the page is touched.
 */

type AudioContextCtor = new () => AudioContext

let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

function contextCtor(): AudioContextCtor | undefined {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return g.AudioContext ?? g.webkitAudioContext
}

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch {
      /* a listener must never break audio */
    }
  }
}

/** The shared context if it exists already (never creates one: music waits for a gesture). */
export function currentAudioContext(): AudioContext | null {
  return ctx
}

/** Creates the shared AudioContext on first use. Null when unsupported or construction fails. */
export function ensureAudioContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = contextCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    ctx.addEventListener?.('statechange', notify)
  } catch {
    ctx = null
  }
  if (ctx) notify()
  return ctx
}

/** Calls `fn` whenever the context is created or changes state (suspended / running). Returns an unsubscribe. */
export function onAudioStateChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** (Re)starts the context. iOS only allows this inside a user gesture, so it is retried on each one. */
export function unlockAudio(): void {
  const c = ensureAudioContext()
  // Older WebKit has no `statechange`: tell listeners once the resume went through.
  if (c && c.state !== 'running') void c.resume().then(notify, () => undefined)
}

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const

/**
 * Creates and resumes the AudioContext on the first user gestures (required by iOS Safari), then
 * stops listening once the context is running. If the system suspends it later (a phone call, the
 * app backgrounded) the listeners come back until the next gesture wakes it. Returns a function
 * that removes the listeners.
 */
export function installAudioUnlock(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window): () => void {
  let listening = false
  const onGesture = () => {
    unlockAudio()
    if (ctx?.state === 'running') detach()
  }
  const attach = () => {
    if (listening) return
    listening = true
    for (const name of GESTURES) target.addEventListener(name, onGesture, true)
  }
  const detach = () => {
    if (!listening) return
    listening = false
    for (const name of GESTURES) target.removeEventListener(name, onGesture, true)
  }
  const unsubscribe = onAudioStateChange(() => {
    if (ctx && ctx.state !== 'running') attach()
  })
  attach()
  return () => {
    unsubscribe()
    detach()
  }
}

/** Test hook: forgets the shared context so the next call builds a fresh one. */
export function resetAudioContextForTests(): void {
  ctx = null
}
