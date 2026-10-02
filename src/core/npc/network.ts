import { coveredCells, inGrid, type SourceSize } from '../city'
import { parseKey, type CellGraph } from '../cellGraph'
import { railGraph, railLines } from '../rails'
import { DIRS, roadKey } from '../roads'
import type { CityState } from '../types'
import { DX, DZ, HALF, cellCenter, railPolyline, type Dir, type Polyline } from './geometry'

/**
 * The networks the NPCs move on, built from one city state (pure; rebuilt when roads, rails,
 * terrain or placements change): the road cells cars drive through, one path per train, and the
 * waypoint graph pedestrians walk (pavement cells and the sidewalks of road cells).
 */

type SizeOf = (source: string) => SourceSize

export const MAX_CARS = 14
export const MAX_TRAINS = 3
export const MAX_PEDS = 20
/** Road cells per car, pavement cells per pedestrian, road cells per pedestrian (sidewalks). */
const ROADS_PER_CAR = 6
const PAVEMENT_PER_PED = 4
const ROADS_PER_PED = 10
/** A rail line needs this many cells to get a train. */
export const MIN_TRAIN_CELLS = 8

/** Heights (studs) of what NPCs stand on: asphalt, sidewalk, pavement plate. */
export const ROAD_Y = 0.1
export const SIDEWALK_Y = 0.3
export const PAVEMENT_Y = 0.06
/** Where train wheels sit: the top of the rails (ballast 0.3 + sleeper 0.15 + rail 0.3, see scenes/city/Rails). */
export const RAIL_Y = 0.75
/** Width of the sidewalk strips the road tiles draw on their closed sides. */
const SIDEWALK_W = 1.25
/** Sidewalk corner waypoints sit in the middle of the strips. */
const CORNER = HALF - SIDEWALK_W / 2

export interface RoadNet {
  keys: string[]
  index: Map<string, number>
  cx: Int32Array
  cz: Int32Array
  /** Neighbour cell index per direction (4 per cell, N E S W), -1 for none. */
  nb: Int32Array
  degree: Uint8Array
  /** 1 for a level crossing (a road cell that is also a rail). */
  crossing: Uint8Array
  /** Cells cars may spawn on: in a road piece of 2+ cells, not a level crossing. */
  spawnable: number[]
}

export interface TrainLine {
  /** Identity of the line (its cells in path order), to keep a train across rebuilds. */
  key: string
  path: Polyline
  /** A closed loop (the train circles); otherwise it shuttles end to end. */
  loop: boolean
}

export interface PedGraph {
  keys: string[]
  index: Map<string, number>
  x: Float64Array
  z: Float64Array
  y: Float64Array
  /** How far a walker may aim off the waypoint (stays on the strip / inside the cell). */
  jitter: Float64Array
  links: number[][]
  /** Links (`a * n + b`, both ways) that cross a road at a junction. */
  crossings: Set<number>
  /** Waypoints with at least one link. */
  spawnable: number[]
}

export interface NpcNetwork {
  roads: RoadNet
  trains: TrainLine[]
  peds: PedGraph
  /** How many cars and pedestrians this city should have. */
  carTarget: number
  pedTarget: number
}

function buildRoadNet(city: CityState): RoadNet {
  const keys = [...new Set(city.roads)].filter((k) => {
    const { cx, cz } = parseKey(k)
    return inGrid(city, cx, cz)
  })
  const index = new Map(keys.map((k, i) => [k, i]))
  const n = keys.length
  const cx = new Int32Array(n)
  const cz = new Int32Array(n)
  const nb = new Int32Array(n * 4).fill(-1)
  const degree = new Uint8Array(n)
  const crossing = new Uint8Array(n)
  const rails = new Set(city.rails ?? [])
  keys.forEach((k, i) => {
    const c = parseKey(k)
    cx[i] = c.cx
    cz[i] = c.cz
    if (rails.has(k)) crossing[i] = 1
  })
  for (let i = 0; i < n; i++) {
    DIRS.forEach((d, dir) => {
      const j = index.get(roadKey(cx[i] + d.dx, cz[i] + d.dz))
      if (j === undefined) return
      nb[i * 4 + dir] = j
      degree[i]++
    })
  }
  const spawnable: number[] = []
  for (let i = 0; i < n; i++) if (degree[i] > 0 && !crossing[i]) spawnable.push(i)
  return { keys, index, cx, cz, nb, degree, crossing, spawnable }
}

/**
 * A long simple path through a branching rail component, for a shuttle: from each dead end (or the
 * first cell), keep going straight where possible, else take the first unvisited branch; the
 * longest such walk wins.
 */
function greedyPath(graph: CellGraph, cells: string[]): string[] {
  const ends = cells.filter((k) => (graph.get(k)?.length ?? 0) === 1)
  const starts = ends.length > 0 ? ends.slice(0, 6) : cells.slice(0, 1)
  let best: string[] = []
  for (const start of starts) {
    const path = [start]
    const seen = new Set(path)
    let prev: string | null = null
    let at = start
    for (;;) {
      const options = (graph.get(at) ?? []).filter((k) => !seen.has(k))
      if (options.length === 0) break
      let next = options[0]
      if (prev !== null) {
        const a = parseKey(prev)
        const b = parseKey(at)
        const ahead = roadKey(2 * b.cx - a.cx, 2 * b.cz - a.cz)
        if (options.includes(ahead)) next = ahead
      }
      path.push(next)
      seen.add(next)
      prev = at
      at = next
    }
    if (path.length > best.length) best = path
  }
  return best
}

function buildTrainLines(city: CityState): TrainLine[] {
  const lines = railLines(city).filter((l) => l.cells.length >= MIN_TRAIN_CELLS)
  if (lines.length === 0) return []
  const graph = railGraph(city)
  const out: TrainLine[] = []
  for (const line of lines) {
    if (out.length >= MAX_TRAINS) break
    const loop = line.loop && line.path !== null
    const order = line.path ?? greedyPath(graph, line.cells)
    if (order.length < MIN_TRAIN_CELLS) continue
    out.push({ key: `${loop ? 'loop' : 'line'}:${order.join(';')}`, path: railPolyline(order.map(parseKey), loop), loop })
  }
  return out
}

// Sidewalk corners of a road cell: 0 = NW, 1 = NE, 2 = SE, 3 = SW. Side d runs from corner d to corner d + 1.
const CORNER_SX = [-1, 1, 1, -1]
const CORNER_SZ = [-1, -1, 1, 1]

/** The corner of the neighbour across side `dir` that touches corner `c` (mirrored across that side). */
function mirroredCorner(c: number, dir: Dir): number {
  const sx = DX[dir] !== 0 ? -CORNER_SX[c] : CORNER_SX[c]
  const sz = DZ[dir] !== 0 ? -CORNER_SZ[c] : CORNER_SZ[c]
  for (let k = 0; k < 4; k++) if (CORNER_SX[k] === sx && CORNER_SZ[k] === sz) return k
  return c
}

/**
 * Pedestrian waypoints: the centre of every free pavement cell (not under a model, not a road or a
 * rail) and the four sidewalk corners of every road cell that is not a level crossing (people keep
 * off rails). Links follow the sidewalks: along a closed side of a road cell, across to the touching
 * corner of the next road cell, from a closed side to the pavement cell beyond it, and between
 * pavement cells. A road is crossed only at a junction (a road cell with 3+ arms), straight across
 * one of its arms; never in the middle of a block.
 */
function buildPedGraph(city: CityState, sizeOf: SizeOf, roads: RoadNet): { graph: PedGraph; pavementCells: number } {
  const rails = new Set(city.rails ?? [])
  const roadSet = roads.index
  const covered = city.placements.length > 0 ? coveredCells(city, sizeOf) : new Set<string>()
  const pavement = new Set<string>()
  for (const k of city.terrain?.pavement ?? []) {
    const { cx, cz } = parseKey(k)
    if (inGrid(city, cx, cz) && !roadSet.has(k) && !rails.has(k) && !covered.has(k)) pavement.add(k)
  }

  const keys: string[] = []
  const xs: number[] = []
  const zs: number[] = []
  const ys: number[] = []
  const jitters: number[] = []
  const index = new Map<string, number>()
  const node = (key: string, x: number, z: number, y: number, jitter: number) => {
    index.set(key, keys.length)
    keys.push(key)
    xs.push(x)
    zs.push(z)
    ys.push(y)
    jitters.push(jitter)
  }
  for (const k of pavement) {
    const { cx, cz } = parseKey(k)
    node(`p${k}`, cellCenter(cx), cellCenter(cz), PAVEMENT_Y, HALF - 1.4)
  }
  const walkRoad = (i: number) => roads.crossing[i] === 0
  for (let i = 0; i < roads.keys.length; i++) {
    if (!walkRoad(i)) continue
    const x = cellCenter(roads.cx[i])
    const z = cellCenter(roads.cz[i])
    for (let c = 0; c < 4; c++) node(`r${roads.keys[i]}:${c}`, x + CORNER_SX[c] * CORNER, z + CORNER_SZ[c] * CORNER, SIDEWALK_Y, 0.25)
  }

  const links: number[][] = keys.map(() => [])
  const crossings = new Set<number>()
  const n = keys.length
  const link = (a: number | undefined, b: number | undefined, crossing = false) => {
    if (a === undefined || b === undefined || a === b || links[a].includes(b)) return
    links[a].push(b)
    links[b].push(a)
    if (crossing) {
      crossings.add(a * n + b)
      crossings.add(b * n + a)
    }
  }
  for (const k of pavement) {
    const { cx, cz } = parseKey(k)
    const a = index.get(`p${k}`)
    link(a, index.get(`p${roadKey(cx + 1, cz)}`))
    link(a, index.get(`p${roadKey(cx, cz + 1)}`))
  }
  for (let i = 0; i < roads.keys.length; i++) {
    if (!walkRoad(i)) continue
    const corner = (c: number) => index.get(`r${roads.keys[i]}:${c}`)
    for (let d = 0; d < 4; d++) {
      const dir = d as Dir
      const c0 = d
      const c1 = (d + 1) & 3
      const j = roads.nb[i * 4 + d]
      if (j < 0) {
        // Closed side: walk along its sidewalk, and step onto the pavement beyond.
        link(corner(c0), corner(c1))
        const p = index.get(`p${roadKey(roads.cx[i] + DX[d], roads.cz[i] + DZ[d])}`)
        link(corner(c0), p)
        link(corner(c1), p)
        continue
      }
      // Open side: a zebra across this arm at a junction only.
      if (roads.degree[i] >= 3) link(corner(c0), corner(c1), true)
      // The touching corners of the next road cell continue the sidewalk.
      if (walkRoad(j)) {
        const other = (c: number) => index.get(`r${roads.keys[j]}:${mirroredCorner(c, dir)}`)
        link(corner(c0), other(c0))
        link(corner(c1), other(c1))
      }
    }
  }
  const spawnable: number[] = []
  for (let i = 0; i < n; i++) if (links[i].length > 0) spawnable.push(i)
  return {
    graph: {
      keys,
      index,
      x: Float64Array.from(xs),
      z: Float64Array.from(zs),
      y: Float64Array.from(ys),
      jitter: Float64Array.from(jitters),
      links,
      crossings,
      spawnable,
    },
    pavementCells: pavement.size,
  }
}

export function buildNetwork(city: CityState, sizeOf: SizeOf): NpcNetwork {
  const roads = buildRoadNet(city)
  const { graph: peds, pavementCells } = buildPedGraph(city, sizeOf, roads)
  const roadCells = roads.keys.length
  const carTarget = roads.spawnable.length === 0 ? 0 : Math.min(MAX_CARS, Math.floor(roadCells / ROADS_PER_CAR), Math.ceil(roads.spawnable.length / 2))
  const pedTarget =
    peds.spawnable.length === 0 ? 0 : Math.min(MAX_PEDS, Math.floor(pavementCells / PAVEMENT_PER_PED + roadCells / ROADS_PER_PED))
  return { roads, trains: buildTrainLines(city), peds, carTarget, pedTarget }
}
