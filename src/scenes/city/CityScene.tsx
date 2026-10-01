import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { MapControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { addRoads, CELL, footprintCells } from '../../core/city'
import { clampCell, planPlacement, pointToCell, type Cell, type PlacementPlan } from '../../core/cityPlan'
import { paintRoadLine } from '../../core/roads'
import type { Blueprint, CityState } from '../../core/types'
import { createGestureTracker, sampleOf } from '../../input/tapGesture'
import BakedMeshes from '../../render/BakedMeshes'
import { createGhostMaterial } from '../../render/materials'
import { placementMatrix } from '../../render/placementTransform'
import { makeSizeOf, resolveRenderable } from '../../render/sources'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'
import { useCityEditor, type CityTool } from '../../state/useCityEditor'
import { useGame } from '../../state/useGame'
import DevStats from '../../ui/DevStats'
import CityGround from './CityGround'
import Placements, { bakedHeight, footprintBox, PLACEHOLDER_HEIGHT } from './Placements'
import Roads from './Roads'

const SKY = '#87ceeb'
const SHADOW_MAP_SIZE = 2048
const VALID = new THREE.Color('#3cd35a')
const INVALID = new THREE.Color('#ff3b30')
const SELECTED = '#ffd500'
/** Initial camera distance and tilt from straight down (radians). */
const START_DISTANCE = 120
const START_TILT = 0.75

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

function Lights({ size }: { size: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const span = size * CELL
  const mid = span / 2
  const target = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    const cam = light.current?.shadow.camera
    if (!cam) return
    const extent = span * 0.75
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = span * 2
    cam.updateProjectionMatrix()
  }, [span])

  return (
    <>
      <hemisphereLight args={['#ffffff', '#7a9a6a', 1.6]} />
      <primitive object={target} position={[mid, 0, mid]} />
      <directionalLight
        ref={light}
        target={target}
        position={[mid + span * 0.3, span * 0.6, mid + span * 0.2]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
      />
    </>
  )
}

/** Centre of everything built so far (or of the city when empty), where the camera starts. */
function contentCenter(city: CityState, blueprints: Blueprint[]): [number, number] {
  const sizeOf = makeSizeOf({ blueprints })
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  const add = (cx: number, cz: number, cw = 1, cd = 1) => {
    minX = Math.min(minX, cx)
    minZ = Math.min(minZ, cz)
    maxX = Math.max(maxX, cx + cw)
    maxZ = Math.max(maxZ, cz + cd)
  }
  for (const key of city.roads) {
    const [cx, cz] = key.split(',').map(Number)
    add(cx, cz)
  }
  for (const p of city.placements) {
    const { cw, cd } = footprintCells(sizeOf(p.source), p.rot)
    add(p.cx, p.cz, cw, cd)
  }
  if (minX === Infinity) return [(city.size * CELL) / 2, (city.size * CELL) / 2]
  return [((minX + maxX) / 2) * CELL, ((minZ + maxZ) / 2) * CELL]
}

const PAN_TOUCHES = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
const PAN_MOUSE = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
// Road tool: one finger / the left button paints (no mapping = controls ignore it), so the camera
// moves with two fingers / the right button.
const PAINT_TOUCHES = { TWO: THREE.TOUCH.DOLLY_PAN }
const PAINT_MOUSE = { MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

/** Top-down-ish camera with map controls (one-finger pan, pinch zoom, two-finger rotate), kept over the city. */
function CameraRig({ size, tool }: { size: number; tool: CityTool }) {
  const [start] = useState(() => {
    const { city, blueprints } = useGame.getState().data
    const [x, z] = contentCenter(city, blueprints)
    const target: [number, number, number] = [x, 0, z]
    const position: [number, number, number] = [
      x,
      START_DISTANCE * Math.cos(START_TILT),
      z + START_DISTANCE * Math.sin(START_TILT),
    ]
    return { target, position }
  })
  const controls = useRef<MapControlsImpl>(null)
  const span = size * CELL

  const keepOverCity = useCallback(() => {
    const c = controls.current
    if (!c) return
    const t = c.target
    const x = Math.max(0, Math.min(span, t.x))
    const z = Math.max(0, Math.min(span, t.z))
    if (x === t.x && z === t.z) return
    c.object.position.x += x - t.x
    c.object.position.z += z - t.z
    t.x = x
    t.z = z
  }, [span])

  const painting = tool === 'road'
  return (
    <>
      <PerspectiveCamera makeDefault position={start.position} fov={45} near={1} far={2000} />
      <MapControls
        ref={controls}
        makeDefault
        target={start.target}
        enableDamping
        dampingFactor={0.12}
        minDistance={25}
        maxDistance={340}
        maxPolarAngle={1.2}
        touches={painting ? PAINT_TOUCHES : PAN_TOUCHES}
        mouseButtons={painting ? PAINT_MOUSE : PAN_MOUSE}
        onChange={keepOverCity}
      />
    </>
  )
}

/** Translucent flat box over a footprint (ghost base / selection). */
function FootprintMarker({ cx, cz, cw, cd, color, opacity }: { cx: number; cz: number; cw: number; cd: number; color: THREE.ColorRepresentation; opacity: number }) {
  return (
    <mesh position={[(cx + cw / 2) * CELL, 0.2, (cz + cd / 2) * CELL]}>
      <boxGeometry args={[cw * CELL - 0.4, 0.4, cd * CELL - 0.4]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

const ghostMatrix = new THREE.Matrix4()

/** Preview of the model the place tool would drop, tinted green (fits) or red (does not). */
function PlacementGhost({ source, plan, blueprints }: { source: string; plan: PlacementPlan; blueprints: Blueprint[] }) {
  const resolved = useMemo(() => resolveRenderable(source, { blueprints }), [source, blueprints])
  const baked = resolved?.baked
  const material = useMemo(() => createGhostMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  const valid = plan.error === null
  useLayoutEffect(() => {
    material.color.copy(valid ? VALID : INVALID)
    material.emissive.copy(valid ? VALID : INVALID).multiplyScalar(0.35)
  }, [material, valid])

  const group = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    if (!group.current || !resolved) return
    placementMatrix(ghostMatrix, plan, resolved.baseplate).decompose(
      group.current.position,
      group.current.quaternion,
      group.current.scale,
    )
  }, [plan, resolved])

  if (!resolved || !baked) return null
  const { cw, cd } = footprintCells(resolved.baseplate, plan.rot)
  return (
    <>
      <FootprintMarker cx={plan.cx} cz={plan.cz} cw={cw} cd={cd} color={valid ? VALID : INVALID} opacity={0.35} />
      <group ref={group}>
        <BakedMeshes baked={baked} material={material} />
      </group>
    </>
  )
}

const samePlan = (a: PlacementPlan | null, b: PlacementPlan | null) =>
  a === b || (a !== null && b !== null && a.cx === b.cx && a.cz === b.cz && a.rot === b.rot && a.error === b.error)

interface HitBox {
  id: string
  box: THREE.Box3
}

function CityWorld() {
  const city = useGame((s) => s.data.city)
  const blueprints = useGame((s) => s.data.blueprints)
  const tool = useCityEditor((s) => s.tool)
  const selectedSource = useCityEditor((s) => s.selectedSource)
  const selectedPlacementId = useCityEditor((s) => s.selectedPlacementId)
  const el = useThree((s) => s.gl.domElement)
  const getThree = useThree((s) => s.get)

  const sizeOf = useMemo(() => makeSizeOf({ blueprints }), [blueprints])

  // Road being dragged: shown merged into the real roads so the auto-tiling previews live.
  const [paint, setPaint] = useState<{ from: Cell; to: Cell } | null>(null)
  const displayRoads = useMemo(() => {
    if (!paint) return city.roads
    const keys = paintRoadLine([], clampCell(paint.from, city.size), clampCell(paint.to, city.size))
    return addRoads(city, keys, sizeOf).roads
  }, [paint, city, sizeOf])

  // Place-tool preview at the hovered / touched point.
  const hover = useRef<{ x: number; z: number } | null>(null)
  const [plan, setPlanState] = useState<PlacementPlan | null>(null)
  const planRef = useRef<PlacementPlan | null>(null)
  const setPlan = useCallback((next: PlacementPlan | null) => {
    if (samePlan(planRef.current, next)) return
    planRef.current = next
    setPlanState(next)
  }, [])
  const updatePlan = useCallback(
    (point: { x: number; z: number } | null) => {
      hover.current = point
      const { tool: t, selectedSource: source } = useCityEditor.getState()
      if (!point || t !== 'place' || source === null) {
        setPlan(null)
        return
      }
      const { data } = useGame.getState()
      setPlan(planPlacement(data.city, source, point.x, point.z, makeSizeOf(data)))
    },
    [setPlan],
  )
  // The city or the source changed under a visible ghost: re-check it.
  useEffect(() => {
    if (hover.current) updatePlan(hover.current)
  }, [city, tool, selectedSource, blueprints, updatePlan])

  // Tap targets: footprint x model height boxes (cheaper and easier to hit than triangles). Placements
  // that cannot be drawn get their placeholder block's box, so the erase tool can still remove them.
  const hitBoxes = useMemo<HitBox[]>(() => {
    const heights = new Map<string, number>()
    const heightOf = (source: string) => {
      let h = heights.get(source)
      if (h === undefined) {
        const r = resolveRenderable(source, { blueprints })
        h = r ? bakedHeight(r.baked) : PLACEHOLDER_HEIGHT
        heights.set(source, h)
      }
      return h
    }
    return city.placements.map((p) => {
      const b = footprintBox(p, sizeOf(p.source))
      return { id: p.id, box: new THREE.Box3(new THREE.Vector3(b.x0, 0, b.z0), new THREE.Vector3(b.x1, heightOf(p.source), b.z1)) }
    })
  }, [city.placements, blueprints, sizeOf])
  const hitBoxesRef = useRef(hitBoxes)
  useEffect(() => {
    hitBoxesRef.current = hitBoxes
  }, [hitBoxes])

  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    const gestures = createGestureTracker()
    /** The gesture in progress started with a mouse (its hover ghost survives a camera drag). */
    let mouseGesture = false
    let painting: { id: number; from: Cell; to: Cell } | null = null

    const aim = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, getThree().camera)
    }
    const groundPoint = (e: PointerEvent): { x: number; z: number } | null => {
      aim(e)
      const p = raycaster.ray.intersectPlane(GROUND_PLANE, hit)
      return p ? { x: p.x, z: p.z } : null
    }
    const placementUnder = (e: PointerEvent): string | null => {
      aim(e)
      let best: string | null = null
      let bestDist = Infinity
      for (const { id, box } of hitBoxesRef.current) {
        const p = raycaster.ray.intersectBox(box, hit)
        if (!p) continue
        const d = p.distanceToSquared(raycaster.ray.origin)
        if (d < bestDist) {
          bestDist = d
          best = id
        }
      }
      return best
    }
    const stopPainting = () => {
      painting = null
      setPaint(null)
    }

    const onDown = (e: PointerEvent) => {
      if (!gestures.down(sampleOf(e))) {
        // Second finger: this is a pinch / rotate, not a tap or a road.
        stopPainting()
        updatePlan(null)
        return
      }
      mouseGesture = e.pointerType === 'mouse'
      if (painting) stopPainting() // left over from a gesture whose release was lost
      if (e.button !== 0) return // only the primary button edits; others move the camera
      const point = groundPoint(e)
      const { tool: t } = useCityEditor.getState()
      if (t === 'road' && point) {
        const cell = pointToCell(point.x, point.z)
        painting = { id: e.pointerId, from: cell, to: cell }
        setPaint({ from: cell, to: cell })
      } else if (t === 'place') {
        updatePlan(point)
      }
    }

    const onMove = (e: PointerEvent) => {
      if (painting && e.pointerId === painting.id) {
        const point = groundPoint(e)
        if (!point) return
        const cell = pointToCell(point.x, point.z)
        if (cell.cx === painting.to.cx && cell.cz === painting.to.cz) return
        painting = { ...painting, to: cell }
        setPaint({ from: painting.from, to: cell })
        return
      }
      // Mouse hover moves the ghost; a held button means the camera is being dragged.
      if (e.pointerType === 'mouse' && e.buttons === 0) updatePlan(e.target === el ? groundPoint(e) : null)
    }

    const onUp = (e: PointerEvent) => {
      const gesture = gestures.up(sampleOf(e))
      if (!gesture.ended) return
      if (painting && painting.id === e.pointerId) {
        const { from, to } = painting
        stopPainting()
        if (!gesture.multi) useCityEditor.getState().paintRoad(from, to)
        return
      }
      if (!gesture.tap) {
        if (!mouseGesture) updatePlan(null) // a touch ghost does not follow the camera drag
        return
      }
      const ed = useCityEditor.getState()
      const placementId = placementUnder(e)
      if (placementId) {
        ed.tapPlacement(placementId)
        updatePlan(null)
        return
      }
      const point = groundPoint(e)
      if (!point) return
      ed.tapGround(point.x, point.z)
      // The ghost would now sit inside the new model; hide it until the pointer moves again.
      if (useCityEditor.getState().lastError === null) updatePlan(null)
    }

    const onCancel = (e: PointerEvent) => {
      gestures.cancel(e.pointerId)
      if (painting?.id === e.pointerId) stopPainting()
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') updatePlan(null)
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
    }
  }, [el, getThree, updatePlan])

  const selected = useMemo(() => {
    const p = city.placements.find((q) => q.id === selectedPlacementId)
    if (!p) return null
    return { ...p, ...footprintCells(sizeOf(p.source), p.rot) }
  }, [city.placements, selectedPlacementId, sizeOf])

  return (
    <>
      <CameraRig size={city.size} tool={tool} />
      <Lights size={city.size} />
      <CityGround size={city.size} />
      <Roads roads={displayRoads} />
      <Placements placements={city.placements} blueprints={blueprints} />
      {selected && <FootprintMarker cx={selected.cx} cz={selected.cz} cw={selected.cw} cd={selected.cd} color={SELECTED} opacity={0.55} />}
      {plan && selectedSource && <PlacementGhost source={selectedSource} plan={plan} blueprints={blueprints} />}
    </>
  )
}

export default function CityScene() {
  useEvictStaleBakesOnUnmount()
  return (
    <Canvas shadows="percentage" dpr={[1, 1.5]} data-testid="city-canvas">
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 450, 900]} />
      <CityWorld />
      <DevStats />
    </Canvas>
  )
}
