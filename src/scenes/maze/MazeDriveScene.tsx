import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import * as sfx from '../../audio/sfx'
import { analyzeDrive } from '../../core/drive'
import { solve, type Cell, type Maze } from '../../core/maze'
import { MAZE_STEER, cellAtPoint, cellCenterXZ, spawnPose } from '../../core/mazeRun'
import { advanceStepper, placeStepper, pressStep, startStepper, stepperPose, type StepResult, type Stepper } from '../../core/mazeStep'
import BtCanvas from '../../render/BtCanvas'
import { resolveSource } from '../../render/sources'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'
import { useDriveInput } from '../../state/useDriveInput'
import { useDriveStatus } from '../../state/useDriveStatus'
import { useGame } from '../../state/useGame'
import { useMazeRun, type MazeCamera } from '../../state/useMazeRun'
import { useMazeStep } from '../../state/useMazeStep'
import DriveUI from '../drive/DriveUI'
import Sun from '../drive/Sun'
import Vehicle, { GRAVITY, type DrivableSetup, type KinematicDriver } from '../drive/Vehicle'
import { hudFreeRect, toNdc, type HudEdges } from '../workshop/safeArea'
import HintArrows from './HintArrows'
import MazeColliders from './MazeColliders'
import MazeDriveUI from './MazeDriveUI'
import MazeModel from './MazeModel'
import { MAZE_TILT, followDistance, frameMaze, topViewShowsWhole, type Vec3 } from './mazeView'

const SKY = '#87ceeb'
const FOV = 50
const CAMERA = { fov: FOV, near: 0.5, far: 3000 }
/** Fog from / to (studs from the camera) when close; pushed back in proportion when the view is far up. */
const FOG_NEAR = 250
const FOG_FAR = 700
/** The car is dropped from this height above the floor at the start. */
const SPAWN_DROP = 0.4
/** Camera follow rate (1 / s): position and look-at point both glide, so switching views is smooth. */
const FOLLOW_RATE = 4
/** Heading smoothing for the chase view (1 / s). */
const HEADING_RATE = 3
/** After the screen size or the view changes, the HUD is measured again for this long (s): its controls appear a little later. */
const HUD_SETTLE_S = 1

/**
 * The drive HUD over the top-down view, two ways to keep the maze clear of it: the button column,
 * the D-pad and the horn as side columns (best on a wide screen), or as rows above and below (best
 * on a tall one). The whole maze is framed for both and the larger picture wins.
 */
const TOP_VIEW_HUDS: readonly HudEdges[] = [
  {
    left: ['.bt-drive-step-left'],
    right: ['.bt-drive-change', '.bt-maze-hud-side', '.bt-maze-steppad'],
    top: ['.bt-maze-hud-top'],
    bottom: [],
  },
  {
    left: [],
    right: [],
    top: ['.bt-maze-hud-top', '.bt-drive-change', '.bt-maze-hud-side'],
    bottom: ['.bt-maze-steppad', '.bt-drive-step-left'],
  },
]

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpFwd = new THREE.Vector3()

/** The whole-maze framing and what it was made for (maze, screen, view, HUD-free rects). */
interface WholeFraming {
  /** Maze, screen size and view: the HUD is measured again for a moment whenever it changes. */
  sizeKey: string
  settleUntil: number
  /** `sizeKey` plus the HUD-free rects the framing below was made for ('' before the first). */
  key: string
  target: Vec3
  position: Vec3
}

/**
 * The whole-maze framing for the HUD on screen now (updates `f` in place): measured again for a
 * moment after each change of maze, screen size or view, then kept.
 */
function frameWhole(f: WholeFraming, maze: Maze, mode: MazeCamera, width: number, height: number, canvas: HTMLElement, now: number) {
  const sk = `${maze.w}x${maze.h}@${width}x${height}:${mode}`
  if (sk !== f.sizeKey) {
    f.sizeKey = sk
    f.settleUntil = now + HUD_SETTLE_S
  }
  if (f.key.startsWith(`${sk}|`) && now > f.settleUntil) return
  const frees = TOP_VIEW_HUDS.map((hud) => hudFreeRect(canvas, hud))
  const key = `${sk}|${frees.map((r) => `${r.left},${r.top},${r.right},${r.bottom}`).join('|')}`
  if (f.key === key) return
  const frames = frees.map((free) => frameMaze(maze.w, maze.h, width / height, FOV, toNdc(free, width, height)))
  const best = frames.reduce((a, b) => (b.distance < a.distance ? b : a))
  f.key = key
  f.target = best.target
  f.position = best.position
}

interface CameraProps {
  target: RefObject<THREE.Group | null>
  length: number
  mode: MazeCamera
  maze: Maze
}

/**
 * The top-down view (tilted, north up, so the maze reads like a map) shows the whole maze in the
 * part of the screen the HUD leaves free, or follows the car in a big maze, about ten cells across
 * (see `topViewShowsWhole`). The chase view flies behind the car. Both the position and the point
 * looked at glide towards the chosen view's, which makes every switch a smooth flight.
 */
function MazeDriveCamera({ target, length, mode, maze }: CameraProps) {
  const camera = useThree((s) => s.camera)
  const heading = useRef(new THREE.Vector3(0, 0, -1))
  const look = useRef(new THREE.Vector3())
  const placed = useRef(false)
  const desired = useMemo(() => new THREE.Vector3(), [])
  const desiredLook = useMemo(() => new THREE.Vector3(), [])
  const chaseDistance = Math.max(16, length * 2.4)
  const whole = topViewShowsWhole(maze.w, maze.h)
  const framing = useRef<WholeFraming>({ sizeKey: '', settleUntil: 0, key: '', target: [0, 0, 0], position: [0, 0, 0] })

  useFrame(({ size, gl, clock, scene }, dt) => {
    const car = target.current
    if (!car || size.width === 0 || size.height === 0) return
    car.getWorldPosition(tmpPos)
    car.getWorldQuaternion(tmpQuat)
    tmpFwd.set(0, 0, -1).applyQuaternion(tmpQuat).setY(0)
    if (tmpFwd.lengthSq() > 0.01) heading.current.lerp(tmpFwd.normalize(), placed.current ? 1 - Math.exp(-HEADING_RATE * dt) : 1).normalize()

    const h = heading.current
    if (mode === 'top' && whole) {
      const f = framing.current
      frameWhole(f, maze, mode, size.width, size.height, gl.domElement, clock.elapsedTime)
      desired.set(...f.position)
      desiredLook.set(...f.target)
    } else if (mode === 'top') {
      const distance = followDistance(size.width / size.height, FOV)
      desiredLook.set(tmpPos.x, 0, tmpPos.z)
      desired.set(desiredLook.x, distance * Math.cos(MAZE_TILT), desiredLook.z + distance * Math.sin(MAZE_TILT))
    } else {
      desired.set(tmpPos.x - h.x * chaseDistance, tmpPos.y + chaseDistance * 0.6, tmpPos.z - h.z * chaseDistance)
      desiredLook.set(tmpPos.x + h.x * chaseDistance * 0.5, tmpPos.y, tmpPos.z + h.z * chaseDistance * 0.5)
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
    // A whole big maze seen from far up stays clear: the fog keeps to beyond it.
    if (scene.fog instanceof THREE.Fog) {
      const d = camera.position.distanceTo(look.current)
      scene.fog.near = Math.max(FOG_NEAR, d * 1.5)
      scene.fog.far = Math.max(FOG_FAR, d * 3.5)
    }
  })
  return null
}

/**
 * Block-by-block moves while the top-down view is on: the car's kinematic driver (see `Vehicle`'s
 * `kinematic`; its rigid body turns kinematic meanwhile). Starting sets the car down in the middle
 * of its cell; presses and held directions from `useMazeStep` move it one cell at a time. The run
 * hears of every cell reached right here (coins, exit, clock), never from physics sensors or the
 * physics pose. Switching to the chase view lets the current move finish, then hands the car back
 * to physics, at rest in its cell and facing the same way.
 */
function useStepDriver(maze: Maze): KinematicDriver {
  const stepper = useRef<Stepper | null>(null)
  const placeSeen = useRef(0)

  useEffect(() => {
    const input = useMazeStep.getState()
    input.reset()
    return () => {
      input.reset()
      input.setActive(false)
    }
  }, [])

  return useCallback<KinematicDriver>(
    (dt, current) => {
      const run = useMazeRun.getState()
      const input = useMazeStep.getState()
      const drive = useDriveInput.getState()
      const now = performance.now()
      const apply = (r: StepResult | null): Stepper | null => {
        if (!r) return stepper.current
        stepper.current = r.stepper
        for (const e of r.events) {
          if (e.type === 'start') useMazeRun.getState().startIfReady(now)
          else if (e.type === 'arrive') useMazeRun.getState().carAt(e.cell, now, 'step')
          else sfx.thunk()
        }
        return r.stepper
      }
      const stepping = run.camera === 'top'

      let s = stepper.current
      if (!s) {
        if (!stepping) return null
        placeSeen.current = drive.placeSeq // placements before now were the physics' to make
        input.take() // nor do presses from before count
        s = apply(startStepper(maze, current.x, current.z, current.yaw))
        if (!s) return null
        input.setActive(true)
      }

      if (stepping) {
        if (drive.placeSeq !== placeSeen.current) {
          placeSeen.current = drive.placeSeq
          const p = drive.placeTarget
          if (p) {
            const cell = cellAtPoint(p.x, p.z)
            s = apply({ stepper: placeStepper(cell, p.yaw), events: [{ type: 'arrive', cell }] })!
          }
        }
        for (const dir of input.take()) s = apply(pressStep(s, maze, dir))!
        s = apply(advanceStepper(s, maze, dt, input.heldDir()))!
      } else {
        input.take()
        if (!s.motion) {
          stepper.current = null
          input.setActive(false)
          return null
        }
        s = apply(advanceStepper({ ...s, queued: null }, maze, dt, null))!
      }
      return stepperPose(s)
    },
    [maze],
  )
}

/**
 * Feeds the run with what the car does while it is driven with physics: the clock starts on the
 * first gas or on leaving the entry cell (`carAt`), the cell under the car (from the
 * production-safe drive status) picks up coins and finds the exit, and the clock pauses while the
 * app is hidden. Block steps report their cells themselves (see `useStepDriver`).
 */
function RunTracker() {
  useEffect(() => {
    let last: Cell | null = null
    // Only pose updates count: the status also changes when a controller is added, while the pose
    // still holds where the last drive ended.
    return useDriveStatus.subscribe((s, prev) => {
      if (s.x === prev.x && s.z === prev.z) return
      if (useMazeStep.getState().active) {
        last = null
        return
      }
      const cell = cellAtPoint(s.x, s.z)
      if (last && last.cx === cell.cx && last.cz === cell.cz) return
      last = cell
      useMazeRun.getState().carAt(cell, performance.now())
    })
  }, [])

  useEffect(() => {
    const onVisibility = () => useMazeRun.getState().setHidden(document.visibilityState === 'hidden', performance.now())
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useFrame(() => {
    const run = useMazeRun.getState()
    if (run.phase === 'ready' && useDriveInput.getState().read().throttle !== 0) run.startIfReady(performance.now())
  })
  return null
}

interface TestHandle {
  /** Sets the car down in a cell's centre (facing `yaw`, default: the way it starts). */
  teleport: (cx: number, cz: number, yaw?: number) => void
  /** The shortest way from the car's cell to the exit. */
  path: () => Cell[] | null
  /**
   * Block steps drive the car right now (`useStepDriver`). This follows the 📷 mode one physics step
   * late; a teleport requested in between is dropped, so specs wait for it to match the mode first.
   */
  stepping: () => boolean
}

/**
 * `window.__btMaze` for e2e specs: in development, and in production only when the test flag
 * `localStorage['bricktown-e2e'] = '1'` is set (the production build spec drives the real build).
 */
function useTestHandle(maze: Maze, yaw: number) {
  useEffect(() => {
    let enabled = import.meta.env.DEV
    try {
      enabled ||= localStorage.getItem('bricktown-e2e') === '1'
    } catch {
      /* storage blocked: no test handle */
    }
    if (!enabled) return
    const w = window as unknown as { __btMaze?: TestHandle }
    w.__btMaze = {
      teleport: (cx, cz, heading = yaw) => useDriveInput.getState().requestPlace({ ...cellCenterXZ({ cx, cz }), yaw: heading }),
      path: () => {
        const cell = useMazeRun.getState().carCell
        return cell ? solve(maze, cell) : null
      },
      stepping: () => useMazeStep.getState().active,
    }
    return () => {
      delete w.__btMaze
    }
  }, [maze, yaw])
}

function MazeDriveWorld({ maze, setup }: { maze: Maze; setup: DrivableSetup }) {
  const chassis = useRef<THREE.Group>(null)
  const camera = useMazeRun((s) => s.camera)
  const won = useMazeRun((s) => s.phase === 'won')
  const coinsLeft = useMazeRun((s) => s.coinsLeft)
  const shown = useMemo(() => ({ ...maze, coins: coinsLeft }), [maze, coinsLeft])
  const pose = useMemo(() => spawnPose(maze) ?? { x: 0, z: 0, yaw: 0 }, [maze])
  const spawn = useMemo<[number, number, number]>(() => [pose.x, SPAWN_DROP, pose.z], [pose])
  const length = setup.config.chassis.halfExtents[2] * 2
  const stepDriver = useStepDriver(maze)
  useTestHandle(maze, pose.yaw)
  return (
    <>
      <Sun target={chassis} />
      <MazeDriveCamera target={chassis} length={length} mode={camera} maze={maze} />
      <MazeModel maze={shown} />
      <HintArrows />
      <RunTracker />
      {/* Physics steps before the camera reads the car (lower priority runs first); it stops at the finish. */}
      <Physics timeStep={1 / 60} gravity={[0, -GRAVITY, 0]} updatePriority={-50} paused={won}>
        <MazeColliders maze={maze} />
        <Vehicle setup={setup} spawn={spawn} spawnYaw={pose.yaw} steering={MAZE_STEER} chassisRef={chassis} kinematic={stepDriver} />
      </Physics>
    </>
  )
}

interface Props {
  maze: Maze
  /** The vehicle (template or blueprint source). */
  source: string
  /** Changes on "drive again": a fresh world and car. */
  runId: number
  onChangeVehicle: () => void
  onRetry: () => void
  onEdit: () => void
  onMenu: () => void
}

/**
 * Driving out of a maze: the maze with physics, the chosen vehicle, the drive controls (block-step
 * D-pad in the top-down view, stick and pedals in the chase view) and the run's HUD (time, coins,
 * hint, camera) and finish card. Lazy-loaded (pulls in Rapier's WASM). The parent starts the run
 * (`useMazeRun.begin`) before showing it.
 */
export default function MazeDriveScene({ maze, source, runId, onChangeVehicle, onRetry, onEdit, onMenu }: Props) {
  useEvictStaleBakesOnUnmount()
  const blueprints = useGame((s) => s.data.blueprints)
  const resolved = useMemo(() => resolveSource(source, { blueprints }), [source, blueprints])
  const bricks = resolved?.bricks
  const setup = useMemo(() => (bricks ? analyzeDrive(bricks) : null), [bricks])

  // The vehicle was deleted or can no longer drive: back to the picker.
  const drivable = setup?.ok === true
  useEffect(() => {
    if (!drivable) onChangeVehicle()
  }, [drivable, onChangeVehicle])
  const won = useMazeRun((s) => s.phase === 'won')
  const stepMode = useMazeRun((s) => s.camera === 'top')
  if (!setup?.ok) return null

  return (
    <>
      <BtCanvas testId="maze-drive-canvas" animated camera={CAMERA}>
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, FOG_NEAR, FOG_FAR]} />
        <MazeDriveWorld key={runId} maze={maze} setup={setup} />
      </BtCanvas>
      <DriveUI source={source} onChangeVehicle={onChangeVehicle} quietEngine={won} stepMode={stepMode} />
      <MazeDriveUI onRetry={onRetry} onEdit={onEdit} onMenu={onMenu} />
    </>
  )
}
