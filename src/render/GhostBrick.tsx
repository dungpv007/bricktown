import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPartGeometry } from '../core/parts/geometry'
import { brickCenter } from '../core/rotation'
import type { Rot } from '../core/types'
import { createGhostMaterial } from './materials'

interface Props {
  partId: string
  rot: Rot
  anchor: { x: number; y: number; z: number }
  valid: boolean
  /** Changes whenever an action is rejected; each change plays a short shake. */
  shakeKey?: number
}

const VALID_TINT = new THREE.Color('#3ddc84')
const INVALID_TINT = new THREE.Color('#ff3b30')
const SHAKE_SECONDS = 0.35
const SHAKE_AMPLITUDE = 0.12
const noRaycast = () => null

/** Translucent preview of the part about to be placed; green when it fits, red when it does not. */
export default function GhostBrick({ partId, rot, anchor, valid, shakeKey = 0 }: Props) {
  const [material] = useState(createGhostMaterial)
  useEffect(() => () => material.dispose(), [material])

  const meshRef = useRef<THREE.Mesh>(null)
  const shakeStart = useRef<number | null>(null)
  const firstShakeKey = useRef(shakeKey)
  useEffect(() => {
    if (shakeKey !== firstShakeKey.current) shakeStart.current = performance.now()
  }, [shakeKey])

  const [cx, cy, cz] = brickCenter({ id: 'ghost', p: partId, x: anchor.x, y: anchor.y, z: anchor.z, r: rot, c: 0 })

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
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
      geometry={getPartGeometry(partId)}
      material={material}
      position={[cx, cy, cz]}
      rotation={[0, (rot * Math.PI) / 2, 0]}
      raycast={noRaycast}
      dispose={null}
      renderOrder={1}
    />
  )
}
