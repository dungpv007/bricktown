import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierContext,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { bakeBricksUncached, disposeBaked, type BakedModel } from '../../core/bake'
import {
  approach,
  clampHorizontalSpeed,
  DRIVE,
  engineForce,
  steerAngle,
  uprightYaw,
  type DriveAnalysis,
  type SteerTuning,
} from '../../core/drive'
import { brickCenter } from '../../core/rotation'
import type { Brick } from '../../core/types'
import type { VehicleConfig } from '../../core/vehicle'
import BakedMeshes from '../../render/BakedMeshes'
import { useDriveInput } from '../../state/useDriveInput'
import { useDriveStatus } from '../../state/useDriveStatus'

type World = RapierContext['world']
type VehicleController = ReturnType<World['createVehicleController']>
interface Mount {
  x: number
  y: number
  z: number
}
/** The controller and what it was built for: rebuilt when the rigid body or the wheels change. */
interface ControllerBinding {
  controller: VehicleController
  body: RapierRigidBody
  mounts: Mount[]
}
export type DrivableSetup = Extract<DriveAnalysis, { ok: true }>

/** World gravity (studs / s^2): stronger than 9.81 because a stud is ~0.5 m in toy scale. */
export const GRAVITY = 20

const SUSPENSION_REST = 0.3
const SUSPENSION_STIFFNESS = 30
/** Spring damping (Rapier scales it by the chassis mass): close to critical, so the car does not bounce. */
const SUSPENSION_COMPRESSION = 6
const SUSPENSION_RELAXATION = 7
const FRICTION_SLIP = 1.5
/** Steering follows the stick at this rate (1 / s), so the wheels turn smoothly. */
const STEER_RATE = 8
/** Brake impulse per wheel and unit of mass: hard brake, and the gentle drag when coasting. */
const BRAKE_PER_MASS = 0.12
const COAST_BRAKE_PER_MASS = 0.02
/** Extra rotational inertia: the car resists tipping in sharp turns and bumps. */
const INERTIA_SCALE = 2
const CHASSIS_FRICTION = 0.3
/** Below this height the car has fallen out of the world and is put back at the start. */
const FALL_LIMIT = -20
/** The flip button sets the car down upright this far above whatever it was lying on. */
const FLIP_LIFT = 1
/** The production-safe status (`useDriveStatus`) is refreshed every this many physics steps. */
const STATUS_EVERY = 6

const TWO_PI = Math.PI * 2

const FORWARD = new THREE.Vector3(0, 0, -1)
const UP = new THREE.Vector3(0, 1, 0)
const tmpQuat = new THREE.Quaternion()
const tmpVec = new THREE.Vector3()

function quatOf(rb: RapierRigidBody): THREE.Quaternion {
  const r = rb.rotation()
  return tmpQuat.set(r.x, r.y, r.z, r.w)
}

/** Unit forward (-Z) of the body in world space (shared vector, copy to keep). */
function forwardOf(rb: RapierRigidBody): THREE.Vector3 {
  return tmpVec.copy(FORWARD).applyQuaternion(quatOf(rb))
}

/** Teleports the body to `pos`, upright and turned `yaw` around +Y, at rest. */
function placeBody(rb: RapierRigidBody, pos: { x: number; y: number; z: number }, yaw: number) {
  const q = tmpQuat.setFromAxisAngle(UP, yaw)
  rb.setTranslation(pos, true)
  rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
  rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
}

/**
 * The flip button: puts the car back on its wheels facing the way it was heading, just above the
 * lowest point of its chassis box (what it was lying on), wherever it ended up.
 */
function flipUpright(rb: RapierRigidBody, chassis: VehicleConfig['chassis']) {
  const t = rb.translation()
  const f = forwardOf(rb)
  const yaw = uprightYaw([f.x, f.y, f.z])
  const q = quatOf(rb)
  const [hx, hy, hz] = chassis.halfExtents
  const [cx, cy, cz] = chassis.center
  let lowest = t.y // the wheels' contact points when upright
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const y = tmpVec.set(cx + sx * hx, cy + sy * hy, cz + sz * hz).applyQuaternion(q).y + t.y
        lowest = Math.min(lowest, y)
      }
    }
  }
  placeBody(rb, { x: t.x, y: Math.max(0, lowest) + FLIP_LIFT, z: t.z }, yaw)
}

/** Dev only: where the car is (and its body), for e2e specs and manual checks (`window.__btDrive`). */
function publishTelemetry(rb: RapierRigidBody, speed: number) {
  const t = rb.translation()
  const upY = tmpVec.copy(UP).applyQuaternion(quatOf(rb)).y
  ;(window as unknown as { __btDrive?: unknown }).__btDrive = { x: t.x, y: t.y, z: t.z, upY, speed, body: rb }
}

/** Ray-cast vehicle controller for `rb` with one wheel per config wheel, mounted at `mounts`. */
function createController(world: World, rb: RapierRigidBody, config: VehicleConfig, mounts: Mount[]): VehicleController {
  const c = world.createVehicleController(rb)
  config.wheels.forEach((w, i) => {
    // Suspension straight down, axle along +X: Rapier then drives the wheel towards -Z.
    c.addWheel(mounts[i], { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, SUSPENSION_REST, w.radius)
    c.setWheelSuspensionStiffness(i, SUSPENSION_STIFFNESS)
    c.setWheelSuspensionCompression(i, SUSPENSION_COMPRESSION)
    c.setWheelSuspensionRelaxation(i, SUSPENSION_RELAXATION)
    c.setWheelFrictionSlip(i, FRICTION_SLIP)
  })
  useDriveStatus.getState().controllerAdded()
  return c
}

function removeController(world: World, c: VehicleController) {
  world.removeVehicleController(c)
  useDriveStatus.getState().controllerRemoved()
}

/** Collider mass properties: all the mass at axle height, with padded box inertia. */
function chassisMass(config: VehicleConfig) {
  const [hx, hy, hz] = config.chassis.halfExtents
  const cy = config.chassis.center[1]
  const axleY = Math.min(...config.wheels.map((w) => w.position[1]))
  // Solid box inertia over the whole vehicle (ground to roof).
  const w = hx * 2
  const h = cy + hy
  const d = hz * 2
  const k = (config.mass / 12) * INERTIA_SCALE
  return {
    mass: config.mass,
    // Relative to the collider, which sits at the chassis centre.
    centerOfMass: { x: 0, y: axleY - cy, z: 0 },
    principalAngularInertia: { x: k * (h * h + d * d), y: k * (w * w + d * d), z: k * (w * w + h * h) },
    angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
  }
}

/**
 * The vehicle's own bake (not the shared cache, which only holds what the city shows): built for
 * this component and disposed when it unmounts.
 */
function useOwnBake(bricks: Brick[]): BakedModel {
  const baked = useMemo(() => bakeBricksUncached(bricks), [bricks])
  useEffect(() => () => disposeBaked(baked), [baked])
  return baked
}

/** A wheel brick moved to the origin; the mesh is shifted so the wheel spins around its centre. */
function WheelVisual({ brick }: { brick: Brick }) {
  const local = useMemo(() => [{ ...brick, x: 0, y: 0, z: 0 }], [brick])
  const baked = useOwnBake(local)
  const [x, y, z] = useMemo(() => brickCenter(local[0]), [local])
  const offset: [number, number, number] = [-x, -y, -z]
  return <BakedMeshes baked={baked} position={offset} />
}

interface Props {
  setup: DrivableSetup
  /** Start position of the body origin (the wheel bottoms, under the model centre). */
  spawn: [number, number, number]
  /** Start heading (radians around +Y, 0 = facing -Z); also used when the car falls out of the world. */
  spawnYaw?: number
  /** How far the front wheels turn (default: the city's `DRIVE` limits; the maze turns tighter). */
  steering?: SteerTuning
  /** Follows the (interpolated) chassis; read by the chase camera. */
  chassisRef: RefObject<THREE.Group | null>
}

/**
 * The drivable model: a dynamic body with one box collider for the chassis and Rapier's
 * ray-cast vehicle controller for the wheels. Forward is -Z; every wheel drives, the front
 * ones steer. Mass sits at axle height and the inertia is padded so kids rarely flip it.
 */
export default function Vehicle({ setup, spawn, spawnYaw = 0, steering: steerTuning = DRIVE, chassisRef }: Props) {
  const { config, wheelBricks, bodyBricks } = setup
  const { world } = useRapier()
  const body = useRef<RapierRigidBody>(null)
  const binding = useRef<ControllerBinding | null>(null)
  const steps = useRef(0)
  const steering = useRef(0)
  const forwardSpeed = useRef(0)
  /** Set by the layout cleanup: the physics step must never build a controller after that. */
  const unmounted = useRef(false)
  /** Spin angle of each wheel (radians, wrapped to one turn: Rapier's `wheelRotation` stays 0 in this version). */
  const spin = useRef<number[]>([])
  const flipSeen = useRef(useDriveInput.getState().flipSeq)
  const placeSeen = useRef(useDriveInput.getState().placeSeq)
  const steerGroups = useRef<Array<THREE.Group | null>>([])
  const spinGroups = useRef<Array<THREE.Group | null>>([])

  const bakedBody = useOwnBake(bodyBricks)
  const colliderMass = useMemo(() => chassisMass(config), [config])

  // The springs settle by `sag` under the car's weight; mounting the wheels that much lower than
  // their rest length makes them sit exactly where they were built once the car has settled.
  const mounts = useMemo<Mount[]>(() => {
    const sag = GRAVITY / (config.wheels.length * SUSPENSION_STIFFNESS)
    return config.wheels.map((w) => ({ x: w.position[0], y: w.position[1] + SUSPENSION_REST - sag, z: w.position[2] }))
  }, [config.wheels])

  // The controller is created lazily by the first physics step: @react-three/rapier only creates the
  // rigid body in a passive effect, after this component's own effects ran (production has no
  // StrictMode re-run to paper over that). Removal stays in a layout cleanup, which runs before
  // <Physics> frees the world (a passive cleanup) when the scene unmounts.
  useLayoutEffect(() => {
    unmounted.current = false // StrictMode re-runs the effect after its cleanup
    return () => {
      unmounted.current = true
      const b = binding.current
      binding.current = null
      if (b) removeController(world, b.controller)
    }
  }, [world])

  /** The controller for the current rigid body and wheels, built (or rebuilt) on demand. */
  const controllerFor = (w: World, rb: RapierRigidBody): VehicleController => {
    const b = binding.current
    if (b && b.body === rb && b.mounts === mounts) return b.controller
    if (b) removeController(w, b.controller)
    const controller = createController(w, rb, config, mounts)
    binding.current = { controller, body: rb, mounts }
    return controller
  }

  useBeforePhysicsStep((w) => {
    const rb = body.current
    if (!rb || unmounted.current) return
    const c = controllerFor(w, rb)
    const dt = w.timestep
    const drive = useDriveInput.getState()

    if (drive.flipSeq !== flipSeen.current) {
      flipSeen.current = drive.flipSeq
      flipUpright(rb, config.chassis)
    }
    if (drive.placeSeq !== placeSeen.current) {
      placeSeen.current = drive.placeSeq
      const p = drive.placeTarget
      if (p) placeBody(rb, { x: p.x, y: spawn[1], z: p.z }, p.yaw)
    }
    if (rb.translation().y < FALL_LIMIT) placeBody(rb, { x: spawn[0], y: spawn[1], z: spawn[2] }, spawnYaw)

    const input = drive.read()
    const v = rb.linvel()
    const fwd = forwardOf(rb)
    const speed = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z
    const force = input.brake ? 0 : engineForce(input.throttle, speed, config.mass) / config.wheels.length
    const brake = (input.brake ? BRAKE_PER_MASS : input.throttle === 0 ? COAST_BRAKE_PER_MASS : 0) * config.mass
    steering.current = approach(steering.current, steerAngle(input.steer, speed, steerTuning), STEER_RATE, dt)

    config.wheels.forEach((wheel, i) => {
      c.setWheelEngineForce(i, force)
      c.setWheelBrake(i, brake)
      c.setWheelSteering(i, wheel.steer ? steering.current : 0)
    })
    c.updateVehicle(dt)

    const after = rb.linvel()
    const [vx, vz] = clampHorizontalSpeed(after.x, after.z, DRIVE.MAX_SPEED)
    if (vx !== after.x || vz !== after.z) rb.setLinvel({ x: vx, y: after.y, z: vz }, true)
    forwardSpeed.current = speed
    if (steps.current++ % STATUS_EVERY === 0) {
      const t = rb.translation()
      useDriveStatus.getState().setPose(t.x, t.z, speed)
    }
    if (import.meta.env.DEV) publishTelemetry(rb, speed)
  })

  // Wheels: follow the suspension, steer, and roll.
  useFrame((_, dt) => {
    const c = binding.current?.controller
    if (!c) return
    mounts.forEach((mount, i) => {
      // Rolling towards -Z turns the top of the wheel forward: negative around +X. Wrapped each frame
      // (per wheel, as the radii differ) so the angle never grows large enough to lose float precision.
      spin.current[i] = ((spin.current[i] ?? 0) - (forwardSpeed.current * dt) / config.wheels[i].radius) % TWO_PI
      const steer = steerGroups.current[i]
      const spinGroup = spinGroups.current[i]
      if (!steer || !spinGroup) return
      steer.position.y = mount.y - (c.wheelSuspensionLength(i) ?? SUSPENSION_REST)
      steer.rotation.y = c.wheelSteering(i) ?? 0
      spinGroup.rotation.x = spin.current[i]
    })
  })

  // Model space -> body space: the origin is under the model centre, at the wheel bottoms.
  const [ox, oy, oz] = config.origin
  const rotation = useMemo<[number, number, number]>(() => [0, spawnYaw, 0], [spawnYaw])
  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={spawn}
      rotation={rotation}
      ccd
      canSleep={false}
      linearDamping={0.05}
      angularDamping={0.6}
    >
      <CuboidCollider
        args={config.chassis.halfExtents}
        position={config.chassis.center}
        massProperties={colliderMass}
        friction={CHASSIS_FRICTION}
      />
      <group ref={chassisRef}>
        <BakedMeshes baked={bakedBody} position={[-ox, -oy, -oz]} receiveShadow />
        {config.wheels.map((w, i) => (
          <group
            key={wheelBricks[i].id}
            ref={(g) => {
              steerGroups.current[i] = g
            }}
            position={w.position}
          >
            <group
              ref={(g) => {
                spinGroups.current[i] = g
              }}
            >
              <WheelVisual brick={wheelBricks[i]} />
            </group>
          </group>
        ))}
      </group>
    </RigidBody>
  )
}
