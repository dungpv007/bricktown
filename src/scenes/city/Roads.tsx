import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { roadTiles, type RoadTileInstance } from '../../core/avenues'
import { CELL } from '../../core/city'
import type { RoadTile } from '../../core/roads'
import { useInstanceCapacity } from '../../render/instanceCapacity'

/**
 * Road cells as flat tiles: one InstancedMesh per tile variant (see `roadTiles` in core/avenues), each
 * built once from a few vertex-coloured boxes. Streets (1-wide): asphalt, sidewalks on the closed
 * sides and dashed centre lines along the connected arms, exactly as before avenues. Avenue halves: a
 * double yellow line on the edge shared with the other half, a dashed white lane divider, a kerb on
 * the outer edge; at a junction the lines stop and zebras cross. Intersection boxes: kerbs, zebras
 * across their arms. Plazas (3+ wide): plain asphalt and kerbs. Instance matrices are rebuilt only
 * when `roads` changes.
 */

const ASPHALT = '#4a4f57'
const SIDEWALK = '#c9c5bb'
const MARKING = '#f4f4f4'
const YELLOW = '#f2c230'

const HALF = CELL / 2
const ASPHALT_H = 0.1
const SIDEWALK_W = 1.25
const SIDEWALK_H = 0.3
const MARK_H = 0.02
const MARK_W = 0.25
const DASH_LEN = 1
/** Dash centres along an arm, measured from the tile centre; period 2 keeps dashes even across tiles. */
const DASHES = [1, 3]
/** Avenue lane divider: halfway across the asphalt between the kerb and the centre line. */
const DIVIDER_X = (-HALF + SIDEWALK_W + HALF) / 2
/** Each half's line of the double yellow sits this far (its centre) from the shared edge. */
const YELLOW_INSET = 0.2 + MARK_W / 2
/** Zebra bars: width, pitch, and the depth of the band (which starts 0.3 inside the cell edge). */
const ZEBRA_W = 0.6
const ZEBRA_STEP = 1.2
const ZEBRA_LEN = 1.4
const ZEBRA_IN = 0.3 + ZEBRA_LEN / 2

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

/** The boxes making up one street tile type, centred on the origin with its top surface just above y = 0. */
function streetBoxes(tile: RoadTile): Box[] {
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

const SWY = SIDEWALK_H / 2
const EDGE = HALF - SIDEWALK_W / 2
const MARK_Y = ASPHALT_H + MARK_H / 2
const asphalt = (): Box => ({ center: [0, ASPHALT_H / 2, 0], size: [CELL, ASPHALT_H, CELL], color: ASPHALT })
/** A kerb strip along side `dir` of the cell. */
function kerb(dir: Dir): Box {
  const [ox, oz] = OUT[dir]
  const size: [number, number, number] = ox === 0 ? [CELL, SIDEWALK_H, SIDEWALK_W] : [SIDEWALK_W, SIDEWALK_H, CELL]
  return { center: [ox * EDGE, SWY, oz * EDGE], size, color: SIDEWALK }
}
const cornerSquare = (sx: number, sz: number): Box => ({
  center: [sx * EDGE, SWY, sz * EDGE],
  size: [SIDEWALK_W, SIDEWALK_H, SIDEWALK_W],
  color: SIDEWALK,
})
/** Zebra bars lying along Z (a zebra across a road that runs along Z), the band centred at z, one bar per x. */
const barsAlongZ = (z: number, xs: number[]): Box[] =>
  xs.map((x) => ({ center: [x, MARK_Y, z], size: [ZEBRA_W, MARK_H, ZEBRA_LEN], color: MARKING }))
const barsAlongX = (x: number, zs: number[]): Box[] =>
  zs.map((z) => ({ center: [x, MARK_Y, z], size: [ZEBRA_LEN, MARK_H, ZEBRA_W], color: MARKING }))
/** Bar centres from `from`, stepping by `step`, while a whole bar stays on the near side of `limit`. */
function barPositions(from: number, step: number, limit: number): number[] {
  const out: number[] = []
  const fits = (v: number) => (step > 0 ? v + ZEBRA_W / 2 <= limit + 1e-6 : v - ZEBRA_W / 2 >= limit - 1e-6)
  for (let v = from; fits(v); v += step) out.push(v)
  return out
}
/** Across a street's asphalt (between its kerbs), centred on the street. */
const STREET_BARS = barPositions(-2 * ZEBRA_STEP, ZEBRA_STEP, HALF - SIDEWALK_W)
/** Across one avenue half: from the centre line (+X) out to the kerb, so the two halves' bars keep one pitch. */
const HALF_BARS = barPositions(HALF - ZEBRA_W, -ZEBRA_STEP, -HALF + SIDEWALK_W)
/** Across a box's W arm: from the box's middle line (-Z) to the arm's kerb (+Z). */
const ARM_BARS = barPositions(-HALF + ZEBRA_W, ZEBRA_STEP, HALF - SIDEWALK_W)

/**
 * West half of an avenue running N-S (partner E: the centre line on the E edge). `n` / `s`: road goes
 * on that way; `arm`: a road joins on the W side; `junction`: cross traffic here (lines stop, zebras).
 */
function avenueBoxes(n: boolean, s: boolean, arm: boolean, junction: boolean): Box[] {
  const boxes = [asphalt()]
  if (!arm) boxes.push(kerb('W'))
  if (!n) boxes.push(kerb('N'))
  if (!s) boxes.push(kerb('S'))
  if (arm && n) boxes.push(cornerSquare(-1, -1))
  if (arm && s) boxes.push(cornerSquare(-1, 1))
  if (junction) {
    if (n) boxes.push(...barsAlongZ(-HALF + ZEBRA_IN, HALF_BARS))
    if (s) boxes.push(...barsAlongZ(HALF - ZEBRA_IN, HALF_BARS))
    if (arm) boxes.push(...barsAlongX(-HALF + ZEBRA_IN, STREET_BARS))
    return boxes
  }
  const z0 = n ? -HALF : -HALF + SIDEWALK_W
  const z1 = s ? HALF : HALF - SIDEWALK_W
  boxes.push({ center: [HALF - YELLOW_INSET, MARK_Y, (z0 + z1) / 2], size: [MARK_W, MARK_H, z1 - z0], color: YELLOW })
  for (const z of [-3, -1, 1, 3]) {
    if ((z < -2 && !n) || (z > 2 && !s)) continue
    boxes.push({ center: [DIVIDER_X, MARK_Y, z], size: [MARK_W, MARK_H, DASH_LEN], color: MARKING })
  }
  return boxes
}

/** SW quarter of an intersection box (the box goes on N and E). `s` / `w`: an arm leaves that side. */
function boxBoxes(s: boolean, w: boolean, zebra: boolean): Box[] {
  const boxes = [asphalt()]
  if (!s) boxes.push(kerb('S'))
  if (!w) boxes.push(kerb('W'))
  if (s && w) boxes.push(cornerSquare(-1, 1))
  if (zebra && s) boxes.push(...barsAlongZ(HALF - ZEBRA_IN, HALF_BARS))
  if (zebra && w) boxes.push(...barsAlongX(-HALF + ZEBRA_IN, ARM_BARS))
  return boxes
}

/** Plain pavement: kerbs on the closed sides (mask bits N E S W), kerb corners (bits NE SE SW NW). */
function plazaBoxes(mask: number, corners: number): Box[] {
  const boxes = [asphalt()]
  const sides: Dir[] = ['N', 'E', 'S', 'W']
  sides.forEach((d, i) => {
    if ((mask & (1 << i)) === 0) boxes.push(kerb(d))
  })
  const at: Array<[number, number]> = [[1, -1], [1, 1], [-1, 1], [-1, -1]]
  at.forEach(([sx, sz], i) => {
    if (corners & (1 << i)) boxes.push(cornerSquare(sx, sz))
  })
  return boxes
}

const flag = (s: string, i: number) => s[i] === '1'

function variantBoxes(variant: string): Box[] {
  const [kind, a, b] = variant.split(':')
  switch (kind) {
    case 'street':
      return streetBoxes(a as RoadTile)
    case 'avenue':
      return avenueBoxes(flag(a, 0), flag(a, 1), flag(a, 2), flag(a, 3))
    case 'box':
      return boxBoxes(flag(a, 0), flag(a, 1), flag(a, 2))
    case 'plaza':
      return plazaBoxes(Number(a), Number(b))
    default:
      throw new Error(`road tile ${variant}: unknown`)
  }
}

function buildTileGeometry(variant: string): THREE.BufferGeometry {
  const color = new THREE.Color()
  const parts = variantBoxes(variant).map(({ center, size, color: hex }) => {
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
  if (!merged) throw new Error(`road tile ${variant}: merge failed`)
  return merged
}

// Shared app-wide (also used by the drive scene and the menu backdrop): never disposed.
const tileGeometries = new Map<string, THREE.BufferGeometry>()
function tileGeometry(variant: string): THREE.BufferGeometry {
  let g = tileGeometries.get(variant)
  if (!g) {
    g = buildTileGeometry(variant)
    tileGeometries.set(variant, g)
  }
  return g
}
const roadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })

const MIN_CAPACITY = 16

const tmpMatrix = new THREE.Matrix4()

function TileMesh({ variant, instances }: { variant: string; instances: RoadTileInstance[] }) {
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
  return <instancedMesh key={capacity} ref={ref} args={[tileGeometry(variant), roadMaterial, capacity]} receiveShadow />
}

/** All road cells ("cx,cz" keys), each drawn from its shape: street, avenue half, box quarter or plaza. */
export default function Roads({ roads }: { roads: string[] }) {
  const byVariant = useMemo(() => {
    const out = new Map<string, RoadTileInstance[]>()
    for (const t of roadTiles(roads)) {
      let list = out.get(t.variant)
      if (!list) out.set(t.variant, (list = []))
      list.push(t)
    }
    return [...out]
  }, [roads])

  return (
    <group>
      {byVariant.map(([variant, instances]) => (
        <TileMesh key={variant} variant={variant} instances={instances} />
      ))}
    </group>
  )
}
