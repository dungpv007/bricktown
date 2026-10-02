import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import { analyzeDrive } from '../../core/drive'
import { MAZE_CELL, solve, type Cell, type Maze } from '../../core/maze'
import { MAZE_STEER, cellAtPoint, cellCenterXZ, spawnPose } from '../../core/mazeRun'
import { resolveSource } from '../../render/sources'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'
import { useDriveInput } from '../../state/useDriveInput'
import { useDriveStatus } from '../../state/useDriveStatus'
import { useGame } from '../../state/useGame'
import { useMazeRun, type MazeCamera } from '../../state/useMazeRun'
import DevStats from '../../ui/DevStats'
import DriveUI from '../drive/DriveUI'
import Sun from '../drive/Sun'
import Vehicle, { GRAVITY, type DrivableSetup } from '../drive/Vehicle'
import HintArrows from './HintArrows'
import MazeColliders from './MazeColliders'
import MazeDriveUI from './MazeDriveUI'
import MazeModel from './MazeModel'
import { MAZE_TILT } from './mazeView'

const SKY = '#87ceeb'
const FOV = 50
/** The car is dropped from this height above the floor at the start. */
const SPAWN_DROP = 0.4
/** Top-down view: this far from the car, tilted like the editor's view (north up)... */
const TOP_DISTANCE = 6.5 * MAZE_CELL
/** ...looking this far ahead of the car, so the screen shows more of where it is going. */
const TOP_LOOK_AHEAD = 1.5 * MAZE_CELL
/** Camera follow rate (1 / s): position and look-at point both glide, so switching views is smooth. */
const FOLLOW_RATE = 4
/** Heading smoothing for the chase view (1 / s). */
const HEADING_RATE = 3

const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpFwd = new THREE.Vector3()

/**
 * Follows the car either from above (tilted, north up, so the maze reads like a map) or from
 * behind it. Both the position and the point looked at glide towards the chosen view's, which
 * makes the switch a smooth flight.
 */
function MazeDriveCamera({ target, length, mode }: { target: RefObject<THREE.Group | null>; length: number; mode: MazeCamera }) {
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const heading = useRef(new THREE.Vector3(0, 0, -1))
  const look = useRef(new THREE.Vector3())
  const placed = useRef(false)
  const desired = useMemo(() => new THREE.Vector3(), [])
  const desiredLook = useMemo(() => new THREE.Vector3(), [])
  const chaseDistance = Math.max(16, length * 2.4)

  useFrame((_, dt) => {
    const car = target.current
    if (!car) return
    car.getWorldPosition(tmpPos)
    car.getWorldQuaternion(tmpQuat)
    tmpFwd.set(0, 0, -1).applyQuaternion(tmpQuat).setY(0)
    if (tmpFwd.lengthSq() > 0.01) heading.current.lerp(tmpFwd.normalize(), placed.current ? 1 - Math.exp(-HEADING_RATE * dt) : 1).normalize()

    const h = heading.current
    if (mode === 'top') {
      // A portrait phone sees little sideways: look less far ahead east / west (so the car stays on
      // screen) and back off a little (so a corridor's width still shows).
      const sideways = Math.min(1, aspect)
      const distance = TOP_DISTANCE * (aspect < 1 ? Math.sqrt(1 / aspect) : 1)
      desiredLook.set(tmpPos.x + h.x * TOP_LOOK_AHEAD * sideways, tmpPos.y, tmpPos.z + h.z * TOP_LOOK_AHEAD)
      desired.set(desiredLook.x, desiredLook.y + distance * Math.cos(MAZE_TILT), desiredLook.z + distance * Math.sin(MAZE_TILT))
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
  })
  return null
}

/**
 * Feeds the run with what the car does: the clock starts on the first gas or on leaving the entry
 * cell (`carAt`), the cell under the car (from the production-safe drive status) picks up coins and
 * finds the exit, and the clock pauses while the app is hidden.
 */
function RunTracker() {
  useEffect(() => {
    let last: Cell | null = null
    // Only pose updates count: the status also changes when a controller is added, while the pose
    // still holds where the last drive ended.
    return useDriveStatus.subscribe((s, prev) => {
      if (s.x === prev.x && s.z === prev.z) return
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
  useTestHandle(maze, pose.yaw)
  return (
    <>
      <Sun target={chassis} />
      <MazeDriveCamera target={chassis} length={length} mode={camera} />
      <MazeModel maze={shown} />
      <HintArrows />
      <RunTracker />
      {/* Physics steps before the camera reads the car (lower priority runs first); it stops at the finish. */}
      <Physics timeStep={1 / 60} gravity={[0, -GRAVITY, 0]} updatePriority={-50} paused={won}>
        <MazeColliders maze={maze} />
        <Vehicle setup={setup} spawn={spawn} spawnYaw={pose.yaw} steering={MAZE_STEER} chassisRef={chassis} />
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
 * Driving out of a maze: the maze with physics, the chosen vehicle, the drive controls and the
 * run's HUD (time, coins, hint, camera) and finish card. Lazy-loaded (pulls in Rapier's WASM).
 * The parent starts the run (`useMazeRun.begin`) before showing it.
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
  if (!setup?.ok) return null

  return (
    <>
      <Canvas shadows="percentage" dpr={[1, 1.5]} camera={{ fov: FOV, near: 0.5, far: 1500 }} data-testid="maze-drive-canvas">
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, 250, 700]} />
        <MazeDriveWorld key={runId} maze={maze} setup={setup} />
        <DevStats />
      </Canvas>
      <DriveUI source={source} onChangeVehicle={onChangeVehicle} quietEngine={won} />
      <MazeDriveUI onRetry={onRetry} onEdit={onEdit} onMenu={onMenu} />
    </>
  )
}
