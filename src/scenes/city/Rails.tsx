import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CELL } from '../../core/city'
import { parseKey } from '../../core/cellGraph'
import { deriveRoads } from '../../core/avenues'
import { railTileAt, type RailTile } from '../../core/rails'
import type { Rot } from '../../core/types'
import { useInstanceCapacity } from '../../render/instanceCapacity'

/**
 * Rail cells as track tiles: one InstancedMesh per tile type, each tile built once from a few
 * vertex-coloured boxes: grey ballast, brown sleepers, two steel rails (a curve follows a quarter
 * circle). A level crossing (a rail cell that is also a road) is a straight without ballast, sunk in
 * a dark panel on the asphalt, with red and white stripes across the road on both sides.
 * Geometry and material are shared app-wide (the drive scene draws rails too): never disposed.
 */

const BALLAST = '#9a9184'
const SLEEPER = '#6e4b2e'
const STEEL = '#c4cad2'
const PANEL = '#5d6168'
const STRIPE_RED = '#d6262b'
const STRIPE_WHITE = '#f4f4f4'
const BUFFER = '#d6262b'

const HALF = CELL / 2
/** Rails sit this far either side of the track centre (gauge 3 studs: a 6-stud train fits). */
const GAUGE_HALF = 1.5
const BALLAST_W = 5.2
const BALLAST_H = 0.3
const SLEEPER_W = 4.4
const SLEEPER_H = 0.15
const SLEEPER_D = 0.5
const RAIL_W = 0.3
const RAIL_H = 0.3
/** Sleepers per stud of track (one per stud lines them up across tiles). */
const SLEEPER_STEP = 1
const CURVE_SEGMENTS = 10

/** `crossing`: a level crossing with a street; `crossing_av`: with one half of an avenue (drawn with its partner +Z). */
type TrackTile = RailTile | 'crossing' | 'crossing_av'

interface Box {
  center: [number, number, number]
  size: [number, number, number]
  /** Turn around Y (radians), applied before moving to `center`. */
  yaw?: number
  color: string
}

/** A straight piece of track along Z from z0 to z1 (rot 0), centred on x = 0, starting at height `base`. */
function straightBoxes(z0: number, z1: number, base: number, ballast: boolean): Box[] {
  const len = z1 - z0
  const mid = (z0 + z1) / 2
  const boxes: Box[] = []
  if (ballast) boxes.push({ center: [0, BALLAST_H / 2, mid], size: [BALLAST_W, BALLAST_H, len], color: BALLAST })
  const sy = base + SLEEPER_H / 2
  for (let z = z0 + SLEEPER_STEP / 2; z < z1; z += SLEEPER_STEP) {
    boxes.push({ center: [0, sy, z], size: [SLEEPER_W, SLEEPER_H, SLEEPER_D], color: SLEEPER })
  }
  const ry = base + SLEEPER_H + RAIL_H / 2
  for (const x of [-GAUGE_HALF, GAUGE_HALF]) boxes.push({ center: [x, ry, mid], size: [RAIL_W, RAIL_H, len], color: STEEL })
  return boxes
}

/** `boxes` turned a quarter turn (Z run becomes an X run): (x, z) -> (z, -x)... as a yaw of -90 degrees. */
function turned(boxes: Box[], quarter: number): Box[] {
  const a = (quarter * Math.PI) / 2
  const c = Math.cos(a)
  const s = Math.sin(a)
  return boxes.map((b) => {
    const [x, y, z] = b.center
    // Rotation around +Y by `a` (counter-clockwise seen from above): x' = x cos + z sin, z' = -x sin + z cos.
    return { ...b, center: [x * c + z * s, y, -x * s + z * c], yaw: (b.yaw ?? 0) + a }
  })
}

/** A quarter-circle curve joining the N side (-Z) to the E side (+X): centred on the tile's NE corner. */
function curveBoxes(): Box[] {
  const boxes: Box[] = []
  const ox = HALF
  const oz = -HALF
  const r = HALF
  const step = Math.PI / 2 / CURVE_SEGMENTS
  const at = (radius: number, theta: number): [number, number] => [ox + radius * Math.cos(theta), oz + radius * Math.sin(theta)]
  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const theta = Math.PI - (i + 0.5) * step // from the N side (theta = pi) to the E side (pi / 2)
    const yaw = -theta // a box's length (local Z) along the tangent
    const chord = (radius: number) => 2 * radius * Math.sin(step / 2) + 0.05
    const [bx, bz] = at(r, theta)
    boxes.push({ center: [bx, BALLAST_H / 2, bz], size: [BALLAST_W, BALLAST_H, chord(r + BALLAST_W / 2)], yaw, color: BALLAST })
    for (const off of [-GAUGE_HALF, GAUGE_HALF]) {
      const [x, z] = at(r + off, theta)
      boxes.push({ center: [x, BALLAST_H + SLEEPER_H + RAIL_H / 2, z], size: [RAIL_W, RAIL_H, chord(r + off)], yaw, color: STEEL })
    }
  }
  // Sleepers: radial, about one per stud of the centre line.
  const sleepers = Math.round((Math.PI / 2) * r / SLEEPER_STEP)
  for (let i = 0; i < sleepers; i++) {
    const theta = Math.PI - ((i + 0.5) * (Math.PI / 2)) / sleepers
    const [x, z] = at(r, theta)
    boxes.push({ center: [x, BALLAST_H + SLEEPER_H / 2, z], size: [SLEEPER_W, SLEEPER_H, SLEEPER_D], yaw: -theta, color: SLEEPER })
  }
  return boxes
}

/** A red buffer stop across the track at z (rot 0 track), facing away from the track. */
const bufferBox = (z: number): Box => ({ center: [0, BALLAST_H + 0.5, z], size: [BALLAST_W - 1, 1, 0.6], color: BUFFER })

/** The boxes of one tile type at rot 0 (connections as for roads: end = N, straight = N-S, corner = N-E, tee = N-E-S). */
function tileBoxes(tile: TrackTile): Box[] {
  switch (tile) {
    case 'isolated':
      return [...straightBoxes(-2.5, 2.5, BALLAST_H, true), bufferBox(-2.5), bufferBox(2.5)]
    case 'end':
      return [...straightBoxes(-HALF, 1, BALLAST_H, true), bufferBox(1)]
    case 'straight':
      return straightBoxes(-HALF, HALF, BALLAST_H, true)
    case 'corner':
      return curveBoxes()
    case 'tee':
      // The straight through, plus a short arm out of the E side.
      return [...straightBoxes(-HALF, HALF, BALLAST_H, true), ...turned(straightBoxes(GAUGE_HALF, HALF, BALLAST_H, true), 1)]
    case 'cross':
      return [...straightBoxes(-HALF, HALF, BALLAST_H, true), ...turned(straightBoxes(-HALF, HALF, BALLAST_H, true), 1)]
    case 'crossing':
    case 'crossing_av': {
      // Sunk in the road: a dark panel flush over the asphalt, the rails on it, stripes either side.
      const panelTop = 0.16
      const boxes: Box[] = [{ center: [0, panelTop / 2, 0], size: [BALLAST_W, panelTop, CELL], color: PANEL }]
      const ry = panelTop + RAIL_H / 2 - 0.05
      for (const x of [-GAUGE_HALF, GAUGE_HALF]) boxes.push({ center: [x, ry, 0], size: [RAIL_W, RAIL_H, CELL], color: STEEL })
      // Warning stripes across the road (which runs along X here): between the sidewalks of a street,
      // from the kerb (-Z) to the centre line (+Z edge) on an avenue half.
      const [z0, z1] = tile === 'crossing' ? [-2.7, 2.7] : [-2.7, HALF]
      const dashes = tile === 'crossing' ? 6 : 7
      const dash = (z1 - z0) / dashes
      for (const x of [-3.2, 3.2]) {
        for (let i = 0; i < dashes; i++) {
          const z = z0 + dash * (i + 0.5)
          boxes.push({ center: [x, 0.13, z], size: [0.5, 0.06, dash], color: i % 2 === 0 ? STRIPE_RED : STRIPE_WHITE })
        }
      }
      return boxes
    }
  }
}

function buildTileGeometry(tile: TrackTile): THREE.BufferGeometry {
  const color = new THREE.Color()
  const parts = tileBoxes(tile).map(({ center, size, yaw, color: hex }) => {
    const g = new THREE.BoxGeometry(...size).toNonIndexed()
    if (yaw) g.rotateY(yaw)
    g.translate(...center)
    color.set(hex)
    const n = g.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.deleteAttribute('uv')
    return g
  })
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  if (!merged) throw new Error(`rail tile ${tile}: merge failed`)
  return merged
}

const tileGeometries = new Map<TrackTile, THREE.BufferGeometry>()
function tileGeometry(tile: TrackTile): THREE.BufferGeometry {
  let g = tileGeometries.get(tile)
  if (!g) {
    g = buildTileGeometry(tile)
    tileGeometries.set(tile, g)
  }
  return g
}
const railMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 })

interface TileInstance {
  cx: number
  cz: number
  rot: Rot
}

const MIN_CAPACITY = 16
const tmpMatrix = new THREE.Matrix4()

function TileMesh({ tile, instances, shadows }: { tile: TrackTile; instances: TileInstance[]; shadows: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = useInstanceCapacity(instances.length, MIN_CAPACITY)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    instances.forEach((t, i) => {
      tmpMatrix.makeRotationY((t.rot * Math.PI) / 2)
      tmpMatrix.setPosition((t.cx + 0.5) * CELL, 0, (t.cz + 0.5) * CELL)
      mesh.setMatrixAt(i, tmpMatrix)
    })
    mesh.count = instances.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances, capacity])
  // Shared geometry/material go in through `args`: R3F's unmount dispose only frees the instance buffers.
  return <instancedMesh key={capacity} ref={ref} args={[tileGeometry(tile), railMaterial, capacity]} castShadow={shadows} receiveShadow />
}

/**
 * All rail cells ("cx,cz" keys), auto-tiled from their rail neighbours; cells also in `roads` are level
 * crossings. `shadows: false` skips the track's own (very flat) shadow, for views from high above.
 */
export default function Rails({ rails, roads, shadows = true }: { rails: string[]; roads: string[]; shadows?: boolean }) {
  const byTile = useMemo(() => {
    const set = new Set(rails)
    const roadSet = new Set(roads)
    const shapes = roads.some((k) => set.has(k)) ? deriveRoads(roadSet) : null
    const out = new Map<TrackTile, TileInstance[]>()
    for (const key of set) {
      const { cx, cz } = parseKey(key)
      const { tile, rot } = railTileAt(set, cx, cz)
      const road = shapes?.get(key)
      let kind: TrackTile = tile
      let r: Rot = rot
      if (road?.kind === 'avenue') {
        // Turned so the drawn partner side (+Z) faces the avenue's other half.
        kind = 'crossing_av'
        r = ((2 - road.partner + 4) & 3) as Rot
      } else if (road) kind = 'crossing'
      let list = out.get(kind)
      if (!list) out.set(kind, (list = []))
      list.push({ cx, cz, rot: r })
    }
    return [...out]
  }, [rails, roads])

  return (
    <group>
      {byTile.map(([tile, instances]) => (
        <TileMesh key={tile} tile={tile} instances={instances} shadows={shadows} />
      ))}
    </group>
  )
}
