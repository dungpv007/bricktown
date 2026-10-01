import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, type MaterialKind } from '../core/colors'
import { brickMaterialKind, type BakedKind } from '../core/bake'
import { brickBodyGeometry, brickPrintGeometry, brickShapeKey, hasOwnColors } from '../core/parts/brickGeometry'
import { brickCenter } from '../core/rotation'
import type { Brick } from '../core/types'
import { useInstanceCapacity } from './instanceCapacity'
import { bakedMaterials, brickMaterials, castsShadow, printMaterial } from './materials'

export type BrickPointerHandler = (e: ThreeEvent<PointerEvent>, brick: Brick) => void

interface Props {
  bricks: Brick[]
  /** Called for pointerdown / pointermove / pointerup on a brick (check `e.nativeEvent.type`). */
  onBrickPointer?: BrickPointerHandler
}

interface BrickGroupData {
  key: string
  /** Every brick of the group looks like this one (same part, and for figures the same style). */
  sample: Brick
  /** A colour's material kind (the part body), or 'print' (the part's print overlay). */
  kind: BakedKind
  bricks: Brick[]
}

const MIN_CAPACITY = 16

function groupBricks(bricks: Brick[]): BrickGroupData[] {
  const groups = new Map<string, BrickGroupData>()
  const add = (b: Brick, kind: BakedKind) => {
    const key = `${brickShapeKey(b)}|${kind}`
    let g = groups.get(key)
    if (!g) {
      g = { key, sample: b, kind, bricks: [] }
      groups.set(key, g)
    }
    g.bricks.push(b)
  }
  for (const b of bricks) {
    add(b, brickMaterialKind(b))
    // Printed parts (and figures) also get their print, in its own colours, whatever the body colour.
    if (brickPrintGeometry(b)) add(b, 'print')
  }
  return [...groups.values()]
}

/** Prints use the atlas; figure bodies their own vertex colours; other bodies the instance colour. */
function materialFor(kind: BakedKind, ownColors: boolean): THREE.Material {
  if (kind === 'print') return printMaterial
  return ownColors ? bakedMaterials.opaque : brickMaterials[kind as MaterialKind]
}

const tmpMatrix = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpScale = new THREE.Vector3(1, 1, 1)
const tmpColor = new THREE.Color()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function BrickGroup({ sample, kind, bricks, onBrickPointer }: Omit<BrickGroupData, 'key'> & Pick<Props, 'onBrickPointer'>) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = useInstanceCapacity(bricks.length, MIN_CAPACITY)
  const isPrint = kind === 'print'
  const geometry = isPrint ? brickPrintGeometry(sample)! : brickBodyGeometry(sample)
  // Prints and figures keep their own colours: no instance colour (it would tint them).
  const uncolored = isPrint || hasOwnColors(sample)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    bricks.forEach((b, i) => {
      tmpPos.set(...brickCenter(b))
      tmpQuat.setFromAxisAngle(Y_AXIS, (b.r * Math.PI) / 2)
      mesh.setMatrixAt(i, tmpMatrix.compose(tmpPos, tmpQuat, tmpScale))
      if (!uncolored) mesh.setColorAt(i, tmpColor.set(COLORS[b.c]?.hex ?? '#ffffff'))
    })
    mesh.count = bricks.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Raycasting and frustum culling use these; they go stale whenever instances move.
    mesh.computeBoundingSphere()
    mesh.boundingBox = null
  }, [bricks, capacity, uncolored])

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
      args={[geometry, materialFor(kind, hasOwnColors(sample)), capacity]}
      castShadow={castsShadow(kind)}
      receiveShadow
      onPointerDown={handle}
      onPointerMove={handle}
      onPointerUp={handle}
    />
  )
}

/**
 * All bricks of a model, one InstancedMesh per (part, material kind) group, plus one per printed
 * part for its prints. Figures group by style (`brickShapeKey`): one body and one print mesh each.
 */
export default function InstancedBricks({ bricks, onBrickPointer }: Props) {
  const groups = useMemo(() => groupBricks(bricks), [bricks])
  return (
    <group>
      {groups.map((g) => (
        <BrickGroup key={g.key} sample={g.sample} kind={g.kind} bricks={g.bricks} onBrickPointer={onBrickPointer} />
      ))}
    </group>
  )
}
