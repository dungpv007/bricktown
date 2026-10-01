import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { PLATE_MAX } from '../../core/baseplate'
import { COLORS } from '../../core/colors'
import type { Baseplate as BaseplateSize, BlueprintKind } from '../../core/types'
import { PLATE_HEIGHT } from '../../core/units'

interface Props {
  size: BaseplateSize
  kind: BlueprintKind
  /** Called for pointerdown / pointermove / pointerup on the plate or its studs. */
  onPointer?: (e: ThreeEvent<PointerEvent>) => void
}

/** Same proportions as the part studs in core/parts/geometry.ts. */
const STUD_RADIUS = 0.3
const STUD_HEIGHT = 0.17
const STUD_SEGMENTS = 12
const THICKNESS = PLATE_HEIGHT / 2

const PLATE_COLOR: Record<BlueprintKind, string> = {
  building: COLORS[5].hex,
  vehicle: COLORS[8].hex,
  prop: COLORS[10].hex,
}

/** Instances allocated up front, so resizing the plate (up to the max) only changes `count`. */
const STUD_CAPACITY = PLATE_MAX * PLATE_MAX

function Studs({ w, d, color, onPointer }: { w: number; d: number; color: string; onPointer?: Props['onPointer'] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  // A bigger plate (e.g. an oversized template) still fits: the mesh is rebuilt only then.
  const capacity = Math.max(STUD_CAPACITY, w * d)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    let i = 0
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) mesh.setMatrixAt(i++, m.makeTranslation(x + 0.5, STUD_HEIGHT / 2, z + 0.5))
    }
    mesh.count = w * d
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [w, d, capacity])

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, capacity]}
      receiveShadow
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      onPointerUp={onPointer}
    >
      <cylinderGeometry args={[STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, STUD_SEGMENTS]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </instancedMesh>
  )
}

/** Flat yellow arrow on the ground in front of a vehicle plate, pointing at -Z (the car's front). */
function FrontArrow({ w }: { w: number }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.45, 0)
    s.lineTo(-0.45, 0.9)
    s.lineTo(-1.1, 0.9)
    s.lineTo(0, 2)
    s.lineTo(1.1, 0.9)
    s.lineTo(0.45, 0.9)
    s.lineTo(0.45, 0)
    s.closePath()
    return s
  }, [])
  // Shape +Y -> world -Z after the -90deg X rotation; the face then points up.
  return (
    <mesh position={[w / 2, -THICKNESS + 0.03, -0.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={COLORS[4].hex} roughness={0.6} />
    </mesh>
  )
}

/** Studded plate covering x in [0, w], z in [0, d] with its top at y = 0. */
export default function Baseplate({ size, kind, onPointer }: Props) {
  const { w, d } = size
  const color = PLATE_COLOR[kind]
  return (
    <group>
      {/* A unit box scaled to size, so resizing never rebuilds the geometry. */}
      <mesh
        position={[w / 2, -THICKNESS / 2, d / 2]}
        scale={[w, THICKNESS, d]}
        receiveShadow
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
      >
        <boxGeometry />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <Studs w={w} d={d} color={color} onPointer={onPointer} />
      {kind === 'vehicle' && <FrontArrow w={w} />}
    </group>
  )
}
