import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, colorMaterialKind, type MaterialKind } from '../core/colors'
import { getPartGeometry } from '../core/parts/geometry'
import { brickCenter } from '../core/rotation'
import type { Brick } from '../core/types'
import { useInstanceCapacity } from './instanceCapacity'
import { brickMaterials, castsShadow } from './materials'

export type BrickPointerHandler = (e: ThreeEvent<PointerEvent>, brick: Brick) => void

interface Props {
  bricks: Brick[]
  /** Called for pointerdown / pointermove / pointerup on a brick (check `e.nativeEvent.type`). */
  onBrickPointer?: BrickPointerHandler
}

interface BrickGroupData {
  key: string
  partId: string
  kind: MaterialKind
  bricks: Brick[]
}

const MIN_CAPACITY = 16

function groupBricks(bricks: Brick[]): BrickGroupData[] {
  const groups = new Map<string, BrickGroupData>()
  for (const b of bricks) {
    const kind = colorMaterialKind(b.c)
    const key = `${b.p}|${kind}`
    let g = groups.get(key)
    if (!g) {
      g = { key, partId: b.p, kind, bricks: [] }
      groups.set(key, g)
    }
    g.bricks.push(b)
  }
  return [...groups.values()]
}

const tmpMatrix = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpScale = new THREE.Vector3(1, 1, 1)
const tmpColor = new THREE.Color()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function BrickGroup({ partId, kind, bricks, onBrickPointer }: Omit<BrickGroupData, 'key'> & Pick<Props, 'onBrickPointer'>) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = useInstanceCapacity(bricks.length, MIN_CAPACITY)
  const geometry = getPartGeometry(partId)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    bricks.forEach((b, i) => {
      tmpPos.set(...brickCenter(b))
      tmpQuat.setFromAxisAngle(Y_AXIS, (b.r * Math.PI) / 2)
      mesh.setMatrixAt(i, tmpMatrix.compose(tmpPos, tmpQuat, tmpScale))
      mesh.setColorAt(i, tmpColor.set(COLORS[b.c]?.hex ?? '#ffffff'))
    })
    mesh.count = bricks.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Raycasting and frustum culling use these; they go stale whenever instances move.
    mesh.computeBoundingSphere()
    mesh.boundingBox = null
  }, [bricks, capacity])

  const handle = onBrickPointer
    ? (e: ThreeEvent<PointerEvent>) => {
        const b = e.instanceId === undefined ? undefined : bricks[e.instanceId]
        if (b) onBrickPointer(e, b)
      }
    : undefined

  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[geometry, brickMaterials[kind], capacity]}
      castShadow={castsShadow(kind)}
      receiveShadow
      onPointerDown={handle}
      onPointerMove={handle}
      onPointerUp={handle}
    />
  )
}

/** All bricks of a model, one InstancedMesh per (part, material kind) group. */
export default function InstancedBricks({ bricks, onBrickPointer }: Props) {
  const groups = useMemo(() => groupBricks(bricks), [bricks])
  return (
    <group>
      {groups.map((g) => (
        <BrickGroup key={g.key} partId={g.partId} kind={g.kind} bricks={g.bricks} onBrickPointer={onBrickPointer} />
      ))}
    </group>
  )
}
