import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MapControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { MAZE_CELL, cellKey, inBounds, type Cell, type Maze } from '../../core/maze'
import { cellAtPoint, voidWalls } from '../../core/mazeRun'
import { createGestureTracker, sampleOf } from '../../input/tapGesture'
import { currentMaze, useMazeEditor, useShownMaze, type MazeTool } from '../../state/useMazeEditor'
import DevStats from '../../ui/DevStats'
import MazeModel, { cellCenter } from './MazeModel'
import { mazeScreen } from './mazeScreen'
import { hudFreeRect, toNdc, type HudEdges } from '../workshop/safeArea'
import { frameMaze, WALL_HEIGHT } from './mazeView'

const SKY = '#87ceeb'
const SHADOW_MAP_SIZE = 2048
const FOV = 45
/**
 * The maze editor's HUD panels, by the screen edge they cover (see `hudFreeRect`). The side column
 * is a row under the top bar on portrait phones.
 */
const MAZE_HUD: HudEdges = {
  left: ['.bt-maze-tools'],
  right: [],
  top: ['.bt-topbar-title', '.bt-topright'],
  bottom: ['.bt-maze-name'],
  auto: ['.bt-maze-side'],
}
/** Seconds after a size change during which the HUD is measured again every frame. */
const HUD_SETTLE_S = 1.5

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const TOP_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WALL_HEIGHT)

const GHOST_COLOR: Record<Exclude<MazeTool, 'move'>, string> = {
  wall: '#3cd35a',
  erase: '#ff3b30',
  entry: '#bbe90b',
  exit: '#ffffff',
  coin: '#ffd500',
}

function Lights({ w, h }: { w: number; h: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const sx = w * MAZE_CELL
  const sz = h * MAZE_CELL
  const span = Math.max(sx, sz)
  const target = useMemo(() => new THREE.Object3D(), [])
  useLayoutEffect(() => {
    const cam = light.current?.shadow.camera
    if (!cam) return
    const extent = span * 0.8
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = span * 3
    cam.updateProjectionMatrix()
  }, [span])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#7a9a6a', 1.6]} />
      <primitive object={target} position={[sx / 2, 0, sz / 2]} />
      <directionalLight
        ref={light}
        target={target}
        position={[sx / 2 + span * 0.35, span * 0.9, sz / 2 + span * 0.25]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
      />
    </>
  )
}

// One finger pans (move tool and the tap tools), two fingers pinch-zoom and pan. With the wall
// tools one finger / the left button paints (no mapping = the controls ignore it), as in the city.
const PAN_TOUCHES = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
const PAN_MOUSE = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
const PAINT_TOUCHES = { TWO: THREE.TOUCH.DOLLY_PAN }
const PAINT_MOUSE = { MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

/** Tilted top-down camera that frames the whole maze (again whenever its size changes), kept over it. */
function CameraRig({ w, h, tool }: { w: number; h: number; tool: MazeTool }) {
  const controls = useRef<MapControlsImpl>(null)
  /** What the view was last framed for (maze size, canvas size, HUD-free rect); framed again only when that changes. */
  const framedFor = useRef('')
  const sizeKey = useRef('')
  const settleUntil = useRef(0)

  // Framed from the render loop: the controls and the canvas size only exist after the first frames,
  // and the HUD (its own lazy chunk) may appear a little later, so the free rect is measured again
  // for a short while after each size change, then only when a size changes.
  useFrame(({ camera, size, gl, clock }) => {
    const c = controls.current
    if (!c || size.width === 0 || size.height === 0) return
    const sk = `${w}x${h}@${size.width}x${size.height}`
    if (sk !== sizeKey.current) {
      sizeKey.current = sk
      settleUntil.current = clock.elapsedTime + HUD_SETTLE_S
    }
    if (clock.elapsedTime > settleUntil.current && framedFor.current.startsWith(sk)) return
    const free = hudFreeRect(gl.domElement, MAZE_HUD)
    const key = `${sk}:${free.left},${free.top},${free.right},${free.bottom}`
    if (framedFor.current === key) return
    framedFor.current = key
    const frame = frameMaze(w, h, size.width / size.height, FOV, toNdc(free, size.width, size.height))
    camera.position.set(...frame.position)
    c.target.set(...frame.target)
    c.maxDistance = frame.distance * 1.6
    c.minDistance = Math.min(30, frame.distance)
    c.update()
  })

  const keepOverMaze = useCallback(() => {
    const c = controls.current
    if (!c) return
    const t = c.target
    const x = Math.max(0, Math.min(w * MAZE_CELL, t.x))
    const z = Math.max(0, Math.min(h * MAZE_CELL, t.z))
    if (x === t.x && z === t.z) return
    c.object.position.x += x - t.x
    c.object.position.z += z - t.z
    t.x = x
    t.z = z
  }, [w, h])

  const painting = tool === 'wall' || tool === 'erase'
  return (
    <>
      <PerspectiveCamera makeDefault fov={FOV} near={1} far={3000} position={[0, 100, 100]} />
      <MapControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enableRotate={false}
        touches={painting ? PAINT_TOUCHES : PAN_TOUCHES}
        mouseButtons={painting ? PAINT_MOUSE : PAN_MOUSE}
        onChange={keepOverMaze}
      />
    </>
  )
}

/** Translucent block (walls) or pad (the other tools) over the cell the finger / mouse is on. */
function Ghost({ cell, tool }: { cell: Cell; tool: Exclude<MazeTool, 'move'> }) {
  const [x, z] = cellCenter(cell)
  const tall = tool === 'wall' || tool === 'erase'
  const height = tall ? WALL_HEIGHT + 0.3 : 0.5
  return (
    <mesh position={[x, height / 2, z]} renderOrder={2}>
      <boxGeometry args={[MAZE_CELL + 0.2, height, MAZE_CELL + 0.2]} />
      <meshBasicMaterial color={GHOST_COLOR[tool]} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  )
}

const sameCell = (a: Cell | null, b: Cell | null) => a === b || (a !== null && b !== null && a.cx === b.cx && a.cz === b.cz)

function MazeWorld({ maze }: { maze: Maze }) {
  const tool = useMazeEditor((s) => s.tool)
  const stroking = useMazeEditor((s) => s.preview !== null)
  const el = useThree((s) => s.gl.domElement)
  const getThree = useThree((s) => s.get)

  const [hover, setHoverState] = useState<Cell | null>(null)
  const hoverRef = useRef<Cell | null>(null)
  const setHover = useCallback((cell: Cell | null) => {
    if (sameCell(hoverRef.current, cell)) return
    hoverRef.current = cell
    setHoverState(cell)
  }, [])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    const gestures = createGestureTracker()
    let painting: number | null = null
    let mouseGesture = false
    // The low hedges of the maze last shown, recomputed only when its walls or size change (cellAt
    // runs on every pointer move).
    let hedges: { walls: string[]; w: number; h: number; keys: Set<string> } | null = null
    const hedgesOf = (m: Maze): Set<string> => {
      if (!hedges || hedges.walls !== m.walls || hedges.w !== m.w || hedges.h !== m.h) {
        hedges = { walls: m.walls, w: m.w, h: m.h, keys: voidWalls(m) }
      }
      return hedges.keys
    }

    /** The cell under the pointer: a (full-height) wall top when the ray hits one, else the floor (null off the maze). */
    const cellAt = (e: PointerEvent): Cell | null => {
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, getThree().camera)
      const shown = useMazeEditor.getState().preview ?? currentMaze()
      if (!shown) return null
      const top = raycaster.ray.intersectPlane(TOP_PLANE, hit)
      if (top) {
        const cell = cellAtPoint(top.x, top.z)
        const key = cellKey(cell)
        // Void walls are low hedges: picked on the floor like the open cells.
        if (shown.walls.includes(key) && !hedgesOf(shown).has(key)) return cell
      }
      const floor = raycaster.ray.intersectPlane(GROUND_PLANE, hit)
      return floor ? cellAtPoint(floor.x, floor.z) : null
    }
    const inMaze = (cell: Cell | null): Cell | null => {
      const m = currentMaze()
      return cell && m && inBounds(m, cell) ? cell : null
    }
    const editor = () => useMazeEditor.getState()
    const paints = () => editor().tool === 'wall' || editor().tool === 'erase'

    const onDown = (e: PointerEvent) => {
      if (!gestures.down(sampleOf(e))) {
        // A second finger: pinch / pan, never a wall stroke.
        if (painting !== null) editor().strokeCancel()
        painting = null
        setHover(null)
        return
      }
      mouseGesture = e.pointerType === 'mouse'
      if (painting !== null) editor().strokeCancel() // left over from a lost release
      painting = null
      if (e.button !== 0 || editor().tool === 'move') return
      const cell = inMaze(cellAt(e))
      if (paints()) {
        if (!cell) return // strokes start on the maze; a drag that leaves it is clamped to the edge
        painting = e.pointerId
        setHover(null)
        editor().strokeStart(cell)
      } else {
        setHover(cell)
      }
    }

    const onMove = (e: PointerEvent) => {
      if (painting !== null && e.pointerId === painting) {
        const cell = cellAt(e)
        if (cell) editor().strokeTo(cell)
        return
      }
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        setHover(e.target === el && editor().tool !== 'move' ? inMaze(cellAt(e)) : null)
      }
    }

    const onUp = (e: PointerEvent) => {
      const gesture = gestures.up(sampleOf(e))
      if (!gesture.ended) return
      if (painting !== null && painting === e.pointerId) {
        painting = null
        if (gesture.multi) editor().strokeCancel()
        else editor().strokeEnd()
        return
      }
      if (!mouseGesture) setHover(null)
      if (!gesture.tap || paints()) return
      const cell = inMaze(cellAt(e))
      if (cell) editor().tapCell(cell)
    }

    const onCancel = (e: PointerEvent) => {
      gestures.cancel(e.pointerId)
      if (painting === e.pointerId) {
        painting = null
        editor().strokeCancel()
      }
      setHover(null)
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') setHover(null)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      if (painting !== null) useMazeEditor.getState().strokeCancel()
    }
  }, [el, getThree, setHover])

  // A tool change makes the old ghost meaningless.
  useEffect(() => setHover(null), [tool, setHover])

  useEffect(() => {
    const v = new THREE.Vector3()
    mazeScreen.cellToClient = (cx, cz) => {
      const [x, z] = cellCenter({ cx, cz })
      v.set(x, 0, z).project(getThree().camera)
      const rect = el.getBoundingClientRect()
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
    }
    return () => {
      mazeScreen.cellToClient = null
    }
  }, [el, getThree])

  return (
    <>
      <CameraRig w={maze.w} h={maze.h} tool={tool} />
      <Lights w={maze.w} h={maze.h} />
      <MazeModel maze={maze} />
      {hover && tool !== 'move' && !stroking && <Ghost cell={hover} tool={tool} />}
    </>
  )
}

export default function MazeScene() {
  const maze = useShownMaze()
  if (!maze) return null
  return (
    <Canvas shadows="percentage" dpr={[1, 1.5]} data-testid="maze-canvas">
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 500, 1100]} />
      <MazeWorld maze={maze} />
      <DevStats />
    </Canvas>
  )
}
