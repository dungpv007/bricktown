import * as THREE from 'three'
import { bakedGeometries, type BakedModel } from '../core/bake'
import { placementCenter } from '../core/cityPlan'
import type { Box } from '../core/drive'
import type { Baseplate, CityPlacement } from '../core/types'

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const tmpOffset = new THREE.Vector3()

/**
 * Model -> world matrix of a placement: the model (baseplate x in [0, w], z in [0, d]) is turned
 * `rot` quarter turns around its own centre and centred on its footprint cells.
 * `placementWorldBox` (src/core/drive.ts) encodes the same transform with exact integer math for the
 * drive colliders; placementTransform.test.ts keeps the two in agreement.
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

/**
 * Model-space bounding box of a baked model (all of its geometries). The geometries are the shared
 * bake cache: only their cached `boundingBox` is touched, never dispose them. Null without geometry.
 */
export function bakedModelBox(baked: BakedModel): Box | null {
  const box = new THREE.Box3()
  for (const [, g] of bakedGeometries(baked)) {
    if (!g.boundingBox) g.computeBoundingBox()
    if (g.boundingBox) box.union(g.boundingBox)
  }
  if (box.isEmpty()) return null
  return { min: box.min.toArray(), max: box.max.toArray() }
}
