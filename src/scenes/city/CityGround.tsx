import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CELL } from '../../core/city'

const GRASS = '#7cc46a'
const OUTSIDE = '#a9dc9b'
const GRID = '#2f6b2a'
const GRID_OPACITY = 0.18
/** How far the lighter land around the city reaches past its edges by default (studs). */
const BORDER = 200

/**
 * Green city plate of `size` x `size` cells (top at y = 0) with subtle cell lines and land around it,
 * reaching `border` studs past the edges (the City takes it out into the fog, past the horizon).
 */
export default function CityGround({ size, border = BORDER }: { size: number; border?: number }) {
  const span = size * CELL
  const mid = span / 2

  const grid = useMemo(() => {
    const points: number[] = []
    for (let i = 0; i <= size; i++) {
      const v = i * CELL
      points.push(v, 0, 0, v, 0, span, 0, 0, v, span, 0, v)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return g
  }, [size, span])
  useEffect(() => () => grid.dispose(), [grid])

  return (
    <group>
      <mesh position={[mid, 0, mid]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[span, span]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>
      <mesh position={[mid, -0.3, mid]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[span + border * 2, span + border * 2]} />
        <meshStandardMaterial color={OUTSIDE} roughness={1} />
      </mesh>
      <lineSegments geometry={grid} position={[0, 0.02, 0]}>
        <lineBasicMaterial color={GRID} transparent opacity={GRID_OPACITY} depthWrite={false} />
      </lineSegments>
    </group>
  )
}
