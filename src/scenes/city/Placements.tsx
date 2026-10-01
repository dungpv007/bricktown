import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakeBricks, type BakedModel } from '../../core/bake'
import { placementCenter } from '../../core/cityPlan'
import type { Baseplate, Blueprint, CityPlacement } from '../../core/types'
import { bakedGlassMaterial, bakedMaterial } from '../../render/materials'
import { resolveSource } from '../../render/sources'

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const tmpOffset = new THREE.Vector3()

/**
 * Model -> world matrix of a placement: the model (baseplate x in [0, w], z in [0, d]) is turned
 * `rot` quarter turns around its own centre and centred on its footprint cells.
 */
export function placementMatrix(
  target: THREE.Matrix4,
  p: Pick<CityPlacement, 'cx' | 'cz' | 'rot'>,
  baseplate: Baseplate,
): THREE.Matrix4 {
  const { x, z } = placementCenter(p, baseplate)
  const angle = (p.rot * Math.PI) / 2
  // world = R * (v - modelCentre) + footprintCentre
  tmpOffset.set(-baseplate.w / 2, 0, -baseplate.d / 2).applyAxisAngle(Y_AXIS, angle)
  return target.makeRotationY(angle).setPosition(x + tmpOffset.x, tmpOffset.y, z + tmpOffset.z)
}

/** Height (studs) of a baked model, at least 1. */
export function bakedHeight(baked: BakedModel): number {
  let top = 0
  for (const g of [baked.opaque, baked.glass]) {
    if (!g || g.getAttribute('position').count === 0) continue
    if (!g.boundingBox) g.computeBoundingBox()
    top = Math.max(top, g.boundingBox?.max.y ?? 0)
  }
  return Math.max(1, top)
}

const MIN_CAPACITY = 8
function capacityFor(count: number): number {
  let cap = MIN_CAPACITY
  while (cap < count) cap *= 2
  return cap
}

const tmpMatrix = new THREE.Matrix4()

function BakedInstances({
  geometry,
  glass,
  baseplate,
  placements,
}: {
  geometry: THREE.BufferGeometry
  glass: boolean
  baseplate: Baseplate
  placements: CityPlacement[]
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = capacityFor(placements.length)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    placements.forEach((p, i) => mesh.setMatrixAt(i, placementMatrix(tmpMatrix, p, baseplate)))
    mesh.count = placements.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.boundingBox = null
  }, [placements, baseplate, capacity])

  // Geometry (bake cache) and materials are shared app-wide: dispose={null} keeps R3F from freeing them.
  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[geometry, glass ? bakedGlassMaterial : bakedMaterial, capacity]}
      castShadow={!glass}
      receiveShadow
      dispose={null}
    />
  )
}

function SourceGroup({ source, placements, blueprints }: { source: string; placements: CityPlacement[]; blueprints: Blueprint[] }) {
  const resolved = useMemo(() => resolveSource(source, { blueprints }), [source, blueprints])
  const bricks = resolved?.bricks
  const baked = useMemo(() => (bricks ? bakeBricks(bricks) : null), [bricks])
  if (!resolved || !baked) return null // deleted blueprint / unknown template: nothing to draw
  return (
    <>
      {baked.opaque.getAttribute('position').count > 0 && (
        <BakedInstances geometry={baked.opaque} glass={false} baseplate={resolved.baseplate} placements={placements} />
      )}
      {baked.glass && (
        <BakedInstances geometry={baked.glass} glass baseplate={resolved.baseplate} placements={placements} />
      )}
    </>
  )
}

/** Every city placement, drawn with its baked model: one InstancedMesh per source (and glass). */
export default function Placements({ placements, blueprints }: { placements: CityPlacement[]; blueprints: Blueprint[] }) {
  const groups = useMemo(() => {
    const bySource = new Map<string, CityPlacement[]>()
    for (const p of placements) {
      let list = bySource.get(p.source)
      if (!list) bySource.set(p.source, (list = []))
      list.push(p)
    }
    return [...bySource]
  }, [placements])

  return (
    <group>
      {groups.map(([source, list]) => (
        <SourceGroup key={source} source={source} placements={list} blueprints={blueprints} />
      ))}
    </group>
  )
}
