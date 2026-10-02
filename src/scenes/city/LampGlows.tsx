import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { scaleOf } from '../../core/city'
import type { Baseplate, CityPlacement } from '../../core/types'
import { nightMaterials } from '../../render/nightGlow'
import { placementMatrix } from '../../render/placementTransform'
import { templateSource } from '../../render/sources'

/** The street lamp template and where its glowing head sits in model space (studs). */
const LAMP_SOURCE = templateSource('lamp')
const LAMP_HEAD = new THREE.Vector3(4, 4.7, 4)
const LAMP_FOOT = new THREE.Vector3(4, 0, 4)
/** The pool of light on the pavement (studs across, at size x1) and its height (just over the sidewalks). */
const POOL_SIZE = 18
const POOL_Y = 0.36

const noRaycast = () => {}
const poolGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const tmpMatrix = new THREE.Matrix4()
const tmpPoint = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const NO_ROTATION = new THREE.Quaternion()

/**
 * Street lamps at night: a halo sprite on every lamp head (one Points draw call) and a warm pool of
 * light on the ground under it (one instanced draw call). No real lights. The materials are hidden in
 * daylight, so this costs nothing by day (see render/nightGlow).
 */
export default function LampGlows({ placements, sizeOf }: { placements: CityPlacement[]; sizeOf: (source: string) => Baseplate }) {
  const lamps = useMemo(() => placements.filter((p) => p.source === LAMP_SOURCE), [placements])
  const mats = nightMaterials()

  const halo = useMemo(() => {
    const positions = new Float32Array(Math.max(1, lamps.length) * 3)
    const base = sizeOf(LAMP_SOURCE)
    lamps.forEach((p, i) => {
      tmpPoint.copy(LAMP_HEAD).applyMatrix4(placementMatrix(tmpMatrix, p, base))
      positions.set([tmpPoint.x, tmpPoint.y, tmpPoint.z], i * 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setDrawRange(0, lamps.length)
    return g
  }, [lamps, sizeOf])
  useEffect(() => () => halo.dispose(), [halo])

  const pools = useRef<THREE.InstancedMesh>(null)
  const capacity = Math.max(8, lamps.length)
  useLayoutEffect(() => {
    const mesh = pools.current
    if (!mesh) return
    const base = sizeOf(LAMP_SOURCE)
    lamps.forEach((p, i) => {
      tmpPoint.copy(LAMP_FOOT).applyMatrix4(placementMatrix(tmpMatrix, p, base))
      tmpPoint.y = POOL_Y
      const k = POOL_SIZE * scaleOf(p)
      mesh.setMatrixAt(i, tmpMatrix.compose(tmpPoint, NO_ROTATION, tmpScale.set(k, 1, k)))
    })
    mesh.count = lamps.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [lamps, sizeOf, capacity])

  if (lamps.length === 0) return null
  return (
    <>
      <points geometry={halo} material={mats.lampHalo} raycast={noRaycast} frustumCulled={false} renderOrder={2} dispose={null} />
      <instancedMesh
        key={capacity}
        ref={pools}
        args={[poolGeometry, mats.lampPool, capacity]}
        raycast={noRaycast}
        renderOrder={1}
      />
    </>
  )
}
