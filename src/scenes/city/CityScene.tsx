import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { MapControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { addRoads, CELL, footprintCells } from '../../core/city'
import { clampCell, placementCenter, planMove, planPlacement, pointToCell, type Cell, type PlacementPlan } from '../../core/cityPlan'
import { paintRoadLine, roadKey } from '../../core/roads'
import type { Baseplate, Blueprint, CityPlacement, CityState } from '../../core/types'
import { registerPaletteDropTarget, type ClientPoint } from '../../input/paletteDrag'
import BakedMeshes from '../../render/BakedMeshes'
import { createGhostMaterial } from '../../render/materials'
import { placementMatrix } from '../../render/placementTransform'
import { makeSizeOf, resolveRenderable } from '../../render/sources'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'
import { useCityEditor } from '../../state/useCityEditor'
import { useGame } from '../../state/useGame'
import DevStats from '../../ui/DevStats'
import CityGround from './CityGround'
import PlacementHighlight from './PlacementHighlight'
import Placements, { bakedHeight, footprintBox, PLACEHOLDER_HEIGHT } from './Placements'
import Roads from './Roads'
import { useCityGestures, type CityPick, type GroundPoint } from './useCityGestures'

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
// Road mode: one finger / the left button paints (no mapping = controls ignore it), so the camera
// moves with two fingers / the right button.
const PAINT_TOUCHES = { TWO: THREE.TOUCH.DOLLY_PAN }
const PAINT_MOUSE = { MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

/** Top-down-ish camera with map controls (one-finger pan, pinch zoom, two-finger rotate), kept over the city. */
function CameraRig({ size, roadMode }: { size: number; roadMode: boolean }) {
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
        touches={roadMode ? PAINT_TOUCHES : PAN_TOUCHES}
        mouseButtons={roadMode ? PAINT_MOUSE : PAN_MOUSE}
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

/**
 * Preview of a model where it would go (a quick-place under the mouse, a Kho card or a placement
 * being dragged), tinted green (fits) or red (does not). A model nothing can draw shows only its
 * footprint.
 */
function PlacementGhost({ source, plan, blueprints, sizeOf }: { source: string; plan: PlacementPlan; blueprints: Blueprint[]; sizeOf: (source: string) => Baseplate }) {
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

  const { cw, cd } = footprintCells(resolved?.baseplate ?? sizeOf(source), plan.rot)
  return (
    <>
      <FootprintMarker cx={plan.cx} cz={plan.cz} cw={cw} cd={cd} color={valid ? VALID : INVALID} opacity={0.35} />
      {baked && (
        <group ref={group}>
          <BakedMeshes baked={baked} material={material} />
        </group>
      )}
    </>
  )
}

/** The ghost on screen: which model, where. */
interface Preview {
  source: string
  plan: PlacementPlan
}

const samePreview = (a: Preview | null, b: Preview | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.source === b.source &&
    a.plan.cx === b.plan.cx &&
    a.plan.cz === b.plan.cz &&
    a.plan.rot === b.plan.rot &&
    a.plan.error === b.plan.error)

/** A placement being dragged: which one, and the offset from the finger to its footprint centre. */
interface Move {
  placement: CityPlacement
  dx: number
  dz: number
  /** Where it would land; null while the finger is off the ground. */
  plan: PlacementPlan | null
}

/** A road stroke in progress: painting an L from `from` to `to`, or erasing every cell passed over. */
type Stroke = { kind: 'paint'; from: Cell; to: Cell } | { kind: 'erase'; last: Cell; keys: Set<string> }

interface HitBox {
  id: string
  box: THREE.Box3
}

const rayHit = new THREE.Vector3()

function CityWorld() {
  const city = useGame((s) => s.data.city)
  const blueprints = useGame((s) => s.data.blueprints)
  const roadMode = useCityEditor((s) => s.roadMode)
  const selectedSource = useCityEditor((s) => s.selectedSource)
  const selectedPlacementId = useCityEditor((s) => s.selectedPlacementId)
  const errorSeq = useCityEditor((s) => s.errorSeq)
  const el = useThree((s) => s.gl.domElement)
  const getThree = useThree((s) => s.get)

  const sizeOf = useMemo(() => makeSizeOf({ blueprints }), [blueprints])

  // Road being dragged: shown merged into (or cut out of) the real roads so the auto-tiling previews live.
  const [stroke, setStrokeState] = useState<Stroke | null>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const setStroke = useCallback((next: Stroke | null) => {
    strokeRef.current = next
    setStrokeState(next)
  }, [])
  const displayRoads = useMemo(() => {
    if (!stroke) return city.roads
    if (stroke.kind === 'erase') return city.roads.filter((k) => !stroke.keys.has(k))
    const keys = paintRoadLine([], clampCell(stroke.from, city.size), clampCell(stroke.to, city.size))
    return addRoads(city, keys, sizeOf).roads
  }, [stroke, city, sizeOf])

  // The ghost: stored only when it changes, so pointer moves within one cell re-render nothing.
  const [preview, setPreviewState] = useState<Preview | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const setPreview = useCallback((next: Preview | null) => {
    if (samePreview(previewRef.current, next)) return
    previewRef.current = next
    setPreviewState(next)
  }, [])

  /** Ghost of a new placement of `source` where a tap / drop at `point` would put it (facing a road). */
  const showQuickPlace = useCallback(
    (point: GroundPoint | null, source: string | null) => {
      if (!point || source === null) {
        setPreview(null)
        return
      }
      const { data } = useGame.getState()
      setPreview({ source, plan: planPlacement(data.city, source, point.x, point.z, makeSizeOf(data)) })
    },
    [setPreview],
  )
  // Mouse hover over the ground previews a quick-place of the picked Kho card.
  const hover = useRef<GroundPoint | null>(null)
  const updateHover = useCallback(
    (point: GroundPoint | null) => {
      hover.current = point
      const { roadMode: road, selectedSource: source } = useCityEditor.getState()
      showQuickPlace(road ? null : point, source)
    },
    [showQuickPlace],
  )
  // The city or the source changed under a visible hover ghost: re-check it.
  useEffect(() => {
    if (hover.current) updateHover(hover.current)
  }, [city, roadMode, selectedSource, blueprints, updateHover])

  // Tap targets: footprint x model height boxes (cheaper and easier to hit than triangles). Placements
  // that cannot be drawn get their placeholder block's box, so they can still be selected and deleted.
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

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pick = useCallback(
    (x: number, y: number): CityPick => {
      const rect = el.getBoundingClientRect()
      const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, getThree().camera)
      let placementId: string | null = null
      let bestDist = Infinity
      for (const { id, box } of hitBoxesRef.current) {
        const p = raycaster.ray.intersectBox(box, rayHit)
        if (!p) continue
        const d = p.distanceToSquared(raycaster.ray.origin)
        if (d < bestDist) {
          bestDist = d
          placementId = id
        }
      }
      const hit = raycaster.ray.intersectPlane(GROUND_PLANE, rayHit)
      const point = hit ? { x: hit.x, z: hit.z } : null
      const span = useGame.getState().data.city.size * CELL
      const inside = point !== null && point.x >= 0 && point.z >= 0 && point.x < span && point.z < span
      return { placementId, point, inside }
    },
    [el, getThree, raycaster],
  )

  // The placement being dragged: hidden from the city while its ghost follows the finger.
  const moveRef = useRef<Move | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  useCityGestures(el, {
    pick,
    roadMode: () => useCityEditor.getState().roadMode,
    setPan: (on) => {
      const controls = getThree().controls as MapControlsImpl | null
      if (controls) controls.enablePan = on
    },
    tapPlacement: (id) => useCityEditor.getState().selectPlacement(id),
    tapGround: ({ x, z }) => {
      useCityEditor.getState().tapGround(x, z)
      // The ghost would now sit inside the new model; hide it until the pointer moves again.
      if (useCityEditor.getState().lastError === null) updateHover(null)
    },
    tapOutside: () => useCityEditor.getState().selectPlacement(null),
    dragStart: (id, from) => {
      const placement = useGame.getState().data.city.placements.find((p) => p.id === id)
      if (!placement) return
      const c = placementCenter(placement, sizeOf(placement.source))
      moveRef.current = { placement, dx: c.x - from.x, dz: c.z - from.z, plan: null }
      useCityEditor.getState().selectPlacement(id)
      setMovingId(id)
    },
    dragMove: (point) => {
      const m = moveRef.current
      if (!m) return
      if (!point) {
        m.plan = null
        setPreview(null)
        return
      }
      const { data } = useGame.getState()
      m.plan = planMove(data.city, m.placement, point.x + m.dx, point.z + m.dz, makeSizeOf(data))
      setPreview({ source: m.placement.source, plan: m.plan })
    },
    dragEnd: (drop) => {
      const m = moveRef.current
      moveRef.current = null
      setMovingId(null)
      setPreview(null)
      // A rejected drop leaves it where it was; the store's error shakes the highlight.
      if (drop && m?.plan) useCityEditor.getState().movePlacement(m.placement.id, m.plan.cx, m.plan.cz)
    },
    roadStart: (point) => {
      const cell = pointToCell(point.x, point.z)
      const erase = useCityEditor.getState().roadTool === 'erase'
      setStroke(erase ? { kind: 'erase', last: cell, keys: new Set([roadKey(cell.cx, cell.cz)]) } : { kind: 'paint', from: cell, to: cell })
    },
    roadMove: (point) => {
      const s = strokeRef.current
      if (!s) return
      const cell = pointToCell(point.x, point.z)
      if (s.kind === 'paint') {
        if (cell.cx !== s.to.cx || cell.cz !== s.to.cz) setStroke({ ...s, to: cell })
      } else if (cell.cx !== s.last.cx || cell.cz !== s.last.cz) {
        // Every cell between two samples too, so a fast finger leaves no gaps.
        setStroke({ kind: 'erase', last: cell, keys: new Set(paintRoadLine([...s.keys], s.last, cell)) })
      }
    },
    roadEnd: (apply) => {
      const s = strokeRef.current
      setStroke(null)
      if (!apply || !s) return
      const ed = useCityEditor.getState()
      if (s.kind === 'paint') ed.paintRoad(s.from, s.to)
      else ed.eraseRoads([...s.keys])
    },
    hover: updateHover,
  })

  // Kho cards dragged onto the map: a ghost under the finger, placed (and selected) on release.
  useEffect(() => {
    const groundAt = (p: ClientPoint): GroundPoint | null => {
      if (document.elementFromPoint(p.x, p.y) !== el) return null
      const hit = pick(p.x, p.y)
      return hit.inside ? hit.point : null
    }
    return registerPaletteDropTarget({
      hover: (p) => {
        const ed = useCityEditor.getState()
        if (!p) ed.setDraggedSource(null) // cancelled
        showQuickPlace(p && groundAt(p), ed.draggedSource)
      },
      drop: (p) => {
        const ed = useCityEditor.getState()
        const source = ed.draggedSource
        const point = groundAt(p)
        ed.setDraggedSource(null)
        setPreview(null)
        if (source !== null && point) ed.dropSource(source, point.x, point.z)
      },
    })
  }, [el, pick, setPreview, showQuickPlace])

  const shown = useMemo(
    () => (movingId === null ? city.placements : city.placements.filter((p) => p.id !== movingId)),
    [city.placements, movingId],
  )
  const selected = useMemo(
    () => (selectedPlacementId === movingId ? null : (city.placements.find((p) => p.id === selectedPlacementId) ?? null)),
    [city.placements, selectedPlacementId, movingId],
  )
  const selectedCells = selected && footprintCells(sizeOf(selected.source), selected.rot)

  return (
    <>
      <CameraRig size={city.size} roadMode={roadMode} />
      <Lights size={city.size} />
      <CityGround size={city.size} />
      <Roads roads={displayRoads} />
      <Placements placements={shown} blueprints={blueprints} />
      {selected && selectedCells && (
        <FootprintMarker cx={selected.cx} cz={selected.cz} cw={selectedCells.cw} cd={selectedCells.cd} color={SELECTED} opacity={0.55} />
      )}
      <PlacementHighlight placement={selected} blueprints={blueprints} sizeOf={sizeOf} shakeKey={errorSeq} />
      {preview && <PlacementGhost source={preview.source} plan={preview.plan} blueprints={blueprints} sizeOf={sizeOf} />}
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
