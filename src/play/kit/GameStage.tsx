import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import BtCanvas from '../../render/BtCanvas'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'

/**
 * The fixed-camera scene shell every role-play game draws in: a BtCanvas (graphics settings, render
 * on demand, frame cap only while something animates, DPR caps, paused when hidden or covered by a
 * dialog), soft lights, and a shop backdrop (floor, back wall and a counter across the middle).
 *
 * World units are studs (1 plate = 0.4). The stage layout (see `STAGE`): the counter runs along X
 * with its front edge (the kid's side, toward the camera) at z = STAGE.counterFront and its top at
 * y = STAGE.counterTop; customers stand behind it around z = STAGE.customerZ, facing the camera.
 */
export const STAGE = {
  /** Height of the counter top (studs): a customer shows from the waist up behind it. */
  counterTop: 2.4,
  /** Counter depth spans z = counterBack..counterFront. */
  counterBack: -2,
  counterFront: 3,
  /** Counter length along X: -counterHalf..counterHalf. */
  counterHalf: 14,
  /** Where customers stand (z), behind the counter. */
  customerZ: -4.5,
  /** The back wall (z). */
  wallZ: -12,
} as const

type Vec3 = [number, number, number]

export interface StageCamera {
  /** Camera position (studs). */
  position: Vec3
  /** The point it looks at. */
  target: Vec3
  /** Vertical field of view (degrees). */
  fov?: number
  /**
   * World width (studs) at the target that must stay visible: on narrow (portrait) screens the
   * camera backs off along its view line until it fits.
   */
  fitWidth?: number
}

export const DEFAULT_CAMERA: StageCamera = { position: [0, 19, 19], target: [0, 2.5, -2.5], fov: 40, fitWidth: 22 }

/** The camera, backed off on narrow screens so `fitWidth` studs stay in view. */
function FixedCamera({ camera }: { camera: StageCamera }) {
  const size = useThree((s) => s.size)
  const fov = camera.fov ?? 40
  const position = useMemo<Vec3>(() => {
    const target = new THREE.Vector3(...camera.target)
    const from = new THREE.Vector3(...camera.position)
    const dir = from.clone().sub(target)
    const base = dir.length()
    const aspect = size.width / Math.max(1, size.height)
    const fit = camera.fitWidth ? camera.fitWidth / 2 / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect) : 0
    return target.add(dir.setLength(Math.max(base, fit))).toArray() as Vec3
  }, [camera, fov, size.width, size.height])
  const ref = useRef<THREE.PerspectiveCamera>(null)
  const [tx, ty, tz] = camera.target
  useLayoutEffect(() => {
    ref.current?.lookAt(tx, ty, tz)
  }, [tx, ty, tz, position])
  return <PerspectiveCamera ref={ref} makeDefault position={position} fov={fov} near={0.5} far={400} />
}

export interface BackdropColors {
  floor?: string
  wall?: string
  counter?: string
  counterTop?: string
}

/** Floor, back wall and the counter, from plain LEGO-coloured boxes (with studs on the counter top edge). */
export function CounterBackdrop({ colors = {}, counter = true }: { colors?: BackdropColors; counter?: boolean }) {
  const { counterTop, counterBack, counterFront, counterHalf, wallZ } = STAGE
  const depth = counterFront - counterBack
  const studs = useMemo(() => {
    const out: Vec3[] = []
    for (let x = -counterHalf + 0.5; x < counterHalf; x += 2) out.push([x, counterTop + 0.1, counterFront - 0.5])
    return out
  }, [counterHalf, counterTop, counterFront])
  return (
    <group>
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[80, 0.1, 60]} />
        <meshStandardMaterial color={colors.floor ?? '#E4CD9E'} />
      </mesh>
      <mesh position={[0, 10, wallZ]}>
        <boxGeometry args={[80, 20, 0.5]} />
        <meshStandardMaterial color={colors.wall ?? '#A0BCAC'} />
      </mesh>
      {counter && (
        <>
          <mesh position={[0, (counterTop - 0.4) / 2, (counterBack + counterFront) / 2]}>
            <boxGeometry args={[counterHalf * 2, counterTop - 0.4, depth]} />
            <meshStandardMaterial color={colors.counter ?? '#583927'} />
          </mesh>
          <mesh position={[0, counterTop - 0.2, (counterBack + counterFront) / 2]}>
            <boxGeometry args={[counterHalf * 2 + 0.4, 0.4, depth + 0.4]} />
            <meshStandardMaterial color={colors.counterTop ?? '#F4F4F4'} />
          </mesh>
          {studs.map((p, i) => (
            <mesh key={i} position={p}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 12]} />
              <meshStandardMaterial color={colors.counterTop ?? '#F4F4F4'} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

/** Soft daylight: a sky / ground fill and one warm sun (no shadow map: games move things a lot). */
export function StageLights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9a37a', 1.6]} />
      <directionalLight position={[8, 20, 14]} intensity={1.6} />
    </>
  )
}

/** Something whose changes need a frame (a zustand store the scene reads in `useFrame`). */
interface Watchable {
  subscribe: (listener: () => void) => () => void
}

export interface GameStageProps {
  children: ReactNode
  /** The canvas test id (default `game-canvas`). */
  testId?: string
  camera?: StageCamera
  /** Backdrop colours; `backdrop={false}` draws none (a game with its own room). */
  backdrop?: BackdropColors | false
  /** Draw the counter (default true). */
  counter?: boolean
  /** Background colour behind everything. */
  background?: string
  /** Stores read imperatively in `useFrame`: each change asks for a frame. */
  watch?: readonly Watchable[]
}

/**
 * The stage: put the game's models inside. Animations ask for frames with `useFrameRequest(active)`
 * (render/frameDriver) or the kit helpers, which already do.
 */
export default function GameStage({ children, testId = 'game-canvas', camera = DEFAULT_CAMERA, backdrop = {}, counter = true, background = '#cfe8f0', watch }: GameStageProps) {
  // Bakes made for the game (food, figures) are not templates or blueprints: freed when it closes.
  useEvictStaleBakesOnUnmount()
  return (
    <BtCanvas testId={testId} watch={watch}>
      <color attach="background" args={[background]} />
      <FixedCamera camera={camera} />
      <StageLights />
      {backdrop !== false && <CounterBackdrop colors={backdrop} counter={counter} />}
      {children}
    </BtCanvas>
  )
}
