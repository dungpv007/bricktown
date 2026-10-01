import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CELL } from '../../core/city'
import { roadTileAt, type RoadTile } from '../../core/roads'
import type { Rot } from '../../core/types'

/**
 * Road cells as flat tiles: one InstancedMesh per tile type (straight, corner, ...), each tile built
 * once from a few vertex-coloured boxes: asphalt, sidewalks on the open sides and dashed centre
 * lines along the connected arms. Instance matrices are rebuilt only when `roads` changes.
 */

const ASPHALT = '#4a4f57'
const SIDEWALK = '#c9c5bb'
const MARKING = '#f4f4f4'

const HALF = CELL / 2
const ASPHALT_H = 0.1
const SIDEWALK_W = 1.25
const SIDEWALK_H = 0.3
const MARK_H = 0.02
const MARK_W = 0.25
const DASH_LEN = 1
/** Dash centres along an arm, measured from the tile centre; period 2 keeps dashes even across tiles. */
const DASHES = [1, 3]

// Connection directions at rot 0 (N = -Z, E = +X, S = +Z, W = -X), matching core/roads.ts.
type Dir = 'N' | 'E' | 'S' | 'W'
const ARMS: Record<RoadTile, Dir[]> = {
  isolated: [],
  end: ['N'],
  straight: ['N', 'S'],
  corner: ['N', 'E'],
  tee: ['N', 'E', 'S'],
  cross: ['N', 'E', 'S', 'W'],
}
/** Unit vector (x, z) pointing out of the tile through each side. */
const OUT: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

interface Box {
  center: [number, number, number]
  size: [number, number, number]
  color: string
}

/** The boxes making up one tile type, centred on the origin with its top surface just above y = 0. */
function tileBoxes(tile: RoadTile): Box[] {
  const arms = new Set(ARMS[tile])
  const boxes: Box[] = [{ center: [0, ASPHALT_H / 2, 0], size: [CELL, ASPHALT_H, CELL], color: ASPHALT }]
  const swY = SIDEWALK_H / 2
  const edge = HALF - SIDEWALK_W / 2

  // Sidewalk along every closed side.
  for (const dir of ['N', 'E', 'S', 'W'] as Dir[]) {
    if (arms.has(dir)) continue
    const [ox, oz] = OUT[dir]
    const size: [number, number, number] = ox === 0 ? [CELL, SIDEWALK_H, SIDEWALK_W] : [SIDEWALK_W, SIDEWALK_H, CELL]
    boxes.push({ center: [ox * edge, swY, oz * edge], size, color: SIDEWALK })
  }
  // Corner squares where two open sides meet, continuing the neighbours' sidewalks.
  const corners: Array<[Dir, Dir]> = [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']]
  for (const [a, b] of corners) {
    if (!arms.has(a) || !arms.has(b)) continue
    const x = (OUT[a][0] + OUT[b][0]) * edge
    const z = (OUT[a][1] + OUT[b][1]) * edge
    boxes.push({ center: [x, swY, z], size: [SIDEWALK_W, SIDEWALK_H, SIDEWALK_W], color: SIDEWALK })
  }
  // Dashed centre line on each arm; junctions keep their middle clear.
  const junction = arms.size >= 3
  const markY = ASPHALT_H + MARK_H / 2
  for (const dir of arms) {
    const [ox, oz] = OUT[dir]
    for (const d of DASHES) {
      if (junction && d < 2) continue
      const size: [number, number, number] = ox === 0 ? [MARK_W, MARK_H, DASH_LEN] : [DASH_LEN, MARK_H, MARK_W]
      boxes.push({ center: [ox * d, markY, oz * d], size, color: MARKING })
    }
  }
  return boxes
}

function buildTileGeometry(tile: RoadTile): THREE.BufferGeometry {
  const color = new THREE.Color()
  const parts = tileBoxes(tile).map(({ center, size, color: hex }) => {
    const g = new THREE.BoxGeometry(...size).toNonIndexed()
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
  if (!merged) throw new Error(`road tile ${tile}: merge failed`)
  return merged
}

// Shared app-wide (also used by the drive scene): never disposed.
const tileGeometries = new Map<RoadTile, THREE.BufferGeometry>()
function tileGeometry(tile: RoadTile): THREE.BufferGeometry {
  let g = tileGeometries.get(tile)
  if (!g) {
    g = buildTileGeometry(tile)
    tileGeometries.set(tile, g)
  }
  return g
}
const roadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })

interface TileInstance {
  cx: number
  cz: number
  rot: Rot
}

const MIN_CAPACITY = 16
function capacityFor(count: number): number {
  let cap = MIN_CAPACITY
  while (cap < count) cap *= 2
  return cap
}

const tmpMatrix = new THREE.Matrix4()

function TileMesh({ tile, instances }: { tile: RoadTile; instances: TileInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = capacityFor(instances.length)
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
  return <instancedMesh key={capacity} ref={ref} args={[tileGeometry(tile), roadMaterial, capacity]} receiveShadow />

}

/** All road cells ("cx,cz" keys), auto-tiled from their neighbours. */
export default function Roads({ roads }: { roads: string[] }) {
  const byTile = useMemo(() => {
    const set = new Set(roads)
    const out = new Map<RoadTile, TileInstance[]>()
    for (const key of set) {
      const [cx, cz] = key.split(',').map(Number)
      const { tile, rot } = roadTileAt(set, cx, cz)
      let list = out.get(tile)
      if (!list) out.set(tile, (list = []))
      list.push({ cx, cz, rot })
    }
    return [...out]
  }, [roads])

  return (
    <group>
      {byTile.map(([tile, instances]) => (
        <TileMesh key={tile} tile={tile} instances={instances} />
      ))}
    </group>
  )
}
