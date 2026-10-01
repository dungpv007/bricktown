import type * as THREE from 'three'
import { bakedGeometries, type BakedModel } from '../core/bake'
import { bakedMaterials, castsShadow } from './materials'

interface Props {
  baked: BakedModel
  position?: [number, number, number]
  receiveShadow?: boolean
  /** Draw every geometry with this material instead of its kind's (e.g. a tinted preview). */
  material?: THREE.Material
}

/**
 * One mesh per non-empty geometry of a baked model, each with its material kind's shared material.
 * Geometries and materials are never disposed here: the bake's owner (or the cache) frees them.
 */
export default function BakedMeshes({ baked, position, receiveShadow, material }: Props) {
  return (
    <>
      {bakedGeometries(baked).map(([kind, geometry]) => (
        <mesh
          key={kind}
          geometry={geometry}
          material={material ?? bakedMaterials[kind]}
          position={position}
          castShadow={!material && castsShadow(kind)}
          receiveShadow={receiveShadow}
          dispose={null}
        />
      ))}
    </>
  )
}
