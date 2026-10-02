import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { FigStyle } from '../../core/types'
import { useFrameRequest } from '../../render/frameDriver'
import { Minifig, MINIFIG_HEIGHT } from './BrickModel'
import { STAGE } from './GameStage'

type XZ = [number, number]

/** How the customer at the counter feels: shown by a hop (happy) or a head shake (no). */
export type Mood = 'idle' | 'happy' | 'no'

export interface CustomerQueueProps {
  /** Every customer of the round, in order (styles or `FIG_PRESETS` ids). */
  customers: Array<FigStyle | string>
  /** Index of the customer being served; customers before it have left. `customers.length`: all gone. */
  current: number
  /** Where the served customer stands (x, z). Default: centre, behind the counter. */
  spot?: XZ
  /** Where customers walk in from. */
  from?: XZ
  /** Where they walk out to. */
  to?: XZ
  /** Walking speed (studs per second). */
  speed?: number
  mood?: Mood
  /** The current customer reached the spot (show the order then). */
  onArrive?: (index: number) => void
  /** Drawn above the current customer's head once they arrived (e.g. an `OrderBubble`). */
  above?: ReactNode
}

const DEFAULT_SPOT: XZ = [0, STAGE.customerZ]
const DEFAULT_FROM: XZ = [-22, STAGE.customerZ - 2]
const DEFAULT_TO: XZ = [22, STAGE.customerZ - 2]

/** Moves `obj` toward (x, z) at `step` studs; true once there. Turns it to face where it walks. */
function walk(obj: THREE.Object3D, x: number, z: number, step: number): boolean {
  const dx = x - obj.position.x
  const dz = z - obj.position.z
  const dist = Math.hypot(dx, dz)
  if (dist <= step) {
    obj.position.x = x
    obj.position.z = z
    return true
  }
  obj.position.x += (dx / dist) * step
  obj.position.z += (dz / dist) * step
  obj.rotation.y = Math.atan2(dx, dz)
  return false
}

/**
 * Customers walking in to the counter one at a time and out again, as minifigs along a path. Frames
 * run only while someone walks or reacts (render on demand otherwise).
 */
export default function CustomerQueue({
  customers,
  current,
  spot = DEFAULT_SPOT,
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  speed = 9,
  mood = 'idle',
  onArrive,
  above,
}: CustomerQueueProps) {
  const walker = useRef<THREE.Group>(null)
  const leaver = useRef<THREE.Group>(null)
  const [leaving, setLeaving] = useState<number | null>(null)
  const [arrived, setArrived] = useState<number | null>(null)
  const [seen, setSeen] = useState(current)
  const onArriveRef = useRef(onArrive)
  useEffect(() => {
    onArriveRef.current = onArrive
  })

  // A new customer: the previous one turns to leave (adjusting state while rendering, React's pattern).
  if (seen !== current) {
    setSeen(current)
    setLeaving(seen < current && seen < customers.length ? seen : null)
    setArrived(null)
  }

  // The leaver starts where the served customer stood.
  useEffect(() => {
    if (leaving !== null && leaver.current) leaver.current.position.set(spot[0], 0, spot[1])
  }, [leaving, spot])
  // The newcomer starts at the door.
  useEffect(() => {
    if (walker.current) walker.current.position.set(from[0], 0, from[1])
  }, [current, from])

  const hasCurrent = current < customers.length
  const animating = (hasCurrent && arrived !== current) || leaving !== null || mood !== 'idle'
  useFrameRequest(animating)

  const time = useRef(0)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    time.current += dt
    const step = speed * dt
    const w = walker.current
    if (w && hasCurrent && arrived !== current) {
      w.position.y = Math.abs(Math.sin(time.current * 12)) * 0.25
      if (walk(w, spot[0], spot[1], step)) {
        w.position.y = 0
        w.rotation.y = 0
        setArrived(current)
        onArriveRef.current?.(current)
      }
    } else if (w && arrived === current) {
      // At the counter: hop when happy, shake the head (turn) when not.
      const t = time.current
      w.position.y = mood === 'happy' ? Math.abs(Math.sin(t * 9)) * 0.8 : 0
      w.rotation.y = mood === 'no' ? Math.sin(t * 16) * 0.45 : 0
    }
    const l = leaver.current
    if (l && leaving !== null) {
      l.position.y = Math.abs(Math.sin(time.current * 12)) * 0.25
      if (walk(l, to[0], to[1], step)) setLeaving(null)
    }
  })

  return (
    <>
      {hasCurrent && (
        <group ref={walker} key={`c${current}`} position={[from[0], 0, from[1]]}>
          <Minifig fig={customers[current]} />
          {arrived === current && above && <group position={[0, MINIFIG_HEIGHT + 0.6, 0]}>{above}</group>}
        </group>
      )}
      {leaving !== null && (
        <group ref={leaver} key={`l${leaving}`} position={[spot[0], 0, spot[1]]}>
          <Minifig fig={customers[leaving]} />
        </group>
      )}
    </>
  )
}
