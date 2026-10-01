import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { analyzeDrive, spawnPoint } from '../../core/drive'
import { makeSizeOf, resolveSource } from '../../render/sources'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'
import { useGame } from '../../state/useGame'
import CityGround from '../city/CityGround'
import Placements from '../city/Placements'
import Roads from '../city/Roads'
import CityColliders from './CityColliders'
import DriveUI from './DriveUI'
import Sun from './Sun'
import Vehicle, { GRAVITY, type DrivableSetup } from './Vehicle'

const SKY = '#87ceeb'
/** The car is dropped from this height above the ground at the start. */
const SPAWN_DROP = 0.4
/** Camera follow rate (1 / s): higher = tighter. */
const FOLLOW_RATE = 4

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpFwd = new THREE.Vector3()

/**
 * Third-person camera behind and above the car, following its heading (not its roll or pitch,
 * so a tumble does not spin the view) and looking a little ahead.
 */
function ChaseCamera({ target, length }: { target: RefObject<THREE.Group | null>; length: number }) {
  const camera = useThree((s) => s.camera)
  const heading = useRef(new THREE.Vector3(0, 0, -1))
  const placed = useRef(false)
  const distance = Math.max(20, length * 2.6)
  const height = distance * 0.55
  const desired = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const car = target.current
    if (!car) return
    car.getWorldPosition(tmpPos)
    car.getWorldQuaternion(tmpQuat)
    tmpFwd.set(0, 0, -1).applyQuaternion(tmpQuat).setY(0)
    if (tmpFwd.lengthSq() > 0.01) heading.current.lerp(tmpFwd.normalize(), placed.current ? 1 - Math.exp(-3 * dt) : 1).normalize()

    const h = heading.current
    desired.set(tmpPos.x - h.x * distance, tmpPos.y + height, tmpPos.z - h.z * distance)
    look.set(tmpPos.x + h.x * distance * 0.5, tmpPos.y, tmpPos.z + h.z * distance * 0.5)
    if (placed.current) camera.position.lerp(desired, 1 - Math.exp(-FOLLOW_RATE * dt))
    else camera.position.copy(desired)
    placed.current = true
    camera.lookAt(look)
  })
  return null
}

function DriveWorld({ setup, spawn }: { setup: DrivableSetup; spawn: [number, number, number] }) {
  const city = useGame((s) => s.data.city)
  const blueprints = useGame((s) => s.data.blueprints)
  const chassis = useRef<THREE.Group>(null)
  const length = setup.config.chassis.halfExtents[2] * 2
  return (
    <>
      <Sun target={chassis} />
      <ChaseCamera target={chassis} length={length} />
      <CityGround size={city.size} />
      <Roads roads={city.roads} />
      <Placements placements={city.placements} blueprints={blueprints} />
      {/* Physics steps before the camera reads the car (lower priority runs first). */}
      <Physics timeStep={1 / 60} gravity={[0, -GRAVITY, 0]} updatePriority={-50}>
        <CityColliders city={city} blueprints={blueprints} />
        <Vehicle setup={setup} spawn={spawn} chassisRef={chassis} />
      </Physics>
    </>
  )
}

/**
 * Drive mode: the kid's city with physics, the chosen vehicle and the on-screen controls.
 * Lazy-loaded (this module pulls in Rapier's WASM).
 */
export default function DriveScene({ source, onChangeVehicle }: { source: string; onChangeVehicle: () => void }) {
  useEvictStaleBakesOnUnmount()
  const blueprints = useGame((s) => s.data.blueprints)
  const resolved = useMemo(() => resolveSource(source, { blueprints }), [source, blueprints])
  const bricks = resolved?.bricks
  const setup = useMemo(() => (bricks ? analyzeDrive(bricks) : null), [bricks])
  const [spawn] = useState<[number, number, number]>(() => {
    const data = useGame.getState().data
    const { x, z } = spawnPoint(data.city, makeSizeOf(data))
    return [x, SPAWN_DROP, z]
  })

  // The vehicle was deleted or can no longer drive: back to the picker.
  const drivable = setup?.ok === true
  useEffect(() => {
    if (!drivable) onChangeVehicle()
  }, [drivable, onChangeVehicle])
  if (!setup?.ok) return null

  return (
    <>
      <Canvas shadows="percentage" dpr={[1, 1.5]} camera={{ fov: 55, near: 0.5, far: 1500 }} data-testid="drive-canvas">
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, 250, 700]} />
        <DriveWorld setup={setup} spawn={spawn} />
      </Canvas>
      <DriveUI source={source} onChangeVehicle={onChangeVehicle} />
    </>
  )
}
