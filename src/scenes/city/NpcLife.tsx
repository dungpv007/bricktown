import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTemplate } from '../../content/templates'
import { bakeBricks, bakedGeometries, bakeShadowBricks } from '../../core/bake'
import { CAR_TEMPLATE_IDS, pedestrianStyles, TRAIN_CARRIAGE_IDS, TRAIN_ENGINE_IDS } from '../../core/npc/looks'
import { buildNetwork, MAX_CARS, MAX_PEDS, MAX_TRAINS, RAIL_Y, ROAD_Y, type NpcNetwork } from '../../core/npc/network'
import { NpcSim } from '../../core/npc/sim'
import { getFigureGeometry } from '../../core/parts/figureGeometry'
import type { Blueprint, CityState } from '../../core/types'
import { installLiveFigureKeys } from '../../render/liveFigures'
import { useFrameRequest } from '../../render/frameDriver'
import { bakedMaterials, castsShadow } from '../../render/materials'
import { nightMaterials, nightState } from '../../render/nightGlow'
import { bakedModelBox } from '../../render/placementTransform'
import { isShadowProxy, registerShadowProxy } from '../../render/shadowProxies'
import { makeSizeOf } from '../../render/sources'
import { npcStats } from '../../state/npcStats'

/**
 * Ambient City life: cars, trains and pedestrians from the pure simulation (core/npc), drawn with
 * shared geometry: one InstancedMesh per model and material kind, whose instance matrices one
 * `useFrame` rewrites (no allocations per frame). Vehicles are ready-made templates from the shared
 * bake cache, pedestrians a few figure presets from the shared figure cache; neither is disposed
 * here (R3F's unmount only frees the instance buffers). NPCs are never hit by a raycast, so taps and
 * drags go to the city as if they were not there.
 */

interface NpcPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  shadow: boolean
  /** A shadow stand-in: drawn into the shadow map only (see render/shadowProxies). */
  proxy?: boolean
}

interface NpcModel {
  parts: NpcPart[]
  /** Model space -> NPC space: centred on the origin, standing on y = 0, scaled down to fit. */
  local: THREE.Matrix4
  /** Length (studs) once scaled. */
  length: number
  /** Templates face -Z, figures +Z. */
  facesPlusZ: boolean
}

/** Cars fit their lane (see core/npc/geometry LANE), trains the track, people the sidewalks. */
const CAR_FIT = { width: 2.5, length: 10, scale: 0.65 }
/**
 * The train templates' wheels are 5 studs apart (centre to centre, x 1 and 6); drawn at 0.6 they
 * are 3 apart, right on the two rails (scenes/city/Rails: GAUGE_HALF 1.5), and the train is about
 * the size the shrunk cars are.
 */
const TRAIN_FIT = { width: 3.6, length: 9.6, scale: 0.6 }
/** A road vehicle standing in for a train (no train templates yet) stays car-sized. */
const STAND_IN_FIT = { width: 3.4, length: 8, scale: 0.65 }
const PED_SCALE = 0.75
/** The walk: a little bob and a sway from foot to foot. */
const BOB = 0.12
const SWAY = 0.07
/** Edits come in bursts (a road stroke, a drag): rebuild the networks once things settle. */
const REBUILD_DELAY = 300
const SEED = 2026
/** Headlights: half the gap between a car's two lamps (studs). */
const HEADLIGHT_SPREAD = 0.75

const modelCache = new Map<string, NpcModel | null>()

/** A template drawn small enough to fit `fit`, or null when this version has no such template. */
function templateModel(id: string, fit: { width: number; length: number; scale: number }, shadowProxy = false): NpcModel | null {
  const key = `${id}:${fit.width}:${fit.length}:${fit.scale}:${shadowProxy}`
  if (modelCache.has(key)) return modelCache.get(key) ?? null
  let model: NpcModel | null = null
  const tpl = getTemplate(id)
  if (tpl) {
    // Shared bake cache; templates are always live bakes, so the cache never frees them.
    const baked = bakeBricks(tpl.bricks)
    const box = bakedModelBox(baked)
    if (box) {
      const [x0, y0, z0] = box.min
      const [x1, , z1] = box.max
      const k = Math.min(fit.scale, fit.width / Math.max(1e-3, x1 - x0), fit.length / Math.max(1e-3, z1 - z0))
      const parts: NpcPart[] = bakedGeometries(baked).map(([kind, geometry]) => ({
        geometry,
        material: bakedMaterials[kind],
        shadow: !shadowProxy && castsShadow(kind),
      }))
      // The shadow from a stud-less stand-in: a fraction of the triangles (shared cache, never disposed).
      if (shadowProxy) parts.push({ geometry: bakeShadowBricks(tpl.bricks), material: bakedMaterials.opaque, shadow: true, proxy: true })
      model = {
        parts,
        local: new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(x0 + x1) / 2, -y0, -(z0 + z1) / 2)),
        length: (z1 - z0) * k,
        facesPlusZ: false,
      }
    }
  }
  modelCache.set(key, model)
  return model
}

const firstTrainModel = (ids: readonly string[]) => {
  for (const id of ids) {
    const m = templateModel(id, id.startsWith('train_') ? TRAIN_FIT : STAND_IN_FIT)
    if (m) return m
  }
  return null
}

/** One pedestrian look, from the shared figure cache (its keys are always live, see render/liveFigures). */
function figureModel(index: number): NpcModel {
  const g = getFigureGeometry(pedestrianStyles()[index])
  if (!g.body.boundingBox) g.body.computeBoundingBox()
  const y0 = g.body.boundingBox?.min.y ?? 0
  return {
    parts: [
      { geometry: g.body, material: bakedMaterials.opaque, shadow: false },
      { geometry: g.print, material: bakedMaterials.print, shadow: false },
    ],
    local: new THREE.Matrix4().makeScale(PED_SCALE, PED_SCALE, PED_SCALE).multiply(new THREE.Matrix4().makeTranslation(0, -y0, 0)),
    length: 1,
    facesPlusZ: true,
  }
}

/** A model and how many of it can be on screen. */
interface Slot {
  model: NpcModel
  capacity: number
  shadow: boolean
}

interface Looks {
  cars: Slot[]
  engine: Slot | null
  carriage: Slot | null
  peds: Slot[]
  trainLength: number
}

function npcLooks(): Looks {
  installLiveFigureKeys()
  const cars = CAR_TEMPLATE_IDS.map((id) => templateModel(id, CAR_FIT))
    .filter((m): m is NpcModel => m !== null)
    // No city life casts a shadow: the shadow map stays static (redrawn only when the city changes,
    // see render/staticShadows) while cars, trains and people move; they read fine without one.
    .map((model) => ({ model, capacity: MAX_CARS, shadow: false }))
  const engineModel = firstTrainModel(TRAIN_ENGINE_IDS)
  const carriageModel = firstTrainModel(TRAIN_CARRIAGE_IDS)
  const peds = pedestrianStyles().map((_, i) => ({ model: figureModel(i), capacity: MAX_PEDS, shadow: false }))
  return {
    cars,
    engine: engineModel && { model: engineModel, capacity: MAX_TRAINS, shadow: false },
    carriage: carriageModel && { model: carriageModel, capacity: MAX_TRAINS * 2, shadow: false },
    peds,
    trainLength: Math.max(engineModel?.length ?? 0, carriageModel?.length ?? 0) || 9,
  }
}

const noRaycast: THREE.Mesh['raycast'] = () => {}

const tmpMatrix = new THREE.Matrix4()
const tmpRoll = new THREE.Matrix4()

/** Writes instance `i` of every mesh of a slot: at (x, y, z), heading (hx, hz), leaning `roll`. */
function place(meshes: Array<THREE.InstancedMesh | null>, model: NpcModel, i: number, x: number, y: number, z: number, hx: number, hz: number, roll = 0) {
  const yaw = model.facesPlusZ ? Math.atan2(hx, hz) : Math.atan2(-hx, -hz)
  tmpMatrix.makeRotationY(yaw)
  if (roll !== 0) tmpMatrix.multiply(tmpRoll.makeRotationZ(roll))
  tmpMatrix.setPosition(x, y, z)
  tmpMatrix.multiply(model.local)
  for (const mesh of meshes) mesh?.setMatrixAt(i, tmpMatrix)
}

function flush(meshes: Array<THREE.InstancedMesh | null>, count: number) {
  for (const mesh of meshes) {
    if (!mesh) continue
    mesh.count = count
    if (!isShadowProxy(mesh)) mesh.visible = count > 0 // a stand-in's visibility belongs to render/shadowProxies
    if (count > 0) mesh.instanceMatrix.needsUpdate = true
  }
}

function PartMesh({ part, slot, register }: { part: NpcPart; slot: Slot; register: (mesh: THREE.InstancedMesh | null) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => (part.proxy && ref.current ? registerShadowProxy(ref.current) : undefined), [part.proxy])
  return (
    <instancedMesh
      ref={(mesh) => {
        ref.current = mesh
        register(mesh)
      }}
      args={[part.geometry, part.material, slot.capacity]}
      castShadow={slot.shadow && part.shadow}
      frustumCulled={false}
      raycast={noRaycast}
    />
  )
}

function SlotMeshes({ slot, register }: { slot: Slot; register: (part: number, mesh: THREE.InstancedMesh | null) => void }) {
  return (
    <>
      {slot.model.parts.map((part, i) => (
        <PartMesh key={i} part={part} slot={slot} register={(mesh) => register(i, mesh)} />
      ))}
    </>
  )
}

/** Fewer cars and people (graphics "ít"): the network's targets times `density`, at least one of each kind there is room for. */
export function thinNetwork(net: NpcNetwork, density: number): NpcNetwork {
  if (density >= 1) return net
  const thin = (n: number) => (n === 0 ? 0 : Math.max(1, Math.round(n * density)))
  return { ...net, carTarget: thin(net.carTarget), pedTarget: thin(net.pedTarget) }
}

export default function NpcLife({ city, blueprints, density = 1 }: { city: CityState; blueprints: Blueprint[]; density?: number }) {
  const looks = useMemo(() => npcLooks(), [])
  // Slots in a fixed order: the cars, the engine, the carriage, the pedestrians.
  const slots = useMemo(
    () => [...looks.cars, ...(looks.engine ? [looks.engine] : []), ...(looks.carriage ? [looks.carriage] : []), ...looks.peds],
    [looks],
  )
  const meshes = useRef<Array<Array<THREE.InstancedMesh | null>>>([])
  const sim = useRef<NpcSim | null>(null)
  const hidden = useRef(false)
  const counts = useRef(new Int32Array(0))
  // Render on demand: keep frames coming (at the graphics frame cap) while anyone lives in this city.
  const [alive, setAlive] = useState(false)
  useFrameRequest(alive, 'motion')
  // Night: two headlight sprites in front of every car (one Points draw call, hidden by day).
  const headlights = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_CARS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    return g
  }, [])
  useEffect(() => () => headlights.dispose(), [headlights])

  useEffect(() => {
    const s =
      sim.current ??
      (sim.current = new NpcSim({
        seed: SEED,
        carLengths: looks.cars.map((c) => c.model.length),
        trainLength: looks.trainLength,
        pedStyles: looks.peds.length,
      }))
    const build = () => {
      const net = thinNetwork(buildNetwork(city, makeSizeOf({ blueprints })), density)
      s.setNetwork(net)
      setAlive(net.carTarget + net.pedTarget + net.trains.length > 0)
    }
    if (!s.net) {
      build()
      return
    }
    const id = window.setTimeout(build, REBUILD_DELAY)
    return () => window.clearTimeout(id)
  }, [city, blueprints, looks, density])

  // Paused while the app is hidden (no catching up on return).
  useEffect(() => {
    const update = () => {
      hidden.current = document.hidden
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(
    () => () => {
      npcStats.count = 0
      npcStats.frameMs = 0
    },
    [],
  )

  useFrame(({ gl }, delta) => {
    const s = sim.current
    if (!s || !s.net || hidden.current) return
    const t0 = performance.now()
    s.step(delta)
    if (counts.current.length !== slots.length) counts.current = new Int32Array(slots.length)
    const n = counts.current
    n.fill(0)
    const all = meshes.current
    const carSlots = looks.cars.length
    for (const car of s.cars) {
      const m = car.variant
      const slot = slots[m]
      if (!slot) continue
      place(all[m] ?? [], slot.model, n[m]++, car.x, ROAD_Y, car.z, car.hx, car.hz)
    }
    const engine = looks.engine ? carSlots : -1
    const carriage = looks.carriage ? carSlots + (looks.engine ? 1 : 0) : -1
    for (const train of s.trains) {
      train.cars.forEach((p, i) => {
        const m = i === 0 || carriage < 0 ? engine : carriage
        if (m < 0 || n[m] >= slots[m].capacity) return
        place(all[m] ?? [], slots[m].model, n[m]++, p.x, RAIL_Y, p.z, p.hx, p.hz)
      })
    }
    const pedBase = slots.length - looks.peds.length
    for (const p of s.peds) {
      const m = pedBase + p.style
      if (!slots[m]) continue
      const walking = p.idle <= 0
      const bob = walking ? Math.abs(Math.sin(p.phase)) * BOB : 0
      place(all[m] ?? [], slots[m].model, n[m]++, p.x, p.y + bob, p.z, p.hx, p.hz, walking ? Math.sin(p.phase) * SWAY : 0)
    }
    for (let m = 0; m < slots.length; m++) flush(all[m] ?? [], n[m])
    let lit = 0
    if (nightState.night > 0.02) {
      const attr = headlights.getAttribute('position') as THREE.BufferAttribute
      const pos = attr.array as Float32Array
      for (const car of s.cars) {
        if (lit >= MAX_CARS * 2) break
        const half = (looks.cars[car.variant]?.model.length ?? 6) / 2
        const fx = car.x + car.hx * half
        const fz = car.z + car.hz * half
        const sx = car.hz * HEADLIGHT_SPREAD
        const sz = car.hx * HEADLIGHT_SPREAD
        const i = lit * 3
        pos[i] = fx - sx
        pos[i + 1] = ROAD_Y + 1
        pos[i + 2] = fz + sz
        pos[i + 3] = fx + sx
        pos[i + 4] = ROAD_Y + 1
        pos[i + 5] = fz - sz
        lit += 2
      }
      attr.needsUpdate = true
    }
    headlights.setDrawRange(0, lit)
    npcStats.count = s.count()
    npcStats.calls = gl.info.render.calls
    npcStats.triangles = gl.info.render.triangles
    npcStats.frameMs = npcStats.frameMs * 0.95 + (performance.now() - t0) * 0.05
  })

  return (
    <group>
      <points geometry={headlights} material={nightMaterials().headlight} frustumCulled={false} raycast={noRaycast} renderOrder={2} dispose={null} />
      {slots.map((slot, m) => (
        <SlotMeshes
          key={m}
          slot={slot}
          register={(part, mesh) => {
            const list = (meshes.current[m] ??= [])
            list[part] = mesh
          }}
        />
      ))}
    </group>
  )
}
