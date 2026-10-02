import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { useFrameRequest } from '../kit'

/**
 * Small animation helpers for the sushi bar. Frames are asked for only while something moves (the
 * kit's frame driver); nothing here allocates per frame.
 */

/**
 * Runs `update(t)` with t going 0 → 1 over `seconds` while `active`, then `done()` once. Restarts
 * whenever `active` turns on again.
 */
export function useTween(active: boolean, seconds: number, update: (t: number) => void, done?: () => void): void {
  const elapsed = useRef(0)
  const finished = useRef(false)
  const updateRef = useRef(update)
  const doneRef = useRef(done)
  useEffect(() => {
    updateRef.current = update
    doneRef.current = done
  })
  useEffect(() => {
    if (active) {
      elapsed.current = 0
      finished.current = false
    }
  }, [active])
  useFrameRequest(active)
  useFrame((_, delta) => {
    if (!active || finished.current) return
    elapsed.current += Math.min(delta, 0.1)
    const t = Math.min(1, elapsed.current / seconds)
    updateRef.current(t)
    if (t >= 1) {
      finished.current = true
      doneRef.current?.()
    }
  })
}

/** A springy 0 → overshoot → 1 curve, for things popping in. */
export const popCurve = (t: number): number => {
  if (t >= 1) return 1
  return 1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 5.5)
}

/** Its children pop in (a squishy scale-up) when it mounts. Re-key it to pop again. */
export function PopIn({ children, seconds = 0.45, position }: { children: ReactNode; seconds?: number; position?: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  const [active, setActive] = useState(true)
  useTween(
    active,
    seconds,
    (t) => {
      const g = ref.current
      if (!g) return
      const s = popCurve(t)
      // Squash and stretch: wide when low, tall when high.
      g.scale.set(Math.max(0.001, s * (1 + (1 - s) * 0.4)), Math.max(0.001, s), Math.max(0.001, s * (1 + (1 - s) * 0.4)))
    },
    () => setActive(false),
  )
  return (
    <group ref={ref} position={position} scale={active ? 0.001 : 1}>
      {children}
    </group>
  )
}

/** Eases a group's y toward `y` (sitting down on a stool, standing up again). */
export function EaseY({ y, speed = 6, children }: { y: number; speed?: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const [moving, setMoving] = useState(false)
  const [target, setTarget] = useState(y)
  if (target !== y) {
    setTarget(y)
    setMoving(true)
  }
  useFrameRequest(moving)
  useFrame((_, delta) => {
    const g = ref.current
    if (!g || !moving) return
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * speed)
    g.position.y += (target - g.position.y) * k
    if (Math.abs(target - g.position.y) < 0.01) {
      g.position.y = target
      setMoving(false)
    }
  })
  return <group ref={ref}>{children}</group>
}
