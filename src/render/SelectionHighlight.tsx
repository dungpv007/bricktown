import { useMemo } from 'react'
import * as THREE from 'three'
import { brickBodyGeometry } from '../core/parts/brickGeometry'
import { brickCenter } from '../core/rotation'
import type { Brick } from '../core/types'
import { selectionGlowMaterial, selectionRimMaterial } from './materials'
import { useHighlightPulse } from './useHighlightPulse'

interface Props {
  /** The selected brick; null hides the outline. */
  brick: Brick | null
  /** Changes whenever an action is rejected; each change shakes the outline. */
  shakeKey?: number
}

/** Rim thickness (world units) on every side. */
const THICKNESS = 0.12
/** Drawn after everything else (the rim ignores depth, so it must come last). */
const RIM_ORDER = 10
const SHAKE_AMPLITUDE = 0.12
const noRaycast = () => null

/**
 * The selected brick glows yellow (its shared geometry drawn again with the additive
 * `selectionGlowMaterial`) inside a see-through rim (a slightly bigger copy drawn last with the
 * depth-test-free `selectionRimMaterial`), so it stands out even in the middle of a wall. Both
 * pulse. Two extra meshes, shared materials.
 */
export default function SelectionHighlight({ brick, shakeKey = 0 }: Props) {
  const geometry = brick ? brickBodyGeometry(brick) : null
  const scale = useMemo((): [number, number, number] => {
    if (!geometry) return [1, 1, 1]
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const size = geometry.boundingBox!.getSize(new THREE.Vector3())
    const grow = (v: number) => (v > 0 ? (v + 2 * THICKNESS) / v : 1)
    return [grow(size.x), grow(size.y), grow(size.z)]
  }, [geometry])

  const center = brick ? brickCenter(brick) : null
  const groupRef = useHighlightPulse(shakeKey, SHAKE_AMPLITUDE, center?.[0] ?? 0)

  if (!brick || !geometry || !center) return null
  return (
    <group ref={groupRef} position={center} rotation={[0, (brick.r * Math.PI) / 2, 0]}>
      <mesh geometry={geometry} material={selectionGlowMaterial} raycast={noRaycast} dispose={null} renderOrder={RIM_ORDER - 1} />
      <mesh geometry={geometry} material={selectionRimMaterial} scale={scale} raycast={noRaycast} dispose={null} renderOrder={RIM_ORDER} />
    </group>
  )
}
