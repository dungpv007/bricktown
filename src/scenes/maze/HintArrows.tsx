import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cellCenterXZ } from '../../core/mazeRun'
import { useMazeRun } from '../../state/useMazeRun'

const ARROW_COLOR = '#ffe14d'
/** Just above the floor and the entry/exit pads. */
const ARROW_Y = 0.12
/** Pulse speed (radians / s) and how far apart in phase the arrows glow (a wave towards the exit). */
const PULSE_RATE = 6
const PULSE_STEP = 0.9

/** A flat arrow pointing to -Z (heading 0), about 5 studs long, lying on the floor. */
function buildArrow(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, 2.6)
  s.lineTo(2.2, 0.2)
  s.lineTo(0.9, 0.2)
  s.lineTo(0.9, -2.4)
  s.lineTo(-0.9, -2.4)
  s.lineTo(-0.9, 0.2)
  s.lineTo(-2.2, 0.2)
  s.closePath()
  // The shape's +Y (the tip) becomes -Z once laid flat.
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
}

/** Glowing arrows on the floor along the way out while a hint shows (see `useMazeRun.askHint`). */
export default function HintArrows() {
  const arrows = useMazeRun((s) => s.hintArrows)
  const geometry = useMemo(() => buildArrow(), [])
  const materials = useMemo(
    () =>
      Array.from(
        { length: 8 },
        () => new THREE.MeshBasicMaterial({ color: ARROW_COLOR, transparent: true, depthWrite: false, toneMapped: false }),
      ),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      for (const m of materials) m.dispose()
    },
    [geometry, materials],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * PULSE_RATE
    materials.forEach((m, i) => {
      m.opacity = 0.75 + 0.25 * Math.sin(t - i * PULSE_STEP)
    })
  })

  return (
    <group>
      {arrows.map((a, i) => {
        const { x, z } = cellCenterXZ(a.cell)
        return (
          <mesh
            key={`${a.cell.cx},${a.cell.cz}`}
            geometry={geometry}
            material={materials[i % materials.length]}
            position={[x, ARROW_Y, z]}
            rotation={[0, a.yaw, 0]}
            renderOrder={3}
          />
        )
      })}
    </group>
  )
}
