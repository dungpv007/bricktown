import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { prefersReducedMotion } from '../../state/useApp'
import { useFrameRequest } from '../kit'

/**
 * Small one-shot animations for the bakery. Each asks for frames only while it runs (the stage
 * renders on demand otherwise) and allocates nothing per frame.
 */

type Vec3 = [number, number, number]

const easeOutBack = (k: number): number => {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2)
}

/** Its children pop in (a springy grow, or a drop from above with `drop`), once, when mounted. */
export function PopIn({
  children,
  delay = 0,
  duration = 0.35,
  drop = 0,
  position,
}: {
  children: ReactNode
  delay?: number
  duration?: number
  drop?: number
  position?: Vec3
}) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(-delay)
  const [on, setOn] = useState(() => !prefersReducedMotion())
  useFrameRequest(on)
  useLayoutEffect(() => {
    if (on) ref.current?.scale.setScalar(0.001)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])
  useFrame((_, delta) => {
    const g = ref.current
    if (!g || !on) return
    t.current += Math.min(delta, 0.1)
    const k = Math.min(1, Math.max(0, t.current / duration))
    const s = t.current < 0 ? 0.001 : Math.max(0.001, easeOutBack(k))
    g.scale.setScalar(s)
    g.position.y = drop * (1 - k)
    if (k >= 1) {
      g.scale.setScalar(1)
      g.position.y = 0
      setOn(false)
    }
  })
  return (
    <group position={position}>
      <group ref={ref}>{children}</group>
    </group>
  )
}

/** Carries its children from `from` to `to` along a hop (arc of `height`), then calls `onDone`. */
export function Travel({
  from,
  to,
  height = 4,
  duration = 0.8,
  onDone,
  children,
}: {
  from: Vec3
  to: Vec3
  height?: number
  duration?: number
  onDone: () => void
  children: ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(0)
  const [on, setOn] = useState(() => !prefersReducedMotion())
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useFrameRequest(on)
  useEffect(() => {
    if (!on) done.current() // no motion wanted: there at once
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])
  useFrame((_, delta) => {
    const g = ref.current
    if (!g || !on) return
    t.current += Math.min(delta, 0.1) / duration
    const k = Math.min(1, t.current)
    const e = k * k * (3 - 2 * k)
    g.position.set(
      from[0] + (to[0] - from[0]) * e,
      from[1] + (to[1] - from[1]) * e + Math.sin(Math.PI * k) * height,
      from[2] + (to[2] - from[2]) * e,
    )
    g.rotation.y = Math.sin(Math.PI * k) * 0.6
    if (k >= 1) {
      setOn(false)
      done.current()
    }
  })
  return (
    <group ref={ref} position={from}>
      {children}
    </group>
  )
}

/** The bowl tipping over a tin and back (pouring the batter), then `onDone`. */
export function Tilt({
  position,
  duration = 1,
  onDone,
  children,
}: {
  position: Vec3
  duration?: number
  onDone: () => void
  children: ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(0)
  const [on, setOn] = useState(true)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useFrameRequest(on)
  useFrame((_, delta) => {
    const g = ref.current
    if (!g || !on) return
    t.current += Math.min(delta, 0.1) / duration
    const k = Math.min(1, t.current)
    // Up and over (0..0.35), pour (..0.75), back down.
    const tip = k < 0.35 ? k / 0.35 : k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
    g.rotation.x = tip * 1.15
    g.position.y = tip * 2.4
    g.position.z = -tip * 1.2
    if (k >= 1) {
      setOn(false)
      done.current()
    }
  })
  return (
    <group position={position}>
      <group ref={ref}>{children}</group>
    </group>
  )
}

/**
 * Spins while `spin` (a counter) changes: each bump gives a short whirl, for the mixing bowl. The
 * `contents` group turns with it, the `whisk` circles the bowl.
 */
export function useWhirl(spin: number, radius: number) {
  const contents = useRef<THREE.Group>(null)
  const whisk = useRef<THREE.Group>(null)
  const left = useRef(0)
  const angle = useRef(0)
  const last = useRef(spin)
  // Whirling until the bump `spin` has been played out.
  const [settled, setSettled] = useState(spin)
  const on = settled !== spin
  useFrameRequest(on)
  useFrame((_, delta) => {
    if (!on) return
    if (last.current !== spin) {
      last.current = spin
      left.current = 0.8
    }
    const dt = Math.min(delta, 0.1)
    left.current = Math.max(0, left.current - dt)
    const speed = 9 * Math.min(1, left.current / 0.3 + 0.2)
    angle.current += dt * speed
    if (contents.current) contents.current.rotation.y = angle.current * 0.5
    const w = whisk.current
    if (w) {
      w.position.x = Math.cos(angle.current) * radius
      w.position.z = Math.sin(angle.current) * radius
      w.rotation.z = -Math.cos(angle.current) * 0.35
      w.rotation.x = Math.sin(angle.current) * 0.35
    }
    if (left.current === 0) setSettled(spin)
  })
  return [contents, whisk] as const
}

/** A gentle bob and a glowing window while `active` (the oven baking). */
export function useOvenGlow(active: boolean) {
  const body = useRef<THREE.Group>(null)
  const glass = useRef<THREE.MeshStandardMaterial>(null)
  const t = useRef(0)
  useFrameRequest(active)
  useFrame((_, delta) => {
    const b = body.current
    const m = glass.current
    if (!active) return
    t.current += Math.min(delta, 0.1)
    if (b) {
      const s = Math.sin(t.current * 11)
      b.scale.set(1 - s * 0.025, 1 + s * 0.035, 1 - s * 0.025)
    }
    if (m) m.emissiveIntensity = 0.9 + Math.sin(t.current * 6) * 0.4
  })
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (active) return
    body.current?.scale.set(1, 1, 1)
    if (glass.current) glass.current.emissiveIntensity = 0
    invalidate()
  }, [active, invalidate])
  return { body, glass }
}
