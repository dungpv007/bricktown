import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPartGeometry } from '../core/parts/geometry'
import { brickCenter } from '../core/rotation'
import type { Rot } from '../core/types'
import { ghostMaterial } from './materials'

interface Props {
  partId: string
  rot: Rot
  /** Where the part would go; null hides the ghost. */
  anchor: { x: number; y: number; z: number } | null
  valid: boolean
  /**
   * Keep the ghost mounted and toggle this instead of unmounting it, so showing it again after
   * each placement costs nothing. Defaults to true.
   */
  visible?: boolean
  /** Changes whenever an action is rejected; each change plays a short shake. */
  shakeKey?: number
}

const VALID_TINT = new THREE.Color('#3ddc84')
const INVALID_TINT = new THREE.Color('#ff3b30')
const SHAKE_SECONDS = 0.35
const SHAKE_AMPLITUDE = 0.12
const ORIGIN = { x: 0, y: 0, z: 0 }
const noRaycast = () => null

/**
 * Translucent preview of the part about to be placed; green when it fits, red when it does not.
 * Uses the shared `ghostMaterial` (one ghost on screen at a time), tinted every frame.
 */
export default function GhostBrick({ partId, rot, anchor, valid, visible = true, shakeKey = 0 }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const shakeStart = useRef<number | null>(null)
  const firstShakeKey = useRef(shakeKey)
  useEffect(() => {
    if (shakeKey !== firstShakeKey.current) shakeStart.current = performance.now()
  }, [shakeKey])

  const shown = visible && anchor !== null
  const a = anchor ?? ORIGIN
  const [cx, cy, cz] = brickCenter({ id: 'ghost', p: partId, x: a.x, y: a.y, z: a.z, r: rot, c: 0 })

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh || !mesh.visible) return
    const mat = mesh.material as THREE.MeshStandardMaterial
    const tint = valid ? VALID_TINT : INVALID_TINT
    mat.color.copy(tint)
    mat.emissive.copy(tint)
    mat.emissiveIntensity = 0.25 + 0.2 * Math.sin(clock.elapsedTime * 6)

    let offset = 0
    if (shakeStart.current !== null) {
      const t = (performance.now() - shakeStart.current) / 1000
      if (t < SHAKE_SECONDS) offset = Math.sin(t * 60) * SHAKE_AMPLITUDE * (1 - t / SHAKE_SECONDS)
      else shakeStart.current = null
    }
    mesh.position.x = cx + offset
  })

  return (
    <mesh
      ref={meshRef}
      visible={shown}
      geometry={getPartGeometry(partId)}
      material={ghostMaterial}
      position={[cx, cy, cz]}
      rotation={[0, (rot * Math.PI) / 2, 0]}
      raycast={noRaycast}
      dispose={null}
      renderOrder={1}
    />
  )
}
