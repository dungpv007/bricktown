import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSunShadow } from '../../render/useSunShadow'

/** Redrawn every frame (it follows the car): 1024, or 2048 with "high" shadows. */
const SHADOW_MAP_SIZE = 1024
/** Half-size of the shadow box that travels with the car. */
const SHADOW_EXTENT = 70 // covers the wider chase view
const SUN_OFFSET = new THREE.Vector3(30, 60, 20)

const tmpPos = new THREE.Vector3()

/** Sun with a shadow camera that follows the car, so shadows stay crisp anywhere in the city. */
export default function Sun({ target }: { target: RefObject<THREE.Group | null> }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const lightTarget = useMemo(() => new THREE.Object3D(), [])
  const { castShadow, mapSize } = useSunShadow(SHADOW_MAP_SIZE)

  useEffect(() => {
    const cam = light.current?.shadow.camera
    if (!cam) return
    cam.left = -SHADOW_EXTENT
    cam.right = SHADOW_EXTENT
    cam.top = SHADOW_EXTENT
    cam.bottom = -SHADOW_EXTENT
    // Negative near: a scaled-up (x10) model taller than the sun is high still casts its shadow.
    cam.near = -200
    cam.far = 200
    cam.updateProjectionMatrix()
  }, [])

  useFrame(() => {
    const car = target.current
    const l = light.current
    if (!car || !l) return
    car.getWorldPosition(tmpPos)
    lightTarget.position.copy(tmpPos)
    lightTarget.updateMatrixWorld()
    l.position.copy(tmpPos).add(SUN_OFFSET)
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#7a9a6a', 1.6]} />
      <primitive object={lightTarget} />
      <directionalLight
        ref={light}
        target={lightTarget}
        intensity={2.2}
        castShadow={castShadow}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
      />
    </>
  )
}
