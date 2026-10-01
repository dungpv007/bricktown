import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { brickBodyGeometry } from '../core/parts/brickGeometry'
import { brickCenter } from '../core/rotation'
import type { Brick } from '../core/types'
import { selectionMaterial } from './materials'

interface Props {
  /** The selected brick; null hides the outline. */
  brick: Brick | null
  /** Changes whenever an action is rejected; each change shakes the outline. */
  shakeKey?: number
}

/** Outline thickness (world units) on every side. */
const THICKNESS = 0.16
const YELLOW = new THREE.Color('#ffd500')
const ORANGE = new THREE.Color('#ff8a00')
const SHAKE_SECONDS = 0.35
const SHAKE_AMPLITUDE = 0.12
const noRaycast = () => null

/**
 * A pulsing yellow rim around the selected brick: one extra mesh using the brick's shared
 * geometry, scaled up a little, drawn with the shared back-face `selectionMaterial`.
 */
export default function SelectionHighlight({ brick, shakeKey = 0 }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const shakeStart = useRef<number | null>(null)
  const firstShakeKey = useRef(shakeKey)
  useEffect(() => {
    if (shakeKey !== firstShakeKey.current) shakeStart.current = performance.now()
  }, [shakeKey])

  const geometry = brick ? brickBodyGeometry(brick) : null
  const scale = useMemo((): [number, number, number] => {
    if (!geometry) return [1, 1, 1]
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const size = geometry.boundingBox!.getSize(new THREE.Vector3())
    const grow = (v: number) => (v > 0 ? (v + 2 * THICKNESS) / v : 1)
    return [grow(size.x), grow(size.y), grow(size.z)]
  }, [geometry])

  const center = brick ? brickCenter(brick) : null
  const cx = center?.[0] ?? 0

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    selectionMaterial.color.lerpColors(YELLOW, ORANGE, 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6))
    let offset = 0
    if (shakeStart.current !== null) {
      const t = (performance.now() - shakeStart.current) / 1000
      if (t < SHAKE_SECONDS) offset = Math.sin(t * 60) * SHAKE_AMPLITUDE * (1 - t / SHAKE_SECONDS)
      else shakeStart.current = null
    }
    mesh.position.x = cx + offset
  })

  if (!brick || !geometry || !center) return null
  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={selectionMaterial}
      position={center}
      rotation={[0, (brick.r * Math.PI) / 2, 0]}
      scale={scale}
      raycast={noRaycast}
      dispose={null}
    />
  )
}
