import { useRef, useState, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pop, snap, thunk, whoosh } from '../../audio/sfx'
import { useFrameRequest } from '../../render/frameDriver'
import { CHUTE, clampClaw, nearestPrize, type PitPrize, type TryOutcome } from './logic'
import { MACHINE_D, MACHINE_W, PIT_FLOOR, ROOF_UNDERSIDE } from './machine'

/**
 * The claw: a smooth metal 3-prong claw on a cable, hanging from a carriage that rides a gantry
 * under the machine's roof (plain three.js meshes, not bricks). `ClawRig` moves it: aiming with the
 * controls, then the drop sequence a `TryOutcome` decides (down → close → up → carry to the chute →
 * open; or back home empty, or the one fun slip).
 */

/** World size of a prize in the pit (studs). */
export const PRIZE_SIZE = 1.8
/** The claw hub's height at rest. */
const REST_Y = ROOF_UNDERSIDE - 1.9
/** The prize hangs this far under the hub when held. */
const HOLD_GAP = 0.15
/** Prong angles (radians about each prong's hinge): open, holding a prize, shut on nothing. */
const OPEN = -0.62
const HOLD = -0.24
const SHUT = 0.22
/** Aiming speed (studs per second). */
const SPEED = 4.2

const METAL = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.85, roughness: 0.25 })
const DARK_METAL = new THREE.MeshStandardMaterial({ color: '#59606b', metalness: 0.7, roughness: 0.35 })
const ACCENT = new THREE.MeshStandardMaterial({ color: '#e3000b', metalness: 0.2, roughness: 0.4 })

/** One prong: a bent tube hanging from its hinge, curling inward at the tip. */
const PRONG = (() => {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.18),
    new THREE.Vector3(0, -0.45, 0.58),
    new THREE.Vector3(0, -0.95, 0.56),
    new THREE.Vector3(0, -1.3, 0.2),
  ])
  return new THREE.TubeGeometry(curve, 20, 0.075, 8, false)
})()
const TIP = new THREE.SphereGeometry(0.1, 10, 8)
const HUB = new THREE.CylinderGeometry(0.42, 0.32, 0.45, 20)
const CAP = new THREE.SphereGeometry(0.2, 14, 10)
const CABLE = new THREE.CylinderGeometry(0.05, 0.05, 1, 8)
const RAIL = new THREE.CylinderGeometry(0.12, 0.12, 1, 10)
const CARRIAGE = new THREE.BoxGeometry(1, 0.4, 1)
const TIP_AT = new THREE.Vector3(0, -1.3, 0.2)

/**
 * The aiming aids' looks. Drawn over everything (no depth test), so the marker still shows when it is
 * under a prize: where it sits among the prizes is what tells the kid how deep the claw is.
 */
const aid = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
const MARKER = new THREE.RingGeometry(0.32, 0.62, 32)
const MARKER_ON = aid('#ffe14d', 0.95)
const MARKER_OFF = aid('#c9ced6', 0.7)
const LASER_ON = aid('#ff5a4d', 0.55)
const LASER_OFF = aid('#c9ced6', 0.35)
const HALO = new THREE.RingGeometry(1.0, 1.25, 40)
const HALO_MATERIAL = aid('#ffe14d', 0.85)

/** Stage lengths (s); the carry home depends on the distance (see `travelTime`). */
const DUR = { down: 1.0, close: 0.35, up: 1.0, open: 0.3, fall: 0.45, idle: 1 } as const
const travelTime = (dist: number) => 0.45 + dist * 0.17

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** The claw's look, at the origin (the hub's middle); `open` holds the prong angle, read each frame. */
function ClawModel({ open }: { open: MutableRefObject<number> }) {
  const hinges = useRef<Array<THREE.Group | null>>([])
  useFrame(() => {
    for (const h of hinges.current) if (h) h.rotation.x = open.current
  })
  return (
    <group dispose={null}>
      <mesh geometry={HUB} material={DARK_METAL} />
      <mesh geometry={CAP} material={ACCENT} position={[0, 0.22, 0]} />
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
          <group ref={(g) => void (hinges.current[i] = g)} position={[0, -0.2, 0.18]}>
            <mesh geometry={PRONG} material={METAL} />
            <mesh geometry={TIP} material={METAL} position={TIP_AT} />
          </group>
        </group>
      ))}
    </group>
  )
}

/** A drop in progress. */
export interface DropSeq {
  /** Changes for each drop. */
  key: number
  outcome: TryOutcome
}

export interface ClawLive {
  /** The claw's position over the pit. */
  x: number
  z: number
  /** The aiming input (-1..1 each), from the pad or the arrow keys. */
  ix: number
  iz: number
}

/**
 * The live claw state, shared by the controls (which set the input) and the frame loop (which moves
 * the claw): plain module state, as only one claw game is ever open.
 */
export const clawLive: ClawLive = { x: CHUTE.x, z: CHUTE.z, ix: 0, iz: 0 }

/** Back to the start: the claw over the chute, no input. */
export function resetClawLive(): void {
  clawLive.x = CHUTE.x
  clawLive.z = CHUTE.z
  clawLive.ix = 0
  clawLive.iz = 0
}

type Stage = 'down' | 'close' | 'up' | 'carry' | 'open' | 'fall' | 'home' | 'idle'

interface Run {
  stage: Stage
  t: number
  outcome: TryOutcome
  /** Where the drop started. */
  x0: number
  z0: number
  /** Where the claw goes down (over the prize it grabs, or straight down on a miss). */
  tx: number
  tz: number
  /** How low the hub goes. */
  low: number
  /** The prize hanging from the claw, if any. */
  held: THREE.Group | null
  /** The slipped prize falling back: from where, for how long so far. */
  slip: { g: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number } | null
}

export interface ClawRigProps {
  /** True while the controls move the claw (aim phase with a direction held). */
  aiming: boolean
  seq: DropSeq | null
  /** The pit prizes' groups by id (to pick one up). */
  prizeGroups: MutableRefObject<Map<number, THREE.Group>>
  /** The prize went down the chute (the claw is home again). */
  onChute: (prize: PitPrize) => void
  /** A miss or a slip is over (the claw is home again). */
  onDone: () => void
  /** The prizes in the pit (for the aiming aids). */
  pile: readonly PitPrize[]
  /** Aiming now: show the floor marker, the laser and the prize a drop would grab. */
  showAim: boolean
}

/** The gantry, carriage, cable and claw, and their animation. */
export function ClawRig({ aiming, seq, prizeGroups, onChute, onDone, pile, showAim }: ClawRigProps) {
  const carriage = useRef<THREE.Group>(null)
  const bridge = useRef<THREE.Group>(null)
  const cable = useRef<THREE.Mesh>(null)
  const marker = useRef<THREE.Mesh>(null)
  const laser = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  const claw = useRef<THREE.Group>(null)
  const open = useRef(OPEN * 0.6)
  const hubY = useRef(REST_Y)
  const run = useRef<(Run & { key: number }) | null>(null)
  // The drop whose sequence has finished (the rig rests until the next one).
  const [finished, setFinished] = useState(-1)
  const running = seq !== null && finished !== seq.key
  useFrameRequest(aiming || running)

  const railZ = MACHINE_D / 2 - 1.1
  const railY = ROOF_UNDERSIDE - 0.25
  const railLen = MACHINE_W - 1.6

  const place = (g: THREE.Group, x: number, y: number, z: number) => g.position.set(x, y - HOLD_GAP - PRIZE_SIZE, z)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const L = clawLive
    if (seq && finished !== seq.key && run.current?.key !== seq.key) {
      const grab = seq.outcome.type === 'grab'
      const to = seq.outcome.type === 'grab' ? clampClaw(seq.outcome.prize.x, seq.outcome.prize.z) : { x: L.x, z: L.z }
      run.current = {
        key: seq.key,
        stage: 'down',
        t: 0,
        outcome: seq.outcome,
        x0: L.x,
        z0: L.z,
        tx: to.x,
        tz: to.z,
        low: grab ? PIT_FLOOR + PRIZE_SIZE + HOLD_GAP + 0.05 : PIT_FLOOR + 1.35,
        held: null,
        slip: null,
      }
      whoosh()
    }
    const r = run.current
    if (!r && aiming && (L.ix || L.iz)) {
      const next = clampClaw(L.x + L.ix * SPEED * dt, L.z + L.iz * SPEED * dt)
      L.x = next.x
      L.z = next.z
    }
    let wobble = 0
    if (r) {
      r.t += dt
      const grab = r.outcome.type === 'grab'
      const slips = r.outcome.type === 'grab' && r.outcome.slip
      const d = r.stage === 'carry' || r.stage === 'home' ? travelTime(Math.hypot(CHUTE.x - r.tx, CHUTE.z - r.tz)) : DUR[r.stage]
      const k = Math.min(1, r.t / d)
      const e = ease(k)
      switch (r.stage) {
        case 'down': {
          // On the way down the claw also homes in on the prize it will grab (a generous grab
          // never makes the prize jump to the claw).
          const s = clampClaw(lerp(r.x0, r.tx, e), lerp(r.z0, r.tz, e))
          L.x = s.x
          L.z = s.z
          hubY.current = lerp(REST_Y, r.low, e)
          open.current = lerp(OPEN * 0.6, OPEN, Math.min(1, k * 3))
          break
        }
        case 'close':
          open.current = lerp(OPEN, grab ? HOLD : SHUT, e)
          break
        case 'up':
          hubY.current = lerp(r.low, REST_Y, e)
          if (!grab) wobble = Math.sin(k * Math.PI * 5) * 0.16 * (1 - k)
          if (slips && r.held && k > 0.45) {
            // The fun slip: the prize wriggles free and drops back into the pit.
            const g = r.held
            const p = (r.outcome as { prize: PitPrize }).prize
            r.slip = { g, from: g.position.clone(), to: new THREE.Vector3(p.x, PIT_FLOOR, p.z), t: 0 }
            r.held = null
            open.current = lerp(HOLD, OPEN, 0.5)
            pop()
          }
          break
        case 'carry':
        case 'home': {
          const s = clampClaw(lerp(r.tx, CHUTE.x, e), lerp(r.tz, CHUTE.z, e))
          L.x = s.x
          L.z = s.z
          break
        }
        case 'open':
          open.current = lerp(HOLD, OPEN, e)
          break
        case 'fall':
          if (r.held) r.held.position.y = lerp(REST_Y - HOLD_GAP - PRIZE_SIZE, PIT_FLOOR - PRIZE_SIZE - 0.6, k * k)
          break
        case 'idle':
          break
      }
      if (k >= 1) {
        r.t = 0
        if (r.stage === 'down') {
          r.stage = 'close'
          snap()
        } else if (r.stage === 'close') {
          if (grab) {
            r.held = prizeGroups.current.get((r.outcome as { prize: PitPrize }).prize.id) ?? null
            thunk()
          }
          r.stage = 'up'
        } else if (r.stage === 'up') r.stage = grab && !slips ? 'carry' : 'home'
        else if (r.stage === 'carry') r.stage = 'open'
        else if (r.stage === 'open') r.stage = 'fall'
        else if (r.stage === 'fall' || r.stage === 'home') {
          const done = r
          if (!done.slip) {
            run.current = null
            setFinished(done.key)
            if (done.stage === 'fall' && done.outcome.type === 'grab') onChute(done.outcome.prize)
            else onDone()
          } else r.stage = 'idle'
        }
      }
      if (r.held && r.stage !== 'fall') place(r.held, L.x, hubY.current, L.z)
      if (r.slip) {
        const s = r.slip
        s.t += dt
        const f = Math.min(1, s.t / 0.5)
        s.g.position.set(lerp(s.from.x, s.to.x, f), lerp(s.from.y, s.to.y, f * f) + Math.sin(Math.min(1, Math.max(0, (f - 0.8) / 0.2)) * Math.PI) * 0.25, lerp(s.from.z, s.to.z, f))
        if (f >= 1) {
          s.g.position.copy(s.to)
          r.slip = null
          if (r.stage === 'idle') {
            run.current = null
            setFinished(r.key)
            onDone()
          }
        }
      }
    }
    // Draw the rig where the claw is.
    const x = L.x
    const z = L.z
    if (bridge.current) bridge.current.position.x = x
    if (carriage.current) carriage.current.position.set(x, railY - 0.15, z)
    if (claw.current) {
      claw.current.position.set(x, hubY.current, z)
      claw.current.rotation.z = wobble
    }
    if (cable.current) {
      const top = railY - 0.35
      const bottom = hubY.current + 0.3
      cable.current.position.set(x, (top + bottom) / 2, z)
      cable.current.scale.y = Math.max(0.01, top - bottom)
    }
    // The aiming aids: a ring on the pit floor right under the claw and a laser down to it (they
    // show how deep the claw is among the prizes), and a halo round the prize a drop would grab.
    const target = showAim ? nearestPrize(pile, x, z) : null
    if (marker.current) {
      marker.current.visible = showAim
      marker.current.position.set(x, PIT_FLOOR + 0.04, z)
      marker.current.material = target ? MARKER_ON : MARKER_OFF
    }
    if (laser.current) {
      laser.current.visible = showAim
      const top = hubY.current - 1.2
      laser.current.position.set(x, (top + PIT_FLOOR) / 2, z)
      laser.current.scale.y = Math.max(0.01, top - PIT_FLOOR)
      laser.current.material = target ? LASER_ON : LASER_OFF
    }
    if (halo.current) {
      halo.current.visible = target !== null
      if (target) halo.current.position.set(target.x, PIT_FLOOR + 0.06, target.z)
    }
  })

  return (
    <group dispose={null}>
      {/* Two rails along x under the roof, a bridge along z riding them, the carriage on the bridge. */}
      {[-railZ, railZ].map((z) => (
        <mesh key={z} geometry={RAIL} material={DARK_METAL} position={[0, railY, z]} rotation={[0, 0, Math.PI / 2]} scale={[1, railLen, 1]} />
      ))}
      <group ref={bridge}>
        <mesh geometry={RAIL} material={METAL} position={[0, railY - 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, railZ * 2, 1]} />
      </group>
      <group ref={carriage}>
        <mesh geometry={CARRIAGE} material={ACCENT} scale={[0.9, 1, 0.9]} />
      </group>
      <mesh ref={cable} geometry={CABLE} material={DARK_METAL} />
      <mesh ref={marker} geometry={MARKER} material={MARKER_OFF} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10} visible={false} />
      <mesh ref={laser} geometry={CABLE} material={LASER_OFF} renderOrder={10} visible={false} />
      <mesh ref={halo} geometry={HALO} material={HALO_MATERIAL} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9} visible={false} />
      <group ref={claw} scale={1.15}>
        <ClawModel open={open} />
      </group>
    </group>
  )
}

