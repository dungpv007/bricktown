import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import * as sfx from '../../audio/sfx'
import { getTemplate } from '../../content/templates'
import { analyzeDrive, placementWorldBox, type Box } from '../../core/drive'
import BtCanvas from '../../render/BtCanvas'
import { bakedModelBox } from '../../render/placementTransform'
import { resolveRenderable } from '../../render/sources'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'
import { useGame } from '../../state/useGame'
import { useGraphicsToggles } from '../../state/useGraphics'
import CityGround from '../../scenes/city/CityGround'
import Placements from '../../scenes/city/Placements'
import Rails from '../../scenes/city/Rails'
import Roads from '../../scenes/city/Roads'
import Terrain from '../../scenes/city/Terrain'
import CityColliders from '../../scenes/drive/CityColliders'
import Sun from '../../scenes/drive/Sun'
import Vehicle, { GRAVITY } from '../../scenes/drive/Vehicle'
import { Minifig, Tappable } from '../kit'
import { EmojiSprite } from './EmojiSprite'
import { useRescueLive } from './live'
import {
  ARRIVE_RADIUS,
  fireLeft,
  guidePoint,
  hasArrived,
  MISSION_VEHICLE,
  robberPose,
  robberSpot,
  sprayStep,
  yawTowards,
  type MissionPhase,
  type Point,
} from './mission'
import ParticleSprites from './ParticleSprites'
import { emitCount, ParticlePool, particleScale } from './particles'
import type { MissionPlan } from './plan'

/**
 * The mission in the city: the kid's town (or the built-in one) with Drive's physics and vehicle,
 * a big guide arrow over the truck, a glowing ring at the target, then the fire (flames, smoke, the
 * hose) or the robber, and the cheering crowd. The HTML controls live in RescueGame.
 */

const SKY = '#87ceeb'
const CAMERA = { fov: 55, near: 0.5, far: 1500 }
const SPAWN_DROP = 0.4
const FOLLOW_RATE = 3
const CELL = 8

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpFwd = new THREE.Vector3()

/** Where to look in the action view (the building's middle) and how big it is. */
interface Focus {
  x: number
  y: number
  z: number
  size: number
}

/**
 * Driving: Drive's chase view (behind and well above the truck). At the target: a view of the
 * building with the truck in front of it, gliding there.
 */
function RescueCamera({ chassis, length, mode, focus }: { chassis: RefObject<THREE.Group | null>; length: number; mode: 'chase' | 'focus'; focus: Focus }) {
  const camera = useThree((s) => s.camera)
  const heading = useRef(new THREE.Vector3(0, 0, -1))
  const look = useRef(new THREE.Vector3())
  const placed = useRef(false)
  const desired = useMemo(() => new THREE.Vector3(), [])
  const desiredLook = useMemo(() => new THREE.Vector3(), [])
  const distance = Math.max(34, length * 4.2)

  useFrame((_, dt) => {
    const car = chassis.current
    if (!car) return
    car.getWorldPosition(tmpPos)
    car.getWorldQuaternion(tmpQuat)
    tmpFwd.set(0, 0, -1).applyQuaternion(tmpQuat).setY(0)
    if (tmpFwd.lengthSq() > 0.01) heading.current.lerp(tmpFwd.normalize(), placed.current ? 1 - Math.exp(-3 * dt) : 1).normalize()
    if (mode === 'chase') {
      const h = heading.current
      desired.set(tmpPos.x - h.x * distance, tmpPos.y + distance * 0.9, tmpPos.z - h.z * distance)
      desiredLook.set(tmpPos.x + h.x * distance * 0.3, tmpPos.y, tmpPos.z + h.z * distance * 0.3)
    } else {
      // From the truck's side of the building, back and up: the truck in front, the fire behind.
      let dx = tmpPos.x - focus.x
      let dz = tmpPos.z - focus.z
      const len = Math.hypot(dx, dz)
      if (len < 0.01) {
        dx = 0
        dz = 1
      } else {
        dx /= len
        dz /= len
      }
      const d = Math.max(30, focus.size * 1.9)
      desiredLook.set((focus.x * 2 + tmpPos.x) / 3, focus.y * 0.7, (focus.z * 2 + tmpPos.z) / 3)
      desired.set(desiredLook.x + dx * d * 0.85, desiredLook.y + d * 0.7, desiredLook.z + dz * d * 0.85)
    }
    if (placed.current) {
      const k = 1 - Math.exp(-FOLLOW_RATE * dt)
      camera.position.lerp(desired, k)
      look.current.lerp(desiredLook, k)
    } else {
      camera.position.copy(desired)
      look.current.copy(desiredLook)
    }
    placed.current = true
    camera.lookAt(look.current)
  })
  return null
}

/** A big flat arrow, pointing -Z, extruded upward (made once). */
function arrowGeometry(scale: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, 4 * scale)
  s.lineTo(2.8 * scale, 0.6 * scale)
  s.lineTo(1.1 * scale, 0.6 * scale)
  s.lineTo(1.1 * scale, -3.4 * scale)
  s.lineTo(-1.1 * scale, -3.4 * scale)
  s.lineTo(-1.1 * scale, 0.6 * scale)
  s.lineTo(-2.8 * scale, 0.6 * scale)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

/**
 * The guide: a big yellow arrow floating over the truck, turning to show the way along the roads
 * (recomputed only when the truck enters another cell), shown through buildings.
 */
function GuideArrow({ chassis, plan }: { chassis: RefObject<THREE.Group | null>; plan: MissionPlan }) {
  const group = useRef<THREE.Group>(null)
  const geometry = useMemo(() => arrowGeometry(1.5), [])
  const outline = useMemo(() => arrowGeometry(1.75), [])
  useEffect(
    () => () => {
      geometry.dispose()
      outline.dispose()
    },
    [geometry, outline],
  )
  const cell = useRef({ cx: NaN, cz: NaN })
  const aim = useRef<Point>({ x: plan.target.ring.x, z: plan.target.ring.z })
  const yaw = useRef(plan.spawn.yaw)
  const time = useRef(0)

  useFrame((_, dt) => {
    const g = group.current
    const car = chassis.current
    if (!g || !car) return
    car.getWorldPosition(tmpPos)
    const cx = Math.floor(tmpPos.x / CELL)
    const cz = Math.floor(tmpPos.z / CELL)
    const near = Math.hypot(plan.target.ring.x - tmpPos.x, plan.target.ring.z - tmpPos.z) < CELL * 2
    if (cx !== cell.current.cx || cz !== cell.current.cz || near) {
      cell.current.cx = cx
      cell.current.cz = cz
      guidePoint(plan.field, plan.target.ring, tmpPos.x, tmpPos.z, aim.current)
    }
    const want = yawTowards(aim.current.x - tmpPos.x, aim.current.z - tmpPos.z)
    // Turn the short way round, smoothly.
    let d = want - yaw.current
    d = Math.atan2(Math.sin(d), Math.cos(d))
    yaw.current += d * (1 - Math.exp(-8 * Math.min(dt, 0.1)))
    time.current += dt
    g.position.set(tmpPos.x, tmpPos.y + 9 + Math.sin(time.current * 4) * 0.6, tmpPos.z)
    g.rotation.y = yaw.current
  })

  return (
    <group ref={group}>
      <mesh geometry={outline} position={[0, -0.2, 0]} renderOrder={10}>
        <meshBasicMaterial color="#1B2A34" depthTest={false} transparent />
      </mesh>
      <mesh geometry={geometry} renderOrder={11}>
        <meshBasicMaterial color="#FFD500" depthTest={false} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

/** The glowing ring where the truck stops, a light beam seen from afar and the call's picture above. */
function Beacon({ plan, top, emoji, show }: { plan: MissionPlan; top: number; emoji: string; show: boolean }) {
  const ring = useRef<THREE.Mesh>(null)
  const marker = useRef<THREE.Sprite>(null)
  const time = useRef(0)
  const { x, z } = plan.target.ring
  useFrame((_, dt) => {
    time.current += dt
    const t = time.current
    if (ring.current) {
      const s = 1 + Math.sin(t * 3) * 0.08
      ring.current.scale.set(s, s, 1)
    }
    if (marker.current) marker.current.position.y = top + 7 + Math.sin(t * 2.5) * 1.2
  })
  return (
    <group visible={show}>
      <mesh ref={ring} position={[x, 0.25, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={[ARRIVE_RADIUS * 0.62, ARRIVE_RADIUS * 0.85, 48]} />
        <meshBasicMaterial color="#FFE14D" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[x, 30, z]} renderOrder={3}>
        <cylinderGeometry args={[2.2, 3.2, 60, 20, 1, true]} />
        <meshBasicMaterial color="#FFF3A0" transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <EmojiSprite ref={marker} emoji={emoji} size={9} position={[plan.target.x, top + 7, plan.target.z]} />
    </group>
  )
}

/** Random in [a, b). */
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Big 🔥 pictures on the roof and the walls (kids know them at a glance), shrinking as the water works. */
function FlameEmojis({ box, progress }: { box: Box; progress: RefObject<number> }) {
  const sprites = useRef<Array<THREE.Sprite | null>>([])
  const time = useRef(0)
  const spots = useMemo(() => {
    const [minX, minY, minZ] = box.min
    const [maxX, maxY, maxZ] = box.max
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const h = maxY - minY
    const size = Math.max(5, Math.min(12, Math.max(maxX - minX, maxZ - minZ) * 0.45))
    return [
      { x: cx, y: maxY + size * 0.35, z: cz, size: size * 1.25 },
      { x: minX + (maxX - minX) * 0.2, y: maxY + size * 0.2, z: minZ + (maxZ - minZ) * 0.25, size },
      { x: minX + (maxX - minX) * 0.8, y: maxY + size * 0.2, z: minZ + (maxZ - minZ) * 0.75, size },
      { x: minX + (maxX - minX) * 0.75, y: minY + h * 0.6, z: maxZ + 0.5, size: size * 0.8 },
      { x: minX + (maxX - minX) * 0.25, y: minY + h * 0.6, z: minZ - 0.5, size: size * 0.8 },
    ]
  }, [box])
  useFrame((_, dt) => {
    time.current += Math.min(dt, 0.1)
    const left = fireLeft(progress.current ?? 0)
    for (let i = 0; i < spots.length; i++) {
      const sp = sprites.current[i]
      if (!sp) continue
      const flicker = 1 + Math.sin(time.current * (9 + i * 1.7) + i) * 0.08
      const s = spots[i].size * left * flicker
      sp.visible = s > 0.05
      sp.scale.set(s, s * (1 + Math.sin(time.current * 7 + i) * 0.06), s)
      sp.position.y = spots[i].y - spots[i].size * (1 - left) * 0.4
    }
  })
  return (
    <>
      {spots.map((sp, i) => (
        <EmojiSprite
          key={i}
          ref={(s) => {
            sprites.current[i] = s
          }}
          emoji="🔥"
          size={sp.size}
          position={[sp.x, sp.y, sp.z]}
          through={false}
        />
      ))}
    </>
  )
}

/** The burning building: flames and smoke, the hose's water, then steam. Reports when the fire is out. */
function FireScene({ box, phase, chassis, battery, onOut }: { box: Box; phase: MissionPhase; chassis: RefObject<THREE.Group | null>; battery: boolean; onOut: () => void }) {
  const scale = particleScale(battery)
  const flames = useMemo(() => new ParticlePool(Math.round(110 * scale)), [scale])
  const smoke = useMemo(() => new ParticlePool(Math.round(50 * scale)), [scale])
  const water = useMemo(() => new ParticlePool(Math.round(140 * scale)), [scale])
  const steam = useMemo(() => new ParticlePool(Math.round(30 * scale)), [scale])
  const light = useRef<THREE.PointLight>(null)
  const progress = useRef(useRescueLive.getState().progress)
  const shownStep = useRef(-1)
  const reported = useRef(false)
  const steamLeft = useRef(2.5)
  const carry = useRef({ flame: { v: 0 }, smoke: { v: 0 }, water: { v: 0 } })
  const spraySound = useRef(0)
  const outRef = useRef(onOut)
  useEffect(() => {
    outRef.current = onOut
  }, [onOut])

  const [minX, minY, minZ] = box.min
  const [maxX, maxY, maxZ] = box.max
  const h = Math.max(4, maxY - minY)
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const live = useRescueLive.getState()
    const spraying = phase === 'action' && live.holding && progress.current < 1
    // Raw frame time (sprayStep caps it): a slow device sprays as fast as a quick one.
    if (phase === 'action') progress.current = sprayStep(progress.current, delta, live.holding)
    const left = fireLeft(progress.current)
    const step = Math.floor(progress.current * 20)
    if (step !== shownStep.current) {
      shownStep.current = step
      live.setProgress(progress.current)
    }
    if (progress.current >= 1 && !reported.current) {
      reported.current = true
      outRef.current()
    }

    // Flames: on the walls' upper part and the roof, shrinking with the fire.
    if (left > 0) {
      const n = emitCount(70 * scale * (0.3 + 0.7 * left), dt, carry.current.flame)
      for (let i = 0; i < n; i++) {
        let x: number
        let z: number
        const side = Math.random()
        if (side < 0.5) {
          x = rand(minX, maxX)
          z = side < 0.25 ? minZ - 0.3 : maxZ + 0.3
        } else {
          z = rand(minZ, maxZ)
          x = side < 0.75 ? minX - 0.3 : maxX + 0.3
        }
        const y = Math.random() < 0.35 ? maxY : minY + h * rand(0.45, 1)
        flames.emit(x, y, z, rand(-0.6, 0.6), rand(4, 7.5), rand(-0.6, 0.6), rand(0.45, 0.85), (2.4 + Math.random() * 2.2) * (0.35 + 0.65 * left), -1.6)
      }
    }
    flames.step(dt, -2, 0.5)

    // Smoke while it burns, then white steam for a moment.
    if (left <= 0) steamLeft.current = Math.max(0, steamLeft.current - dt)
    const smokeRate = left > 0 ? 7 * scale * (0.4 + 0.6 * left) : steamLeft.current > 0 ? 10 * scale : 0
    const ns = emitCount(smokeRate, dt, carry.current.smoke)
    const puffs = left > 0 ? smoke : steam
    for (let i = 0; i < ns; i++) puffs.emit(cx + rand(-2.5, 2.5), maxY + 1, cz + rand(-2.5, 2.5), rand(-0.8, 0.8) + 0.6, rand(4, 6), rand(-0.8, 0.8), rand(2.4, 3.4), 3, 3.2)
    smoke.step(dt, 0, 0.2)
    steam.step(dt, 0, 0.2)

    // The hose: an arc of water from the truck to the nearest wall.
    const car = chassis.current
    if (spraying && car) {
      car.getWorldPosition(tmpPos)
      const nx = tmpPos.x
      const ny = tmpPos.y + 4
      const nz = tmpPos.z
      const ax = Math.min(maxX, Math.max(minX, nx))
      const az = Math.min(maxZ, Math.max(minZ, nz))
      const ay = minY + h * 0.65
      const dist = Math.hypot(ax - nx, az - nz)
      const T = Math.min(1.2, Math.max(0.45, dist / 22))
      const n = emitCount(85 * scale, dt, carry.current.water)
      for (let i = 0; i < n; i++) {
        const j = rand(0.92, 1.08)
        water.emit(nx, ny, nz, ((ax - nx) / T) * j + rand(-0.8, 0.8), ((ay - ny) / T + 0.5 * GRAVITY * T) * rand(0.95, 1.05), ((az - nz) / T) * j + rand(-0.8, 0.8), T * 1.05, 1.3, 1.8)
      }
      spraySound.current -= dt
      if (spraySound.current <= 0) {
        spraySound.current = 0.7
        sfx.whoosh()
      }
    }
    water.step(dt, GRAVITY, 0)

    if (light.current) light.current.intensity = left > 0 ? (40 + Math.random() * 18) * left : 0
  })

  return (
    <group>
      <FlameEmojis box={box} progress={progress} />
      <pointLight ref={light} position={[cx, maxY + 2, cz]} color="#ff8a2a" distance={h * 4 + 20} decay={1.2} intensity={0} />
      <ParticleSprites pool={smoke} from="#55585c" to="#d8dde2" opacity={0.75} />
      <ParticleSprites pool={steam} from="#ffffff" to="#eef6fb" opacity={0.7} />
      <ParticleSprites pool={flames} from="#ffe066" to="#ff3d00" opacity={0.9} />
      <ParticleSprites pool={water} from="#ffffff" to="#3aa0ff" opacity={0.95} />
    </group>
  )
}

/** The robber running round outside the shop; a tap (once the car is there) catches him. */
function PoliceScene({ plan, phase, caught, onCatch, battery }: { plan: MissionPlan; phase: MissionPhase; caught: boolean; onCatch: () => void; battery: boolean }) {
  const robber = useRef<THREE.Group>(null)
  const cuffs = useRef<THREE.Sprite>(null)
  const officer = useRef<THREE.Group>(null)
  const pose = useRef({ x: 0, z: 0, heading: 0, running: true })
  const time = useRef(0)
  const caughtAt = useRef<number | null>(null)
  const sparkles = useMemo(() => new ParticlePool(Math.round(60 * particleScale(battery))), [battery])
  const twinkle = useRef({ v: 0 })
  const { target } = plan
  const spot = useMemo(() => robberSpot(target), [target])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    time.current += dt * (phase === 'action' ? 1 : 0.6)
    const g = robber.current
    if (!g) return
    if (!caught) {
      const p = robberPose(time.current, spot, pose.current)
      g.position.set(p.x, p.running ? Math.abs(Math.sin(time.current * 12)) * 0.5 : 0, p.z)
      g.rotation.y = p.heading
    } else {
      if (caughtAt.current === null) {
        caughtAt.current = time.current
        // Handcuff sparkle: a golden burst.
        for (let i = 0; i < sparkles.capacity * 0.7; i++) {
          const a = Math.random() * Math.PI * 2
          const v = rand(3, 7)
          sparkles.emit(g.position.x, 3, g.position.z, Math.cos(a) * v, rand(3, 8), Math.sin(a) * v, rand(0.6, 1.2), rand(0.6, 1.2), -0.4)
        }
        sfx.success()
      }
      g.position.y = 0
      const n = emitCount(10, dt, twinkle.current)
      for (let i = 0; i < n; i++) sparkles.emit(g.position.x + rand(-1.5, 1.5), rand(2, 5), g.position.z + rand(-1.5, 1.5), 0, 1.5, 0, 0.7, 0.8, -0.6)
      if (cuffs.current) cuffs.current.position.set(g.position.x, 9.6 + Math.sin(time.current * 4) * 0.3, g.position.z)
      if (officer.current) {
        const k = Math.min(1, (time.current - caughtAt.current) * 3)
        officer.current.position.set(g.position.x + 3.6, 0, g.position.z)
        officer.current.scale.setScalar(k)
        officer.current.rotation.y = g.rotation.y
      }
    }
    sparkles.step(dt, 6, 0.6)
  })

  return (
    <group>
      <group ref={robber}>
        <Tappable onTap={onCatch} hitSize={[9, 10, 9]} disabled={phase !== 'action' || caught}>
          <Minifig fig="robber" scale={1.5} />
        </Tappable>
        {phase === 'action' && !caught && <PointDown />}
      </group>
      {caught && (
        <>
          <EmojiSprite ref={cuffs} emoji="⛓️" size={3.4} through={false} />
          <group ref={officer} scale={0}>
            <Minifig fig="police" scale={1.5} />
          </group>
        </>
      )}
      <ParticleSprites pool={sparkles} from="#fffbe0" to="#ffc400" additive />
    </group>
  )
}

/** A bouncing 👇 over the robber: tap him! */
function PointDown() {
  const sprite = useRef<THREE.Sprite>(null)
  const time = useRef(0)
  useFrame((_, dt) => {
    time.current += Math.min(dt, 0.1)
    if (sprite.current) sprite.current.position.y = 8.6 + Math.abs(Math.sin(time.current * 5)) * 1.4
  })
  return <EmojiSprite ref={sprite} emoji="👇" size={4} position={[0, 8.6, 0]} />
}

const CROWD = ['customer', 'customer2', 'kid', 'chef', 'doctor', 'construction', 'waiter']

/** The cheering crowd round the stopping ring, hopping, facing the building. */
function Crowd({ plan }: { plan: MissionPlan }) {
  const groups = useRef<Array<THREE.Group | null>>([])
  const time = useRef(0)
  const { target } = plan
  const spots = useMemo(() => {
    // A row between the building and the road, facing the road (and the camera behind the truck).
    let dx = target.ring.x - target.x
    let dz = target.ring.z - target.z
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    const edge = Math.min(len, Math.abs(dx) * target.halfW + Math.abs(dz) * target.halfD + 2.5)
    const cx = target.x + dx * edge
    const cz = target.z + dz * edge
    const face = Math.atan2(dx, dz)
    return CROWD.map((_, i) => {
      const along = (i - (CROWD.length - 1) / 2) * 4.2
      const back = (i % 2) * 1.6
      return { x: cx - dz * along - dx * back, z: cz + dx * along - dz * back, face }
    })
  }, [target])
  useFrame((_, dt) => {
    time.current += Math.min(dt, 0.05)
    groups.current.forEach((g, i) => {
      if (g) g.position.y = Math.abs(Math.sin(time.current * 7 + i * 0.9)) * 1.4
    })
  })
  return (
    <group>
      {spots.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.face, 0]}>
          <group
            ref={(g) => {
              groups.current[i] = g
            }}
          >
            <Minifig fig={CROWD[i]} />
          </group>
        </group>
      ))}
    </group>
  )
}

/** Calls `onArrive` once when the truck reaches the target (while driving). */
function ArrivalWatch({ chassis, plan, active, onArrive }: { chassis: RefObject<THREE.Group | null>; plan: MissionPlan; active: boolean; onArrive: () => void }) {
  const done = useRef(false)
  useEffect(() => {
    done.current = false
  }, [active])
  useFrame(() => {
    const car = chassis.current
    if (!active || done.current || !car) return
    car.getWorldPosition(tmpPos)
    if (hasArrived(plan.target, tmpPos.x, tmpPos.z)) {
      done.current = true
      onArrive()
    }
  })
  return null
}

export interface RescueDriveProps {
  plan: MissionPlan
  phase: MissionPhase
  caught: boolean
  onArrive: () => void
  onDone: () => void
}

/** The target building's world box (from its baked model), or a guess from its footprint. */
function useTargetBox(plan: MissionPlan): Box {
  const blueprints = useGame((s) => s.data.blueprints)
  return useMemo(() => {
    const p = plan.city.placements.find((q) => q.id === plan.target.placementId)
    const r = p ? resolveRenderable(p.source, { blueprints }) : null
    const model = r ? bakedModelBox(r.baked) : null
    if (p && r && model) return placementWorldBox(p, r.baseplate, model)
    const { x, z, halfW, halfD } = plan.target
    return { min: [x - halfW * 0.8, 0, z - halfD * 0.8], max: [x + halfW * 0.8, 8, z + halfD * 0.8] }
  }, [plan, blueprints])
}

function RescueWorld({ plan, phase, caught, onArrive, onDone }: RescueDriveProps) {
  const blueprints = useGame((s) => s.data.blueprints)
  const toggles = useGraphicsToggles()
  const battery = toggles.resolution === 'low' && toggles.shadows === 'off'
  const chassis = useRef<THREE.Group>(null)
  const setup = useMemo(() => {
    const tpl = getTemplate(MISSION_VEHICLE[plan.kind])
    const a = tpl ? analyzeDrive(tpl.bricks) : null
    return a?.ok ? a : null
  }, [plan.kind])
  const spawn = useMemo<[number, number, number]>(() => [plan.spawn.x, SPAWN_DROP, plan.spawn.z], [plan])
  const box = useTargetBox(plan)
  const focus = useMemo<Focus>(() => {
    if (plan.kind === 'police') {
      // The robber, close up (the shop behind him).
      const spot = robberSpot(plan.target)
      return { x: spot.x, y: 6, z: spot.z, size: 12 }
    }
    return { x: (box.min[0] + box.max[0]) / 2, y: box.max[1], z: (box.min[2] + box.max[2]) / 2, size: Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2], box.max[1]) }
  }, [box, plan])
  const { city } = plan
  if (!setup) return null
  const length = setup.config.chassis.halfExtents[2] * 2
  return (
    <>
      <Sun target={chassis} />
      <RescueCamera chassis={chassis} length={length} mode={phase === 'drive' ? 'chase' : 'focus'} focus={focus} />
      <CityGround size={city.size} />
      <Terrain terrain={city.terrain} />
      <Roads roads={city.roads} />
      {city.rails && <Rails rails={city.rails} roads={city.roads} />}
      <Placements placements={city.placements} blueprints={blueprints} />
      <Physics timeStep={1 / 60} gravity={[0, -GRAVITY, 0]} updatePriority={-50}>
        <CityColliders city={city} blueprints={blueprints} />
        <Vehicle setup={setup} spawn={spawn} spawnYaw={plan.spawn.yaw} chassisRef={chassis} />
      </Physics>
      {phase === 'drive' && <GuideArrow chassis={chassis} plan={plan} />}
      <Beacon plan={plan} top={box.max[1]} emoji={plan.kind === 'fire' ? '🔥' : '🦹'} show={phase === 'drive'} />
      <ArrivalWatch chassis={chassis} plan={plan} active={phase === 'drive'} onArrive={onArrive} />
      {plan.kind === 'fire' ? (
        <FireScene box={box} phase={phase} chassis={chassis} battery={battery} onOut={onDone} />
      ) : (
        <PoliceScene plan={plan} phase={phase} caught={caught} onCatch={onDone} battery={battery} />
      )}
      {phase === 'cheer' && <Crowd plan={plan} />}
    </>
  )
}

/** The city canvas of a mission (the drive, the action and the cheer). */
export default function RescueDrive(props: RescueDriveProps) {
  useEvictStaleBakesOnUnmount()
  return (
    <BtCanvas testId="rescue-canvas" animated camera={CAMERA}>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 250, 700]} />
      <RescueWorld {...props} />
    </BtCanvas>
  )
}
