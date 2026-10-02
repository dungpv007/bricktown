import { ensureAudioContext } from '../../audio/context'
import { useApp } from '../../state/useApp'

/**
 * The scanner's "beep!": a short bright square-wave note (WebAudio, synthesized). Like the shared
 * sound effects it is a no-op while sound effects are off or without WebAudio, and never throws.
 */
export function beep(): void {
  const { sfxOn, sfxVolume } = useApp.getState()
  if (!sfxOn) return
  try {
    const c = ensureAudioContext()
    if (!c) return
    if (c.state !== 'running') void c.resume().catch(() => undefined)
    const t0 = c.currentTime
    const level = 0.12 * Math.min(1, Math.max(0, sfxVolume))
    const env = c.createGain()
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.linearRampToValueAtTime(level, t0 + 0.005)
    env.gain.setValueAtTime(level, t0 + 0.11)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 4000
    const osc = c.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(1760, t0)
    osc.connect(filter)
    filter.connect(env)
    env.connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + 0.18)
  } catch {
    /* audio must never break the game */
  }
}
