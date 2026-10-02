import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type * as THREE from 'three'
import { error as errorSound, pop } from '../../audio/sfx'
import { useFrameRequest } from '../../render/frameDriver'

type Vec3 = [number, number, number]

/**
 * A shake for "try again": `const [ref, wobble] = useWobble()`, put `ref` on a group and call
 * `wobble()` (a gentle side-to-side shake that dies down, with a soft sound). Never a fail state.
 */
export function useWobble(): [RefObject<THREE.Group | null>, () => void] {
  const ref = useRef<THREE.Group>(null)
  const left = useRef(0)
  const [active, setActive] = useState(false)
  useFrameRequest(active)
  useFrame((_, delta) => {
    const g = ref.current
    if (!g || !active) return
    left.current = Math.max(0, left.current - Math.min(delta, 0.1) * 1.8)
    g.rotation.z = Math.sin(left.current * 28) * 0.25 * left.current
    if (left.current === 0) {
      g.rotation.z = 0
      setActive(false)
    }
  })
  const wobble = useCallback(() => {
    left.current = 1
    setActive(true)
    errorSound()
  }, [])
  return [ref, wobble]
}

export interface TappableProps {
  onTap: () => void
  /** Size of the invisible tap box (studs), centred above the origin: big, for small fingers. */
  hitSize?: Vec3
  disabled?: boolean
  position?: Vec3
  children: ReactNode
}

/** Something to tap (roll, cut, mix, the phone...): a squash-and-bounce and a pop on each tap. */
export function Tappable({ onTap, hitSize = [3, 3, 3], disabled = false, position, children }: TappableProps) {
  const group = useRef<THREE.Group>(null)
  const squash = useRef(0)
  const [bouncing, setBouncing] = useState(false)
  useFrameRequest(bouncing)
  useFrame((_, delta) => {
    const g = group.current
    if (!g || !bouncing) return
    squash.current = Math.max(0, squash.current - Math.min(delta, 0.1) * 4)
    const s = 1 - Math.sin(squash.current * Math.PI) * 0.15
    g.scale.set(2 - s, s, 2 - s)
    if (squash.current === 0) {
      g.scale.set(1, 1, 1)
      setBouncing(false)
    }
  })
  const tap = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (disabled) return
    squash.current = 1
    setBouncing(true)
    pop()
    onTap()
  }
  return (
    <group position={position}>
      <group ref={group}>{children}</group>
      <mesh position={[0, hitSize[1] / 2, 0]} onClick={tap}>
        <boxGeometry args={hitSize} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
