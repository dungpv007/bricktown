import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cellCenterXZ } from '../../core/mazeRun'
import { useMazeRun } from '../../state/useMazeRun'
import { arrowGeometry } from './mazeGeometry'

const ARROW_COLOR = '#ffe14d'
/** Just above the floor and the entry/exit pads. */
const ARROW_Y = 0.12
/** Pulse speed (radians / s) and how far apart in phase the arrows glow (a wave towards the exit). */
const PULSE_RATE = 6
const PULSE_STEP = 0.9

/**
 * Glowing arrows on the floor along the way out while a hint shows (see `useMazeRun.askHint`).
 * The geometry is the shared cached one; each arrow's material is declared in JSX, so R3F owns it.
 */
export default function HintArrows() {
  const arrows = useMazeRun((s) => s.hintArrows)
  const group = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.elapsedTime * PULSE_RATE
    g.children.forEach((child, i) => {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
      material.opacity = 0.75 + 0.25 * Math.sin(t - i * PULSE_STEP)
    })
  })

  return (
    <group ref={group}>
      {arrows.map((a) => {
        const { x, z } = cellCenterXZ(a.cell)
        return (
          <mesh key={`${a.cell.cx},${a.cell.cz}`} geometry={arrowGeometry()} position={[x, ARROW_Y, z]} rotation={[0, a.yaw, 0]} renderOrder={3}>
            <meshBasicMaterial color={ARROW_COLOR} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}
