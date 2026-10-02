import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type CanvasProps } from '@react-three/fiber'
import { adaptedDpr, maxDprSteps, PerfGovernor, type RenderConfig } from '../state/graphics'
import { useSceneCover } from '../state/sceneCover'
import { autoDowngrade, currentLevel, useGraphics } from '../state/useGraphics'
import DevStats, { statsRequested } from '../ui/DevStats'
import { FrameDriver, FrameDriverContext } from './frameDriver'
import { renderStats } from './renderStats'
import { applyShadowSettings, installStaticShadows, refreshShadows } from './staticShadows'

/** Anything with a zustand-style `subscribe`: a change there may need a frame. */
interface Watchable {
  subscribe: (listener: () => void) => () => void
}

interface Props {
  children: ReactNode
  /** The canvas's test id. */
  testId: string
  /** The scene moves on its own all the time (driving): frames at the graphics frame cap. */
  animated?: boolean
  /**
   * Stores the scene reads imperatively (in `useFrame`, layout effects): each change asks for a frame.
   * Changes that re-render the scene's JSX ask for one by themselves.
   */
  watch?: readonly Watchable[]
  camera?: CanvasProps['camera']
}

/** Automated browsers pace frames themselves (src/testLowPower.ts): frame times there say nothing. */
const automated = () => typeof navigator !== 'undefined' && navigator.webdriver === true

/** True while the page is shown (not a background tab or a locked screen). */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

/** A frame now, and another a moment later (once React has committed what the event changed). */
function useKick(): () => void {
  const invalidate = useThree((s) => s.invalidate)
  const trailing = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (trailing.current !== null) window.clearTimeout(trailing.current)
    },
    [],
  )
  return useMemo(
    () => () => {
      invalidate()
      if (trailing.current !== null) return
      trailing.current = window.setTimeout(() => {
        trailing.current = null
        invalidate()
      }, 60)
    },
    [invalidate],
  )
}

/** Input on the canvas and changes in the watched stores ask for frames. */
function DemandTriggers({ watch }: { watch: readonly Watchable[] }) {
  const el = useThree((s) => s.gl.domElement)
  const kick = useKick()
  useEffect(() => {
    const events = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'] as const
    for (const e of events) el.addEventListener(e, kick, { passive: true })
    return () => {
      for (const e of events) el.removeEventListener(e, kick)
    }
  }, [el, kick])
  useEffect(() => {
    const unsubscribe = watch.map((store) => store.subscribe(kick))
    return () => unsubscribe.forEach((u) => u())
  }, [watch, kick])
  return null
}

/** Redraws the shadow map only when it would change (see render/staticShadows). */
function StaticShadows() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  useEffect(() => installStaticShadows(gl, scene), [gl, scene])
  useEffect(() => refreshShadows(gl), [gl, size])
  return null
}

/**
 * The shadow settings changed while the scene runs (an auto downgrade): maps of the old size go, and
 * shadows on or off recompile every material.
 */
function ShadowSettings({ on, quality }: { on: boolean; quality: RenderConfig['shadowQuality'] }) {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const seen = useRef({ on, quality })
  useEffect(() => {
    const before = seen.current
    if (before.on === on && before.quality === quality) return
    seen.current = { on, quality }
    applyShadowSettings(scene, before.on !== on)
    refreshShadows(gl)
    invalidate()
  }, [on, quality, scene, gl, invalidate])
  return null
}

/**
 * Watches frame times while frames come continuously: lowers the resolution a step when they stay
 * slow, raises it back after a long smooth stretch, and steps the preset down once (see PerfGovernor).
 */
function Governor({ config, driver, onSteps }: { config: RenderConfig; driver: FrameDriver; onSteps: (steps: number) => void }) {
  const governor = useMemo(
    () => {
      const level = currentLevel()
      return new PerfGovernor(maxDprSteps(config), level === 'balanced' || level === 'best')
    },
    // A new cap (another preset, the device turned) starts afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.maxDpr, config.minDpr, config.fps],
  )
  useEffect(() => onSteps(0), [governor, onSteps])
  const last = useRef(0)
  useFrame(() => {
    const now = performance.now()
    const interval = now - last.current
    last.current = now
    const rate = driver.rate()
    if (rate <= 0) return
    const action = governor.sample(interval, 1000 / rate)
    if (action === 'downgrade') autoDowngrade()
    else if (action) onSteps(governor.steps)
  })
  return null
}

/** Shares the renderer and a frame counter with the dev handle and the `?stats` overlay. */
function StatsHandle() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    renderStats.gl = gl
    renderStats.frames = 0
    renderStats.invalidate = () => invalidate()
    return () => {
      if (renderStats.gl !== gl) return
      renderStats.gl = null
      renderStats.invalidate = () => undefined
    }
  }, [gl, invalidate])
  useFrame(() => {
    renderStats.frames += 1
  })
  return null
}

function Runtime({
  children,
  config,
  running,
  animated,
  watch,
  onSteps,
}: {
  children: ReactNode
  config: RenderConfig
  running: boolean
  animated: boolean
  watch: readonly Watchable[]
  onSteps: (steps: number) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const [driver] = useState(() => new FrameDriver(() => invalidate()))
  const [measure] = useState(() => !automated())
  const [stats] = useState(statsRequested)
  useEffect(() => driver.setCap(config.fps), [driver, config.fps])
  useEffect(() => driver.setRunning(running), [driver, running])
  useEffect(() => {
    if (!animated) return
    const key = {}
    driver.request(key, 'motion')
    return () => driver.request(key, null)
  }, [driver, animated])
  useEffect(() => {
    renderStats.loopFps = () => driver.rate()
    return () => {
      driver.dispose()
      renderStats.loopFps = () => 0
    }
  }, [driver])
  return (
    <FrameDriverContext.Provider value={driver}>
      <DemandTriggers watch={watch} />
      <StaticShadows />
      <ShadowSettings on={config.shadows} quality={config.shadowQuality} />
      <StatsHandle />
      {measure && <Governor config={config} driver={driver} onSteps={onSteps} />}
      {stats && <DevStats />}
      {children}
    </FrameDriverContext.Provider>
  )
}

const NO_WATCH: readonly Watchable[] = []

/**
 * Every scene's `<Canvas>`, set up from the graphics settings (state/useGraphics): renders on demand
 * (`animated` scenes at the frame cap), caps the pixel ratio and lowers it while frames are slow,
 * shadows on or off with a static shadow map, no antialiasing at a pixel ratio of 2 or more, and
 * paused while the page is hidden or a full-screen dialog covers the scene.
 */
export default function BtCanvas({ children, testId, animated = false, watch = NO_WATCH, camera }: Props) {
  const config = useGraphics()
  const covered = useSceneCover((s) => s.count > 0)
  const running = usePageVisible() && !covered
  const [steps, setSteps] = useState(0)
  // Context options only apply when the canvas is created: fixed at mount.
  const [gl] = useState(() => ({
    antialias: config.antialias,
    powerPreference: (config.fps === 30 && config.maxDpr <= 1 ? 'low-power' : 'high-performance') as WebGLPowerPreference,
  }))
  return (
    <Canvas
      shadows={config.shadows ? 'percentage' : false}
      dpr={adaptedDpr(config, steps)}
      frameloop={running ? 'demand' : 'never'}
      gl={gl}
      camera={camera}
      data-testid={testId}
    >
      <Runtime config={config} running={running} animated={animated} watch={watch} onSteps={setSteps}>
        {children}
      </Runtime>
    </Canvas>
  )
}
