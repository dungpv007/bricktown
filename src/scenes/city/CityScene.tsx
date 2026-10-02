import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { MapControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { addRoads, CELL, placementCells, scaleOf } from '../../core/city'
import { cellsOnLine, clampCell, placementCenter, planMove, planPlacement, pointToCell, type Cell, type PlacementPlan } from '../../core/cityPlan'
import { addRails, eraseRails, eraseRoads } from '../../core/rails'
import { paintRoadLine, roadKey } from '../../core/roads'
import { paintTerrain, type TerrainBrush } from '../../core/terrain'
import type { Baseplate, Blueprint, CityPlacement, CityState } from '../../core/types'
import { registerPaletteDropTarget, type ClientPoint } from '../../input/paletteDrag'
import BakedMeshes from '../../render/BakedMeshes'
import { createGhostMaterial } from '../../render/materials'
import { placementMatrix } from '../../render/placementTransform'
import { installShadowProxies } from '../../render/shadowProxies'
import { makeSizeOf, resolveRenderable } from '../../render/sources'
import { useEvictStaleBakesOnUnmount } from '../../render/useBakeEviction'
import { useApp } from '../../state/useApp'
import { onCityReplaced } from '../../state/cityReplaced'
import { useCityEditor } from '../../state/useCityEditor'
import { useGame } from '../../state/useGame'
import DevStats from '../../ui/DevStats'
import CityGround from './CityGround'
import { fitCityFrame } from './cityFraming'
import { cityScreen } from './cityScreen'
import NpcLife from './NpcLife'
import PlacementHighlight from './PlacementHighlight'
import Placements, { bakedHeight, footprintBox, PLACEHOLDER_HEIGHT } from './Placements'
import Rails from './Rails'
import Roads from './Roads'
import Terrain from './Terrain'
import { useCityGestures, type CityPick, type GroundPoint } from './useCityGestures'

const SKY = '#87ceeb'
const SHADOW_MAP_SIZE = 2048
const VALID = new THREE.Color('#3cd35a')
const INVALID = new THREE.Color('#ff3b30')
const SELECTED = '#ffd500'
/** Initial camera distance and tilt from straight down (radians). */
const START_DISTANCE = 120
const START_TILT = 0.75
/** Furthest the camera zooms out. */
const MAX_DISTANCE = 340
/** Vertical field of view (degrees). */
const FOV = 45
/**
 * Where a big town's starting view puts it (normalised screen coordinates, y up): a little inside the
 * edges, and above the Kho drawer along the bottom.
 */
const FRAME_WINDOW = { left: -0.94, right: 0.94, bottom: -0.62, top: 0.94 }
/** Start distance per stud of the tallest model, so a scaled-up giant is in view, not cut off. */
const DISTANCE_PER_HEIGHT = 3

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
    // From behind the light too: a x10 model can be taller than the light is high, and its top must
    // still cast a shadow (an orthographic shadow camera takes a negative near plane).
    cam.near = -span
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
  const t = city.terrain
  for (const key of [...city.roads, ...(city.rails ?? []), ...(t ? [...t.water, ...t.pavement, ...t.sand] : [])]) {
    const [cx, cz] = key.split(',').map(Number)
    add(cx, cz)
  }
  for (const p of city.placements) {
    const { cw, cd } = placementCells(p, sizeOf(p.source))
    add(p.cx, p.cz, cw, cd)
  }
  if (minX === Infinity) return [(city.size * CELL) / 2, (city.size * CELL) / 2]
  return [((minX + maxX) / 2) * CELL, ((minZ + maxZ) / 2) * CELL]
}

/** Height (studs) of each source's model, at size x1, looked up once per source. */
function heightLookup(blueprints: Blueprint[]): (source: string) => number {
  const heights = new Map<string, number>()
  return (source) => {
    let h = heights.get(source)
    if (h === undefined) {
      const r = resolveRenderable(source, { blueprints })
      h = r ? bakedHeight(r.baked) : PLACEHOLDER_HEIGHT
      heights.set(source, h)
    }
    return h
  }
}

/**
 * What the starting view should show (world studs): the ground corners of everything built, and the
 * top corners of every model.
 */
function framePoints(city: CityState, blueprints: Blueprint[]): Array<[number, number, number]> {
  const sizeOf = makeSizeOf({ blueprints })
  const heightOf = heightLookup(blueprints)
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  const t = city.terrain
  for (const key of [...city.roads, ...(city.rails ?? []), ...(t ? [...t.water, ...t.pavement, ...t.sand] : [])]) {
    const [cx, cz] = key.split(',').map(Number)
    minX = Math.min(minX, cx)
    minZ = Math.min(minZ, cz)
    maxX = Math.max(maxX, cx + 1)
    maxZ = Math.max(maxZ, cz + 1)
  }
  const points: Array<[number, number, number]> = []
  for (const p of city.placements) {
    const { x0, z0, x1, z1 } = footprintBox(p, sizeOf(p.source))
    const y = heightOf(p.source) * scaleOf(p)
    points.push([x0, y, z0], [x1, y, z0], [x0, y, z1], [x1, y, z1], [x0, 0, z1], [x1, 0, z1])
  }
  if (minX !== Infinity) {
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) points.push([x * CELL, 0, z * CELL])
  }
  return points
}

/**
 * How far the camera starts: the usual distance, or further back when a (scaled-up) model is so
 * tall that it would not fit the view, up to the zoom-out limit.
 */
function startDistance(city: CityState, blueprints: Blueprint[]): number {
  const heightOf = heightLookup(blueprints)
  let tallest = 0
  for (const p of city.placements) tallest = Math.max(tallest, heightOf(p.source) * scaleOf(p))
  return Math.min(MAX_DISTANCE, Math.max(START_DISTANCE, tallest * DISTANCE_PER_HEIGHT))
}

// Two fingers always pinch-zoom and pan (in both modes), so the map can still be moved when the
// screen is full of buildings, where every one-finger drag starts on a building and moves it.
const PAN_TOUCHES = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
const PAN_MOUSE = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
// Road mode: one finger / the left button paints (no mapping = controls ignore it), so the camera
// moves with two fingers / the right button.
const PAINT_TOUCHES = { TWO: THREE.TOUCH.DOLLY_PAN }
const PAINT_MOUSE = { MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

/**
 * Stops the controls' damping glide right where the camera is now (MapControls has no API for it:
 * one undamped update consumes the pending motion, then the pose is put back).
 */
function stopGlide(controls: MapControlsImpl) {
  const position = controls.object.position.clone()
  const target = controls.target.clone()
  controls.enableDamping = false
  controls.update()
  controls.object.position.copy(position)
  controls.target.copy(target)
  controls.enableDamping = true
  controls.update()
}

/**
 * Top-down-ish camera with map controls (one-finger pan, two-finger pinch zoom + pan), kept over the city.
 * It starts on the centre of what is built. A town too big for the usual view (the sample town) is
 * framed whole instead, as far as the zoom-out limit allows (a phone held upright shows its middle).
 */
function CameraRig({ size, roadMode }: { size: number; roadMode: boolean }) {
  const viewport = useThree((s) => s.size)
  const [start] = useState(() => {
    const { city, blueprints } = useGame.getState().data
    let [x, z] = contentCenter(city, blueprints)
    let distance = startDistance(city, blueprints)
    const fit = fitCityFrame(framePoints(city, blueprints), {
      fov: FOV,
      aspect: viewport.width / Math.max(1, viewport.height),
      tilt: START_TILT,
      minDistance: START_DISTANCE,
      maxDistance: MAX_DISTANCE,
      window: FRAME_WINDOW,
    })
    if (fit && fit.distance > START_DISTANCE + 1) {
      x = fit.target[0]
      z = fit.target[2]
      distance = fit.distance
    }
    const target: [number, number, number] = [x, 0, z]
    const position: [number, number, number] = [
      x,
      distance * Math.cos(START_TILT),
      z + distance * Math.sin(START_TILT),
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
      <PerspectiveCamera makeDefault position={start.position} fov={FOV} near={1} far={2000} />
      <MapControls
        ref={controls}
        makeDefault
        target={start.target}
        enableDamping
        dampingFactor={0.12}
        minDistance={25}
        maxDistance={MAX_DISTANCE}
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

  const { cw, cd } = placementCells(plan, resolved?.baseplate ?? sizeOf(source))
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
    a.plan.s === b.plan.s &&
    a.plan.error === b.plan.error)

/** A placement being dragged: which one, and the offset from the finger to its footprint centre. */
interface Move {
  placement: CityPlacement
  dx: number
  dz: number
  /** Where it would land; null while the finger is off the ground. */
  plan: PlacementPlan | null
}

/**
 * A painting stroke in progress, on the road or rail layer: painting an L from `from` to `to`, or
 * erasing every cell passed over; on the terrain: the brush on every cell passed over.
 */
type Stroke =
  | { kind: 'paint'; layer: 'road' | 'rail'; from: Cell; to: Cell }
  | { kind: 'erase'; layer: 'road' | 'rail'; last: Cell; keys: Set<string> }
  | { kind: 'terrain'; brush: TerrainBrush; last: Cell; keys: Set<string> }

interface HitBox {
  id: string
  box: THREE.Box3
}

const rayHit = new THREE.Vector3()
const projected = new THREE.Vector3()

function CityWorld() {
  const city = useGame((s) => s.data.city)
  const blueprints = useGame((s) => s.data.blueprints)
  const roadMode = useCityEditor((s) => s.roadMode)
  const selectedSource = useCityEditor((s) => s.selectedSource)
  const selectedPlacementId = useCityEditor((s) => s.selectedPlacementId)
  const errorSeq = useCityEditor((s) => s.errorSeq)
  const npcOn = useApp((s) => s.npcOn)
  const el = useThree((s) => s.gl.domElement)
  const getThree = useThree((s) => s.get)

  const sizeOf = useMemo(() => makeSizeOf({ blueprints }), [blueprints])

  // Models cast their shadows through cheap stand-ins (see render/shadowProxies).
  const gl = useThree((s) => s.gl)
  useEffect(() => installShadowProxies(gl), [gl])

  // A whole new city (the sample town, an import) gets a fresh starting view: the camera rig remounts.
  const [framing, setFraming] = useState(0)
  useEffect(() => onCityReplaced(() => setFraming((n) => n + 1)), [])

  // Road being dragged: shown merged into (or cut out of) the real roads so the auto-tiling previews live.
  const [stroke, setStrokeState] = useState<Stroke | null>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const setStroke = useCallback((next: Stroke | null) => {
    strokeRef.current = next
    setStrokeState(next)
  }, [])
  // The city as the stroke would leave it (roads, rails and terrain), drawn live; the rules that refuse
  // a whole stroke (a bad level crossing) are checked when it is released.
  const display = useMemo<CityState>(() => {
    if (!stroke) return city
    if (stroke.kind === 'terrain') return paintTerrain(city, stroke.keys, stroke.brush, sizeOf) ?? city
    if (stroke.kind === 'erase') return (stroke.layer === 'road' ? eraseRoads : eraseRails)(city, stroke.keys) ?? city
    const keys = paintRoadLine([], clampCell(stroke.from, city.size), clampCell(stroke.to, city.size))
    return stroke.layer === 'road' ? addRoads(city, keys, sizeOf) : addRails(city, keys, sizeOf)
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

  // Tap targets: footprint x model height boxes, both scaled with the placement (cheaper and easier to hit than triangles). Placements
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
      const top = heightOf(p.source) * scaleOf(p)
      return { id: p.id, box: new THREE.Box3(new THREE.Vector3(b.x0, 0, b.z0), new THREE.Vector3(b.x1, top, b.z1)) }
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
    pressPlacement: () => {
      const controls = getThree().controls as MapControlsImpl | null
      if (controls) stopGlide(controls)
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
      const { paintLayer, roadTool, terrainBrush } = useCityEditor.getState()
      const keys = new Set([roadKey(cell.cx, cell.cz)])
      if (paintLayer === 'terrain') setStroke({ kind: 'terrain', brush: terrainBrush, last: cell, keys })
      else {
        const layer = paintLayer === 'rail' ? 'rail' : 'road'
        setStroke(roadTool === 'erase' ? { kind: 'erase', layer, last: cell, keys } : { kind: 'paint', layer, from: cell, to: cell })
      }
    },
    roadMove: (point) => {
      const s = strokeRef.current
      if (!s) return
      const cell = pointToCell(point.x, point.z)
      if (s.kind === 'paint') {
        if (cell.cx !== s.to.cx || cell.cz !== s.to.cz) setStroke({ ...s, to: cell })
      } else if (cell.cx !== s.last.cx || cell.cz !== s.last.cz) {
        // Every cell on the straight line between two samples too, so a fast finger leaves no gaps.
        const keys = new Set(s.keys)
        for (const c of cellsOnLine(s.last, cell)) keys.add(roadKey(c.cx, c.cz))
        setStroke({ ...s, last: cell, keys })
      }
    },
    roadEnd: (apply) => {
      const s = strokeRef.current
      setStroke(null)
      if (!apply || !s) return
      const ed = useCityEditor.getState()
      if (s.kind === 'terrain') ed.paintTerrain([...s.keys])
      else if (s.kind === 'paint') (s.layer === 'road' ? ed.paintRoad : ed.paintRail)(s.from, s.to)
      else (s.layer === 'road' ? ed.eraseRoads : ed.eraseRails)([...s.keys])
    },
    hover: updateHover,
  })

  // For e2e specs (dev handle): the scene is live once this is set; cells project through the real camera.
  useEffect(() => {
    cityScreen.cellToClient = (cx, cz) => {
      projected.set((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL).project(getThree().camera)
      const rect = el.getBoundingClientRect()
      return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height }
    }
    return () => {
      cityScreen.cellToClient = null
    }
  }, [el, getThree])

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
  const selectedCells = selected && placementCells(selected, sizeOf(selected.source))

  return (
    <>
      <CameraRig key={framing} size={city.size} roadMode={roadMode} />
      <Lights size={city.size} />
      <CityGround size={city.size} />
      <Terrain terrain={display.terrain} />
      <Roads roads={display.roads} />
      {display.rails && <Rails rails={display.rails} roads={display.roads} shadows={false} />}
      <Placements placements={shown} blueprints={blueprints} shadowProxies />
      {/* Ambient life follows the saved city (not a stroke in progress); picking ignores it (see `pick`). */}
      {npcOn && <NpcLife city={city} blueprints={blueprints} />}
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
