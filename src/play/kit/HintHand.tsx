import { useEffect, useState, type CSSProperties } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

type Vec3 = [number, number, number]

/** Idle time before the hand shows (the plan: 5 s). */
export const HINT_IDLE_MS = 5000

/**
 * True once nobody has touched the screen for `idleMs` while `active`; any pointer down hides it and
 * starts the wait again. Changing `resetKey` (e.g. the step of the recipe) also starts it again.
 */
export function useIdle(active: boolean, idleMs = HINT_IDLE_MS, resetKey?: unknown): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!active) return
    let timer = window.setTimeout(() => setIdle(true), idleMs)
    const reset = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), idleMs)
    }
    window.addEventListener('pointerdown', reset, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', reset, true)
      setIdle(false)
    }
  }, [active, idleMs, resetKey])
  return active && idle
}

export interface HintHandProps {
  /** Where the hand points (or a drag starts). */
  at: Vec3
  /** For a drag hint: where the hand moves to (it slides from `at` to `to`, over and over). */
  to?: Vec3
  /** Hint wanted now (e.g. the step it explains is waiting); it still waits for the idle time. */
  active?: boolean
  idleMs?: number
  /** Restarts the idle wait when it changes (the current step). */
  resetKey?: unknown
}

/**
 * A pointing hand 👆 over the scene after 5 s without a touch: it taps on `at`, or slides from `at`
 * to `to` for a drag. A CSS animation (no frames needed once shown).
 */
export default function HintHand({ at, to, active = true, idleMs = HINT_IDLE_MS, resetKey }: HintHandProps) {
  const show = useIdle(active, idleMs, resetKey)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (show) invalidate() // the hand's position is worked out on the next frame
  }, [show, invalidate])
  if (!show) return null
  // The drag's screen offset (px), for the CSS slide.
  let dx = 0
  let dy = 0
  if (to) {
    const a = new THREE.Vector3(...at).project(camera)
    const b = new THREE.Vector3(...to).project(camera)
    dx = ((b.x - a.x) / 2) * size.width
    dy = (-(b.y - a.y) / 2) * size.height
  }
  return (
    <Html position={at} zIndexRange={[1, 1]} pointerEvents="none">
      <span
        className={`bt-hint-hand${to ? ' bt-hint-hand-drag' : ''}`}
        data-testid="hint-hand"
        aria-hidden="true"
        style={{ '--bt-hint-dx': `${dx}px`, '--bt-hint-dy': `${dy}px` } as CSSProperties}
      >
        👆
      </span>
    </Html>
  )
}
