import { CELL, placementCells, type SourceSize } from '../../core/city'
import { placementCenter } from '../../core/cityPlan'
import { spawnPoint } from '../../core/drive'
import { roadKey } from '../../core/roads'
import type { BlueprintKind, CityPlacement, CityState } from '../../core/types'
import { recordRound, type RoundOutcome } from '../rewards'
import { statsOf } from '../stickers'
import type { GameStats, PlayData } from '../types'

/**
 * Fire and police dispatch (`rescue`): the pure logic. Which placement of the city is on fire (or
 * has a robber outside), where the truck starts and stops, the way along the roads the guide arrow
 * follows, the mission's phases, the hose, the catch and the rewards. No React, no three.js.
 */

export type MissionKind = 'fire' | 'police'

/** What the mission needs to know about a placement's model. */
export interface SourceInfo {
  kind: BlueprintKind
  /** For `tpl:<id>` sources. */
  templateId?: string
  /** Its footprint (plate studs) and flags, as the City sees it. */
  size: SourceSize
}

export type SourceInfoOf = (source: string) => SourceInfo | null

/** Shops a robber hangs around. */
export const SHOP_TEMPLATES: ReadonlySet<string> = new Set(['sushi_restaurant', 'bakery', 'toy_shop', 'grocery', 'restaurant', 'shop'])
/** Where each team starts from. */
export const STATION_TEMPLATES: Record<MissionKind, readonly string[]> = {
  fire: ['fire_station'],
  police: ['police_station', 'police_hq'],
}
/** The heroes' own stations never burn. */
const NEVER_ON_FIRE: ReadonlySet<string> = new Set(['fire_station', 'police_station', 'police_hq'])

/** The vehicle each team drives (template ids). */
export const MISSION_VEHICLE: Record<MissionKind, string> = { fire: 'fire_truck', police: 'police_car' }

/** Whether a placement can host this mission: any building burns (not a station), robbers like shops. */
export function isCandidate(kind: MissionKind, info: SourceInfo | null): boolean {
  if (!info || info.kind !== 'building') return false
  if (kind === 'fire') return !(info.templateId && NEVER_ON_FIRE.has(info.templateId))
  return info.templateId !== undefined && SHOP_TEMPLATES.has(info.templateId)
}

export interface Point {
  x: number
  z: number
}

export interface MissionTarget {
  placementId: string
  source: string
  /** Footprint centre (studs). */
  x: number
  z: number
  /** Footprint half extents (studs). */
  halfW: number
  halfD: number
  /** Where the vehicle should stop: the middle of the road cell next to it (or a spot in front). */
  ring: Point
  /** That road cell ("cx,cz"), the goal of the guide; null when there is no road near. */
  road: string | null
}

const cellCenter = (cx: number, cz: number): Point => ({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL })
const parseKey = (key: string): [number, number] => key.split(',').map(Number) as [number, number]

/** Road cells a car can stand on: roads not under a placed model (parked vehicles block them). */
export function freeRoads(city: CityState, infoOf: SourceInfoOf): Set<string> {
  const covered = new Set<string>()
  for (const p of city.placements) {
    const info = infoOf(p.source)
    if (!info) continue
    const { cw, cd } = placementCells(p, info.size)
    for (let x = p.cx; x < p.cx + cw; x++) for (let z = p.cz; z < p.cz + cd; z++) covered.add(roadKey(x, z))
  }
  const free = new Set<string>()
  for (const key of city.roads) if (!covered.has(key)) free.add(key)
  return free
}

/** Distance (studs) from a point to a placement's footprint rectangle (0 inside). */
function distToFootprint(x: number, z: number, t: Pick<MissionTarget, 'x' | 'z' | 'halfW' | 'halfD'>): number {
  const dx = Math.max(0, Math.abs(x - t.x) - t.halfW)
  const dz = Math.max(0, Math.abs(z - t.z) - t.halfD)
  return Math.hypot(dx, dz)
}

/** The free road cell nearest the footprint (ties: nearest its centre), or null. */
function nearestRoad(roads: ReadonlySet<string>, t: Pick<MissionTarget, 'x' | 'z' | 'halfW' | 'halfD'>): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const key of roads) {
    const [cx, cz] = parseKey(key)
    const c = cellCenter(cx, cz)
    const d = distToFootprint(c.x, c.z, t) * 1000 + Math.hypot(c.x - t.x, c.z - t.z)
    if (d < bestD) {
      bestD = d
      best = key
    }
  }
  return best
}

/** A placement as a mission target (`from`: where the vehicle comes from, for a road-less city). */
export function targetOf(p: CityPlacement, info: SourceInfo, roads: ReadonlySet<string>, from: Point): MissionTarget {
  const { cw, cd } = placementCells(p, info.size)
  const c = placementCenter(p, info.size)
  const base = { x: c.x, z: c.z, halfW: (cw * CELL) / 2, halfD: (cd * CELL) / 2 }
  const road = nearestRoad(roads, base)
  let ring: Point
  if (road) {
    const [cx, cz] = parseKey(road)
    ring = cellCenter(cx, cz)
  } else {
    // No road: stop in front of it, on the side the vehicle comes from.
    const dx = from.x - c.x
    const dz = from.z - c.z
    const len = Math.hypot(dx, dz) || 1
    const r = Math.max(base.halfW, base.halfD) + 6
    ring = { x: c.x + (dx / len) * r, z: c.z + (dz / len) * r }
  }
  return { placementId: p.id, source: p.source, ...base, ring, road }
}

/** Whether the city has anything for this mission (otherwise the built-in map is used). */
export const hasCandidate = (city: CityState, kind: MissionKind, infoOf: SourceInfoOf): boolean =>
  city.placements.some((p) => isCandidate(kind, infoOf(p.source)))

/** Targets closer than this to the start (studs) are only picked when nothing else is left. */
export const MIN_TRIP = 4 * CELL

export interface PickOptions {
  /** Random number in [0, 1). */
  rng?: () => number
  /** Where the vehicle starts. */
  from: Point
  /** The last mission's placement, not picked twice in a row when there is a choice. */
  avoid?: string | null
}

/** Picks the mission's target in `city`, or null when nothing there fits. */
export function pickTarget(city: CityState, kind: MissionKind, infoOf: SourceInfoOf, { rng = Math.random, from, avoid = null }: PickOptions): MissionTarget | null {
  const roads = freeRoads(city, infoOf)
  const all: MissionTarget[] = []
  for (const p of city.placements) {
    const info = infoOf(p.source)
    if (info && isCandidate(kind, info)) all.push(targetOf(p, info, roads, from))
  }
  if (all.length === 0) return null
  const fresh = all.length > 1 && avoid ? all.filter((t) => t.placementId !== avoid) : all
  const far = fresh.filter((t) => Math.hypot(t.ring.x - from.x, t.ring.z - from.z) >= MIN_TRIP)
  const pool = far.length > 0 ? far : fresh
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
}

/** Road distance (in cells) from every free road cell to `goal`; empty when there is no goal. */
export function roadField(roads: ReadonlySet<string>, goal: string | null): Map<string, number> {
  const field = new Map<string, number>()
  if (!goal || !roads.has(goal)) return field
  field.set(goal, 0)
  const queue = [goal]
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]
    const d = field.get(key) ?? 0
    const [cx, cz] = parseKey(key)
    for (const n of [roadKey(cx + 1, cz), roadKey(cx - 1, cz), roadKey(cx, cz + 1), roadKey(cx, cz - 1)]) {
      if (roads.has(n) && !field.has(n)) {
        field.set(n, d + 1)
        queue.push(n)
      }
    }
  }
  return field
}

/** The neighbour of road cell (cx, cz) one step nearer the goal, or null (at the goal, or off the field). */
function downhill(field: ReadonlyMap<string, number>, cx: number, cz: number): [number, number] | null {
  const here = field.get(roadKey(cx, cz))
  if (here === undefined || here === 0) return null
  // Fixed order (no arrays): +X, -X, +Z, -Z.
  for (let i = 0; i < 4; i++) {
    const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0)
    const nz = cz + (i === 2 ? 1 : i === 3 ? -1 : 0)
    if (field.get(roadKey(nx, nz)) === here - 1) return [nx, nz]
  }
  return null
}

/** Cells ahead the guide arrow looks along the road. */
export const GUIDE_LOOKAHEAD = 2

/**
 * Where the guide arrow points from (x, z): a road cell a couple of steps along the way to the
 * target, or straight at the stopping spot when the car is off the roads, near it, or the city has
 * no roads. Writes into `out` (called every frame: no allocation besides the cell keys).
 */
export function guidePoint(field: ReadonlyMap<string, number>, ring: Point, x: number, z: number, out: Point): Point {
  out.x = ring.x
  out.z = ring.z
  if (field.size === 0 || Math.hypot(ring.x - x, ring.z - z) < CELL * 1.5) return out
  let cx = Math.floor(x / CELL)
  let cz = Math.floor(z / CELL)
  if (!field.has(roadKey(cx, cz))) {
    // Just off the road (a corner cut, a parked car): back onto the nearest neighbouring road cell.
    let best = Infinity
    let bx = 0
    let bz = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const d = field.get(roadKey(cx + dx, cz + dz))
        if (d !== undefined && d < best) {
          best = d
          bx = cx + dx
          bz = cz + dz
        }
      }
    }
    if (best === Infinity) return out
    out.x = (bx + 0.5) * CELL
    out.z = (bz + 0.5) * CELL
    return out
  }
  for (let i = 0; i < GUIDE_LOOKAHEAD; i++) {
    const next = downhill(field, cx, cz)
    if (!next) return out // the goal cell: the ring itself
    ;[cx, cz] = next
  }
  if (field.get(roadKey(cx, cz)) === 0) return out
  out.x = (cx + 0.5) * CELL
  out.z = (cz + 0.5) * CELL
  return out
}

/** The road cells from `start` to the goal (the dotted way on the mini map); [] off the field. */
export function roadPath(field: ReadonlyMap<string, number>, start: string): string[] {
  if (!field.has(start)) return []
  const out = [start]
  let [cx, cz] = parseKey(start)
  for (let guard = 0; guard < field.size; guard++) {
    const next = downhill(field, cx, cz)
    if (!next) break
    ;[cx, cz] = next
    out.push(roadKey(cx, cz))
  }
  return out
}

/** Heading (radians around +Y, 0 = facing -Z, as the Drive vehicle) that looks along (dx, dz). */
export const yawTowards = (dx: number, dz: number): number => Math.atan2(-dx, -dz)

export interface Spawn extends Point {
  yaw: number
  /** Its road cell, when it is on one. */
  road: string | null
}

/**
 * Where the vehicle starts: the road beside the team's station when the city has one, else the
 * Drive mode's own start. It faces the first step of the way (or the target, off the roads).
 */
export function missionSpawn(
  city: CityState,
  kind: MissionKind,
  infoOf: SourceInfoOf,
  roads: ReadonlySet<string>,
  field: ReadonlyMap<string, number>,
  ring: Point,
): Spawn {
  const stations = STATION_TEMPLATES[kind]
  let road: string | null = null
  for (const p of city.placements) {
    const info = infoOf(p.source)
    if (!info?.templateId || !stations.includes(info.templateId)) continue
    const { cw, cd } = placementCells(p, info.size)
    const c = placementCenter(p, info.size)
    // A road on the field (it leads to the target); any road otherwise.
    const reachable = new Set([...roads].filter((k) => field.size === 0 || field.has(k)))
    road = nearestRoad(reachable.size > 0 ? reachable : roads, { x: c.x, z: c.z, halfW: (cw * CELL) / 2, halfD: (cd * CELL) / 2 })
    if (road) break
  }
  let at: Point
  if (road) {
    const [cx, cz] = parseKey(road)
    at = cellCenter(cx, cz)
  } else {
    at = spawnPoint(city, (s) => infoOf(s)?.size ?? { w: 8, d: 8 })
    const key = roadKey(Math.floor(at.x / CELL), Math.floor(at.z / CELL))
    road = roads.has(key) ? key : null
  }
  let toward: Point = ring
  if (road) {
    const [cx, cz] = parseKey(road)
    const next = downhill(field, cx, cz)
    if (next) toward = cellCenter(next[0], next[1])
  }
  const yaw = toward.x === at.x && toward.z === at.z ? 0 : yawTowards(toward.x - at.x, toward.z - at.z)
  return { ...at, yaw, road }
}

/** Close enough to the stopping spot (studs from its centre)... */
export const ARRIVE_RADIUS = 10
/** ...or this close to the building itself. */
export const ARRIVE_MARGIN = 5

/** Whether a vehicle at (x, z) has arrived at the target. */
export function hasArrived(t: MissionTarget, x: number, z: number): boolean {
  return Math.hypot(x - t.ring.x, z - t.ring.z) < ARRIVE_RADIUS || distToFootprint(x, z, t) < ARRIVE_MARGIN
}

// ---------- The mission's phases ----------

/**
 * ringing (the phone rings) → call (who needs help, where) → drive (to the target) → action (hose /
 * catch) → cheer (the crowd) → summary (back at the station) → again: ringing. No fail state:
 * any other event leaves the phase as it is.
 */
export type MissionPhase = 'ringing' | 'call' | 'drive' | 'action' | 'cheer' | 'summary'
export type MissionEvent = 'answer' | 'go' | 'arrive' | 'done' | 'finish' | 'again'

const NEXT: Record<MissionPhase, Partial<Record<MissionEvent, MissionPhase>>> = {
  ringing: { answer: 'call' },
  call: { go: 'drive' },
  drive: { arrive: 'action' },
  action: { done: 'cheer' },
  cheer: { finish: 'summary' },
  summary: { again: 'ringing' },
}

export const missionStep = (phase: MissionPhase, event: MissionEvent): MissionPhase => NEXT[phase][event] ?? phase

/** Phases spent in the city (the drive canvas). */
export const inCity = (phase: MissionPhase): boolean => phase === 'drive' || phase === 'action' || phase === 'cheer'

// ---------- The hose ----------

/** Seconds of holding 💦 that put the fire out. */
export const SPRAY_SECONDS = 3.5

/** Spray progress (0..1, 1 = out) after `dt` seconds, holding the button or not (it never goes back). */
export function sprayStep(progress: number, dt: number, holding: boolean): number {
  if (!holding || progress >= 1) return Math.min(1, progress)
  return Math.min(1, progress + Math.min(Math.max(dt, 0), 0.1) / SPRAY_SECONDS)
}

/** How big the flames still are (1 = full fire, 0 = out): they shrink as the water works. */
export const fireLeft = (progress: number): number => Math.max(0, 1 - progress)

// ---------- The robber ----------

/** The robber runs this far around his spot (studs)... */
export const ROBBER_RADIUS = 5
/** ...this fast (radians / s), with a short look-around stop every lap. */
export const ROBBER_SPEED = 1.4

/**
 * Where the running robber is at `t` seconds: a lap round his spot (a squashed loop, so he darts
 * back and forth), pausing a moment each lap. Writes into `out`; `heading` is his facing (radians
 * around +Y, 0 = facing +Z like a minifig).
 */
export function robberPose(t: number, spot: Point, out: Point & { heading: number; running: boolean }): typeof out {
  const lap = (2 * Math.PI) / ROBBER_SPEED
  const pause = 0.8
  const cycle = lap + pause
  const k = t % cycle
  const running = k < lap
  const a = (running ? k : lap) * ROBBER_SPEED
  out.x = spot.x + Math.sin(a) * ROBBER_RADIUS
  out.z = spot.z + Math.sin(2 * a) * ROBBER_RADIUS * 0.5
  // Velocity direction (derivative of the path).
  const vx = Math.cos(a)
  const vz = Math.cos(2 * a)
  out.heading = running ? Math.atan2(vx, vz) : out.heading
  out.running = running
  return out
}

/** The robber's spot: in front of the shop, on the side of the stopping ring (clear of the car). */
export function robberSpot(t: Pick<MissionTarget, 'x' | 'z' | 'ring' | 'halfW' | 'halfD'>): Point {
  const dx = t.ring.x - t.x
  const dz = t.ring.z - t.z
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len
  const uz = dz / len
  // From the shop's middle to just outside its wall, toward the road (never past the ring).
  const k = Math.min(len * 0.6, Math.abs(ux) * t.halfW + Math.abs(uz) * t.halfD + 3)
  return { x: t.x + ux * k, z: t.z + uz * k }
}

export interface RobberState {
  caught: boolean
  taps: number
}

export const newRobber = (): RobberState => ({ caught: false, taps: 0 })

/** A tap on the robber: caught (one tap does it; later taps change nothing). Only once the car is there. */
export function tapRobber(s: RobberState, phase: MissionPhase): RobberState {
  if (s.caught || phase !== 'action') return s
  return { caught: true, taps: s.taps + 1 }
}

// ---------- Rewards ----------

/** Coins for a mission... */
export const MISSION_COINS = 10
/** ...plus a bonus (and a ⭐ round) when the drive took less than this. */
export const SPEEDY_SECONDS = 45
export const SPEEDY_BONUS = 5

export function missionReward(driveSeconds: number): { coins: number; perfect: boolean } {
  const perfect = Number.isFinite(driveSeconds) && driveSeconds >= 0 && driveSeconds < SPEEDY_SECONDS
  return { coins: MISSION_COINS + (perfect ? SPEEDY_BONUS : 0), perfect }
}

/** Stats key counting one team's missions (the brave-firefighter / super-police stickers read it). */
export const teamStatsKey = (kind: MissionKind): string => `rescue_${kind}`

/**
 * A finished mission: the team's own counter goes up first (its sticker reads it), then the round
 * of `rescue` is recorded as usual (coins, stats, stickers).
 */
export function recordMission(play: PlayData, kind: MissionKind, driveSeconds: number): RoundOutcome {
  const { coins, perfect } = missionReward(driveSeconds)
  const key = teamStatsKey(kind)
  const before = statsOf(play, key)
  const team: GameStats = {
    rounds: before.rounds + 1,
    customers: before.customers + 1,
    perfect: before.perfect + (perfect ? 1 : 0),
    coins: before.coins + coins,
  }
  return recordRound({ ...play, stats: { ...play.stats, [key]: team } }, 'rescue', { customers: 1, coins, perfect })
}

/** The next call: fire and police take turns, starting with a fire. */
export const nextKind = (play: PlayData): MissionKind => (statsOf(play, 'rescue').rounds % 2 === 0 ? 'fire' : 'police')
