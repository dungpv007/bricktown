import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { bakeBricksUncached, disposeBaked } from '../../core/bake'
import { CELL } from '../../core/city'
import type { Brick } from '../../core/types'
import BakedMeshes from '../../render/BakedMeshes'
import { resolveRenderable, templateSource } from '../../render/sources'
import Placements from '../city/Placements'
import Roads from '../city/Roads'
import { CAR_SPEED, CARS, CENTER, CLOUD, CLOUD_SPAN, CLOUDS, FIGURES, LANE, PATCH, PLACEMENTS, ROADS } from './diorama'
import { laneLength, lanePose } from './loopLane'

/**
 * The main menu's living backdrop: a little LEGO town (see diorama.ts) drawn with the city's own
 * roads, baked templates and minifigures, cars driving round the loop, clouds drifting and the
 * camera slowly circling it like a poster. Decoration only: no physics, no input, a low pixel ratio
 * and small shadows, about 30 fps; it stops drawing while the page is hidden or a dialog covers the menu,
 * and goes away with the menu.
 */

/** One full turn of the camera (seconds). */
const ORBIT_SECONDS = 90
/** Camera azimuth at the start: looking at the town from the south-east, like the poster. */
const START_ANGLE = 0.55
/** Camera height angle above the ground (radians) and distance from the town's centre (studs). */
const ELEVATION = 0.52
const DISTANCE = 175
/** Vertical field of view at the poster's aspect; wider screens keep the poster's horizontal view. */
const FOV = 30
const POSTER_ASPECT = 1.6
/** Height of the point the camera circles and looks at: the middle of the town plate. */
const TARGET_Y = 0
/** Road surface height (top of the asphalt tile). */
const ROAD_Y = 0.1
const GRASS = '#7cc46a'
const PLATE_SIDE = '#5aa24c'
const PLATE_THICKNESS = 2.4
const SHADOW_MAP_SIZE = 1024
/** About 30 frames a second: plenty for slow drifting, half the work of the display rate. */
const FRAME_MS = 33
/** The shadow map is redrawn every this many frames (only the cars' shadows move). */
const SHADOW_EVERY = 3

const SPAN_X = PATCH.w * CELL
const SPAN_Z = PATCH.d * CELL

export interface MenuBackgroundProps {
  /** Freeze time at the start (the poster capture uses this). */
  still?: boolean
  /** Stop drawing (e.g. a full-screen dialog covers the menu). */
  paused?: boolean
  /** Called once the town has drawn its first frames, for the cross-fade from the poster. */
  onReady?: () => void
  /** Called when the browser takes the WebGL context away (the poster should come back). */
  onContextLost?: () => void
}

/** Seconds since the scene started, frozen when `still`; long pauses (a hidden tab) are skipped, not jumped. */
function useSceneTime(still: boolean) {
  const time = useRef(0)
  useFrame((_, delta) => {
    if (!still) time.current += Math.min(delta, 0.1)
  }, -1)
  return time
}

/** Vertical field of view for a screen `aspect` wide (see FOV). */
function fovFor(aspect: number): number {
  // Narrower than the poster: the same vertical view (the poster is cropped at the sides alike).
  // Wider: the poster's horizontal view, so the town is never cut off at the top.
  if (aspect <= POSTER_ASPECT) return FOV
  const half = THREE.MathUtils.degToRad(FOV / 2)
  return THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * POSTER_ASPECT) / aspect))
}

function CameraRig({ time }: { time: RefObject<number> }) {
  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera
    const fov = fovFor(size.width / Math.max(1, size.height))
    if (cam.fov !== fov) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    const angle = START_ANGLE + ((time.current ?? 0) / ORBIT_SECONDS) * Math.PI * 2
    const flat = DISTANCE * Math.cos(ELEVATION)
    cam.position.set(CENTER.x + flat * Math.sin(angle), DISTANCE * Math.sin(ELEVATION), CENTER.z + flat * Math.cos(angle))
    cam.lookAt(CENTER.x, TARGET_Y, CENTER.z)
  })
  return null
}

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useLayoutEffect(() => {
    const cam = light.current?.shadow.camera
    if (!cam) return
    const extent = Math.max(SPAN_X, SPAN_Z) * 0.62
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = 300
    cam.updateProjectionMatrix()
  }, [])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#7a9a6a', 1.7]} />
      <primitive object={target} position={[CENTER.x, 0, CENTER.z]} />
      <directionalLight
        ref={light}
        target={target}
        position={[CENTER.x + 50, 110, CENTER.z + 35]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.06}
      />
    </>
  )
}

/** The green town plate, with a little thickness so it reads as a model on a table. */
function TownPlate() {
  return (
    <group>
      <mesh position={[SPAN_X / 2, -0.01, SPAN_Z / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SPAN_X, SPAN_Z]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>
      <mesh position={[SPAN_X / 2, -PLATE_THICKNESS / 2 - 0.02, SPAN_Z / 2]}>
        <boxGeometry args={[SPAN_X, PLATE_THICKNESS, SPAN_Z]} />
        <meshStandardMaterial color={PLATE_SIDE} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A baked one-off model (figures, cloud) owned by this scene: freed when it unmounts. */
function useOwnBake(bricks: Brick[]) {
  const baked = useMemo(() => bakeBricksUncached(bricks), [bricks])
  useEffect(() => () => disposeBaked(baked), [baked])
  return baked
}

function Figures() {
  const baked = useOwnBake(FIGURES)
  return <BakedMeshes baked={baked} receiveShadow />
}

const NO_BLUEPRINTS = { blueprints: [] }

/** One car template driving round the lane, `start` of a lap ahead of the lane's start. */
function Car({ template, start, time }: { template: string; start: number; time: RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const source = useMemo(() => resolveRenderable(templateSource(template), NO_BLUEPRINTS), [template])
  const length = laneLength(LANE)
  useFrame(() => {
    const g = group.current
    if (!g) return
    const pose = lanePose(LANE, start * length + (time.current ?? 0) * CAR_SPEED)
    g.position.set(pose.x, ROAD_Y, pose.z)
    g.rotation.y = pose.yaw
  })
  if (!source) return null
  const { w, d } = source.baseplate
  return (
    <group ref={group}>
      {/* The model's baseplate centre sits on the lane. */}
      <group position={[-w / 2, 0, -d / 2]}>
        <BakedMeshes baked={source.baked} />
      </group>
    </group>
  )
}

/** Clouds drifting sideways across the sky beyond the town, whichever way the camera looks. */
function Clouds({ time }: { time: RefObject<number> }) {
  const baked = useOwnBake(CLOUD)
  const group = useRef<THREE.Group>(null)
  const clouds = useRef<Array<THREE.Group | null>>([])
  useFrame(() => {
    const t = time.current ?? 0
    // Turn with the camera, so "beyond the town" stays beyond it.
    if (group.current) group.current.rotation.y = START_ANGLE + (t / ORBIT_SECONDS) * Math.PI * 2
    CLOUDS.forEach((c, i) => {
      const g = clouds.current[i]
      if (!g) return
      const x = ((((c.x + t * c.speed + CLOUD_SPAN) % (2 * CLOUD_SPAN)) + 2 * CLOUD_SPAN) % (2 * CLOUD_SPAN)) - CLOUD_SPAN
      g.position.set(x, c.y + Math.sin(t * 0.4 + i) * 0.8, c.z)
    })
  })
  return (
    <group position={[CENTER.x, 0, CENTER.z]}>
      <group ref={group}>
        {CLOUDS.map((c, i) => (
          <group
            key={i}
            ref={(g) => {
              clouds.current[i] = g
            }}
            scale={c.scale}
          >
            {/* Centre the 10x4 cloud on its position. */}
            <group position={[-5, 0, -2]}>
              <BakedMeshes baked={baked} />
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}

/** Reports readiness after a few drawn frames (shaders compiled, shadows in place). */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0)
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    frames.current += 1
    if (frames.current >= 3) {
      done.current = true
      onReady?.()
    }
  })
  return null
}

/** Drives the on-demand frame loop at about 30 fps while `running`. */
function Ticker({ running }: { running: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!running) return
    invalidate()
    const timer = window.setInterval(() => invalidate(), FRAME_MS)
    return () => window.clearInterval(timer)
  }, [running, invalidate])
  return null
}

/** Redraws the shadow map only every few frames: buildings stand still, cars move slowly. */
function ShadowThrottle() {
  const frame = useRef(0)
  useFrame(({ gl }) => {
    gl.shadowMap.autoUpdate = false
    if (frame.current % SHADOW_EVERY === 0) gl.shadowMap.needsUpdate = true
    frame.current += 1
  }, -2)
  return null
}

/** Reports a lost WebGL context (GPU reset, too many contexts...). */
function ContextLossWatch({ onLost }: { onLost?: () => void }) {
  const canvas = useThree((s) => s.gl.domElement)
  useEffect(() => {
    if (!onLost) return
    canvas.addEventListener('webglcontextlost', onLost)
    return () => canvas.removeEventListener('webglcontextlost', onLost)
  }, [canvas, onLost])
  return null
}

function Town({ still, onReady }: Pick<MenuBackgroundProps, 'still' | 'onReady'>) {
  const time = useSceneTime(still === true)
  return (
    <>
      <CameraRig time={time} />
      <Lights />
      <TownPlate />
      <Roads roads={ROADS} />
      <Placements placements={PLACEMENTS} blueprints={NO_BLUEPRINTS.blueprints} />
      <Figures />
      {CARS.map((c) => (
        <Car key={c.template} template={c.template} start={c.start} time={time} />
      ))}
      <Clouds time={time} />
      <ShadowThrottle />
      <ReadySignal onReady={onReady} />
    </>
  )
}

/** True while the page is shown (not a background tab or a locked screen). */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

export default function MenuBackground({ still, paused, onReady, onContextLost }: MenuBackgroundProps) {
  const running = usePageVisible() && paused !== true
  return (
    <Canvas
      className="bt-menu-bg-canvas"
      data-testid="menu-bg-canvas"
      shadows="percentage"
      dpr={[1, 1.25]}
      frameloop={running ? 'demand' : 'never'}
      camera={{ fov: FOV, near: 1, far: 800 }}
      gl={{ alpha: true, powerPreference: 'low-power' }}
      // Purely decorative: taps go to the menu.
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <Ticker running={running} />
      <ContextLossWatch onLost={onContextLost} />
      <Town still={still} onReady={onReady} />
    </Canvas>
  )
}
