import { CELL } from '../city'
import { cellCenter, laneCurve, newPose, opposite, polylinePose, type Dir, type Polyline, type Pose } from './geometry'
import { MAX_TRAINS, ROAD_Y, type NpcNetwork, type RoadNet, type TrainLine } from './network'
import { mulberry32, type Rng } from './rng'

/**
 * Ambient city life: cars, trains and pedestrians stepping over an `NpcNetwork`. Pure and
 * deterministic for a seed and a sequence of `step(dt)` calls (no clocks, no Math.random), so it
 * can be tested; the City scene draws the poses it leaves on the agents. No physics: cars follow
 * lanes, trains follow their rail path, people walk a waypoint graph.
 */

export interface NpcOptions {
  seed?: number
  /** Length (studs) of each car model variant as drawn; a car's variant indexes this list. */
  carLengths?: readonly number[]
  /** Length (studs) of one train vehicle (engine or carriage) as drawn. */
  trainLength?: number
  /** Number of pedestrian looks; a pedestrian's `style` indexes them. */
  pedStyles?: number
}

export interface Car extends Pose {
  /** Road cell index in the current network. */
  cell: number
  /** Heading when it entered the cell, heading it leaves by. */
  din: Dir
  dout: Dir
  /** Distance travelled along the cell's lane curve. */
  s: number
  v: number
  cruise: number
  variant: number
  length: number
  /** Seconds spent (nearly) stopped for no good reason; leads to ghosting, then to a respawn. */
  stuck: number
  /** Seconds left ignoring other cars and junction turns (gets out of a jam). */
  ghost: number
  /** Stopped for a train at a level crossing (or queued behind a car that is). */
  waiting: boolean
}

export interface Train {
  key: string
  path: Polyline
  loop: boolean
  /** Distance of the engine's centre along the path. */
  u: number
  /** +1 along the path, -1 back (a shuttle pushing its carriages). */
  dir: 1 | -1
  v: number
  pause: number
  /** Engine first, then carriages. */
  cars: Pose[]
}

export interface Ped extends Pose {
  y: number
  from: number
  to: number
  /** Where it is walking to (the waypoint plus a little offset). */
  tx: number
  tz: number
  fromY: number
  linkLen: number
  speed: number
  style: number
  idle: number
  /** Walk cycle phase (radians), for the bob. */
  phase: number
  /** On a zebra across a road. */
  onRoad: boolean
}

const CAR_CRUISE = 7
const CAR_CRUISE_SPREAD = 1.5
const TURN_FACTOR = 0.6
const ACCEL = 6
const BRAKE = 18
/** Free distance ahead below which a car slows down, and the gap it stops at. */
const SLOW_DIST = 6
const STOP_GAP = 0.6
/** How far ahead (studs) and how far to the side a car looks for others. */
const LOOK_AHEAD = 12
const LOOK_SIDE = 1.3
/** A car claims a junction this close (front to the junction's edge). */
const CLAIM_DIST = 3
const GHOST_AFTER = 2.5
const GHOST_TIME = 2
const RESPAWN_AFTER = 9

const TRAIN_CRUISE = 8
const TRAIN_GAP = 0.8
/** Bogie centres sit this fraction of a car's length either side of its middle (the train templates: z 4 and 12 of 16). */
const BOGIE = 0.25
const TRAIN_STOP_PAUSE = 1.5
/** Cars wait at a level crossing while any train vehicle's centre is this close to it. */
export const CROSSING_RADIUS = 3 * CELL
/** A car whose front is this far onto a level crossing keeps going. */
const COMMITTED = 0.5

const PED_SPEED = 1.8
const PED_SPEED_SPREAD = 0.6
const PED_IDLE_CHANCE = 0.12

const DEFAULT_CAR_LENGTH = 6
const DEFAULT_TRAIN_LENGTH = 9

const tmpPose = newPose()

export class NpcSim {
  cars: Car[] = []
  trains: Train[] = []
  peds: Ped[] = []
  net: NpcNetwork | null = null
  private readonly rng: Rng
  private readonly carLengths: readonly number[]
  private readonly trainLength: number
  private readonly pedStyles: number
  private owner = new Int32Array(0)
  private trainNear = new Uint8Array(0)

  constructor(options: NpcOptions = {}) {
    this.rng = mulberry32(options.seed ?? 1)
    this.carLengths = options.carLengths && options.carLengths.length > 0 ? options.carLengths : [DEFAULT_CAR_LENGTH]
    this.trainLength = options.trainLength ?? DEFAULT_TRAIN_LENGTH
    this.pedStyles = Math.max(1, options.pedStyles ?? 1)
  }

  /** Every NPC drawn: cars, train vehicles and pedestrians. */
  count(): number {
    let n = this.cars.length + this.peds.length
    for (const t of this.trains) n += t.cars.length
    return n
  }

  /**
   * Switches to a new network (the city changed), keeping the agents that still fit it: a car whose
   * road cell is still there, a train whose line is unchanged, a pedestrian whose waypoint is still
   * there. Then adds or removes agents to match the network's targets.
   */
  setNetwork(net: NpcNetwork): void {
    const old = this.net
    this.net = net
    this.owner = new Int32Array(net.roads.keys.length)
    this.trainNear = new Uint8Array(net.roads.keys.length)
    this.keepCars(old, net)
    this.keepTrains(net)
    this.keepPeds(old, net)
    this.updatePoses()
  }

  /** Advances everything by `dt` seconds (clamp it: a long frame is treated as a short one). */
  step(dt: number): void {
    if (!this.net || dt <= 0) return
    const h = Math.min(dt, 0.1)
    this.stepTrains(h)
    this.markCrossings()
    this.stepCars(h)
    this.stepPeds(h)
  }

  // ---- Cars ----------------------------------------------------------------------------------

  private chooseDout(roads: RoadNet, cell: number, din: Dir): Dir {
    const back = opposite(din)
    let total = 0
    for (let d = 0; d < 4; d++) if (d !== back && roads.nb[cell * 4 + d] >= 0) total += d === din ? 2 : 1
    if (total === 0) return back // dead end: U-turn
    let pick = this.rng() * total
    for (let d = 0; d < 4; d++) {
      if (d === back || roads.nb[cell * 4 + d] < 0) continue
      pick -= d === din ? 2 : 1
      if (pick < 0) return d as Dir
    }
    return din
  }

  private placeCar(car: Car, roads: RoadNet, cell: number): void {
    // Arrive from a random neighbour, then pick a way out as at any cell.
    const from: Dir[] = []
    for (let d = 0; d < 4; d++) if (roads.nb[cell * 4 + d] >= 0) from.push(d as Dir)
    const back = from[Math.floor(this.rng() * from.length)] ?? 0
    car.cell = cell
    car.din = opposite(back)
    car.dout = this.chooseDout(roads, cell, car.din)
    car.s = this.rng() * laneCurve(car.din, car.dout).length * 0.5
    car.v = 0
    car.stuck = 0
    car.ghost = 0
    car.waiting = false
    this.carPose(car, roads)
  }

  /** A free cell to (re)spawn on: no car within a cell's length; any spawnable cell after a few tries. */
  private freeCell(roads: RoadNet, except?: Car): number {
    const cells = roads.spawnable
    let cell = cells[Math.floor(this.rng() * cells.length)]
    for (let tries = 0; tries < 12; tries++) {
      const x = cellCenter(roads.cx[cell])
      const z = cellCenter(roads.cz[cell])
      if (!this.cars.some((c) => c !== except && Math.abs(c.x - x) < CELL && Math.abs(c.z - z) < CELL)) break
      cell = cells[Math.floor(this.rng() * cells.length)]
    }
    return cell
  }

  private spawnCar(roads: RoadNet): Car {
    const variant = Math.floor(this.rng() * this.carLengths.length)
    const car: Car = {
      cell: 0, din: 0, dout: 0, s: 0, v: 0, x: 0, z: 0, hx: 0, hz: -1,
      cruise: CAR_CRUISE + (this.rng() - 0.5) * 2 * CAR_CRUISE_SPREAD,
      variant,
      length: this.carLengths[variant],
      stuck: 0,
      ghost: 0,
      waiting: false,
    }
    this.placeCar(car, roads, this.freeCell(roads))
    return car
  }

  private keepCars(old: NpcNetwork | null, net: NpcNetwork): void {
    const roads = net.roads
    const kept: Car[] = []
    for (const car of this.cars) {
      const key = old?.roads.keys[car.cell]
      const cell = key === undefined ? undefined : roads.index.get(key)
      if (cell === undefined || roads.degree[cell] === 0) continue
      car.cell = cell
      const back = opposite(car.din)
      if (roads.nb[cell * 4 + back] < 0) {
        this.placeCar(car, roads, cell) // the road it came from is gone
      } else {
        const turnBack = car.dout === back
        const deadEnd = this.chooseDout(roads, cell, car.din) === back
        const valid = turnBack ? deadEnd : roads.nb[cell * 4 + car.dout] >= 0
        if (!valid) car.dout = this.chooseDout(roads, cell, car.din)
        car.s = Math.min(car.s, laneCurve(car.din, car.dout).length - 0.01)
      }
      kept.push(car)
    }
    this.cars = kept.slice(0, net.carTarget)
    while (this.cars.length < net.carTarget) this.cars.push(this.spawnCar(roads))
  }

  private carPose(car: Car, roads: RoadNet): void {
    polylinePose(laneCurve(car.din, car.dout), car.s, tmpPose)
    car.x = cellCenter(roads.cx[car.cell]) + tmpPose.x
    car.z = cellCenter(roads.cz[car.cell]) + tmpPose.z
    car.hx = tmpPose.hx
    car.hz = tmpPose.hz
  }

  private stepCars(dt: number): void {
    const net = this.net!
    const roads = net.roads
    const owner = this.owner
    owner.fill(-1)
    const cars = this.cars
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i].cell
      if (roads.degree[c] >= 3 && owner[c] < 0) owner[c] = i
    }
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]
      const curve = laneCurve(car.din, car.dout)
      let free = Infinity
      let waiting = false
      if (car.ghost <= 0) {
        for (let j = 0; j < cars.length; j++) {
          if (j === i) continue
          const o = cars[j]
          const dx = o.x - car.x
          const dz = o.z - car.z
          const along = dx * car.hx + dz * car.hz
          if (along <= 0 || along > LOOK_AHEAD) continue
          if (Math.abs(dz * car.hx - dx * car.hz) > LOOK_SIDE) continue
          if (o.hx * car.hx + o.hz * car.hz < -0.3) continue // oncoming
          const gap = along - (car.length + o.length) / 2
          if (gap < free) {
            free = gap
            waiting = o.waiting
          }
        }
        for (const p of this.peds) {
          if (!p.onRoad) continue
          const dx = p.x - car.x
          const dz = p.z - car.z
          const along = dx * car.hx + dz * car.hz
          if (along <= 0 || along > LOOK_AHEAD || Math.abs(dz * car.hx - dx * car.hz) > LOOK_SIDE + 0.4) continue
          const gap = along - car.length / 2 - 0.6
          if (gap < free) {
            free = gap
            waiting = true // people cross quickly; never ghost through them
          }
        }
      }
      const next = roads.nb[car.cell * 4 + car.dout]
      if (next >= 0) {
        const toEdge = curve.length - car.s - car.length / 2
        // Wait for a train before a level crossing (a car already nosing onto it carries on and clears it).
        if (roads.crossing[next] && this.trainNear[next] && !roads.crossing[car.cell] && toEdge > -COMMITTED) {
          if (toEdge < free) {
            free = toEdge
            waiting = true
          }
        } else if (car.ghost <= 0 && roads.degree[next] >= 3 && next !== car.cell) {
          const o = owner[next]
          if (o >= 0 && o !== i) {
            if (toEdge < free) {
              free = toEdge
              waiting = cars[o].waiting
            }
          } else if (toEdge < CLAIM_DIST) owner[next] = i
        }
      }
      const cruise = car.din === car.dout ? car.cruise : car.cruise * TURN_FACTOR
      const target = free >= SLOW_DIST ? cruise : cruise * Math.max(0, Math.min(1, (free - STOP_GAP) / (SLOW_DIST - STOP_GAP)))
      const dv = target - car.v
      car.v = Math.max(0, car.v + Math.max(-BRAKE * dt, Math.min(ACCEL * dt, dv)))
      if (free <= STOP_GAP + 0.15) car.v = 0
      car.waiting = waiting && car.v < 0.1
      if (car.v < 0.1 && !car.waiting) car.stuck += dt
      else car.stuck = Math.max(0, car.stuck - dt * 2)
      if (car.ghost > 0) car.ghost -= dt
      else if (car.stuck > GHOST_AFTER) car.ghost = GHOST_TIME
      if (car.stuck > RESPAWN_AFTER) {
        this.placeCar(car, roads, this.freeCell(roads, car))
        continue
      }
      car.s += car.v * dt
      let len = curve.length
      while (car.s >= len) {
        car.s -= len
        const into = roads.nb[car.cell * 4 + car.dout]
        if (into < 0) {
          this.placeCar(car, roads, this.freeCell(roads, car))
          break
        }
        car.cell = into
        car.din = car.dout
        car.dout = this.chooseDout(roads, into, car.din)
        len = laneCurve(car.din, car.dout).length
      }
      this.carPose(car, roads)
    }
  }

  // ---- Trains --------------------------------------------------------------------------------

  /** How many vehicles fit the line: engine + 2 carriages, fewer on a short line (0: none). */
  private trainSize(line: TrainLine): number {
    const spacing = this.trainLength + TRAIN_GAP
    const room = line.loop ? line.path.length * 0.6 : line.path.length - this.trainLength - 2
    if (room < this.trainLength) return 0
    return Math.max(1, Math.min(3, Math.floor((room - this.trainLength) / spacing) + 1))
  }

  private keepTrains(net: NpcNetwork): void {
    const byKey = new Map(this.trains.map((t) => [t.key, t]))
    const out: Train[] = []
    for (const line of net.trains.slice(0, MAX_TRAINS)) {
      const size = this.trainSize(line)
      if (size === 0) continue
      const kept = byKey.get(line.key)
      if (kept && kept.cars.length === size) {
        kept.path = line.path
        out.push(kept)
        continue
      }
      const train: Train = {
        key: line.key,
        path: line.path,
        loop: line.loop,
        u: 0,
        dir: 1,
        v: 0,
        pause: 0,
        cars: Array.from({ length: size }, newPose),
      }
      const [lo, hi] = this.shuttleRange(train)
      train.u = line.loop ? this.rng() * line.path.length : lo + this.rng() * Math.max(0, hi - lo)
      out.push(train)
    }
    this.trains = out
  }

  /** Where a shuttle's engine centre may go: the whole train stays between the buffer stops. */
  private shuttleRange(t: Train): [number, number] {
    const half = this.trainLength / 2
    const back = (t.cars.length - 1) * (this.trainLength + TRAIN_GAP) + half
    return [back, Math.max(back, t.path.length - half)]
  }

  private stepTrains(dt: number): void {
    for (const t of this.trains) {
      if (t.pause > 0) {
        t.pause -= dt
        t.v = 0
      } else if (t.loop) {
        t.v = Math.min(TRAIN_CRUISE, t.v + ACCEL * 0.5 * dt)
        t.u = (t.u + t.v * dt) % t.path.length
      } else {
        const [lo, hi] = this.shuttleRange(t)
        const left = t.dir > 0 ? hi - t.u : t.u - lo
        const target = TRAIN_CRUISE * Math.max(0.2, Math.min(1, left / 12 + 0.1))
        t.v = Math.min(target, t.v + ACCEL * 0.5 * dt)
        t.u += t.dir * t.v * dt
        if (t.dir > 0 && t.u >= hi) {
          t.u = hi
          t.dir = -1
          t.pause = TRAIN_STOP_PAUSE
        } else if (t.dir < 0 && t.u <= lo) {
          t.u = lo
          t.dir = 1
          t.pause = TRAIN_STOP_PAUSE
        }
      }
      this.trainPoses(t)
    }
  }

  private wrap(t: Train, u: number): number {
    if (!t.loop) return u
    const l = t.path.length
    return ((u % l) + l) % l
  }

  private trainPoses(t: Train): void {
    const bogie = this.trainLength * BOGIE
    for (let i = 0; i < t.cars.length; i++) {
      const pose = t.cars[i]
      const u = t.u - i * (this.trainLength + TRAIN_GAP)
      polylinePose(t.path, this.wrap(t, u + bogie), tmpPose)
      const fx = tmpPose.x
      const fz = tmpPose.z
      polylinePose(t.path, this.wrap(t, u - bogie), tmpPose)
      pose.x = (fx + tmpPose.x) / 2
      pose.z = (fz + tmpPose.z) / 2
      const dx = fx - tmpPose.x
      const dz = fz - tmpPose.z
      const len = Math.hypot(dx, dz)
      if (len > 1e-6) {
        pose.hx = dx / len
        pose.hz = dz / len
      }
    }
  }

  /** Flags the level crossings a train is near this step. */
  private markCrossings(): void {
    const roads = this.net!.roads
    const near = this.trainNear
    near.fill(0)
    if (this.trains.length === 0) return
    const r2 = CROSSING_RADIUS * CROSSING_RADIUS
    for (let c = 0; c < roads.keys.length; c++) {
      if (!roads.crossing[c]) continue
      const x = cellCenter(roads.cx[c])
      const z = cellCenter(roads.cz[c])
      for (const t of this.trains) {
        for (const p of t.cars) {
          const dx = p.x - x
          const dz = p.z - z
          if (dx * dx + dz * dz < r2) near[c] = 1
        }
      }
    }
  }

  /** Whether a train is near the level crossing at road cell `cell` (as of the last step). */
  trainNearCrossing(cell: number): boolean {
    return this.trainNear[cell] === 1
  }

  // ---- Pedestrians ---------------------------------------------------------------------------

  private aim(p: Ped, to: number): void {
    const g = this.net!.peds
    const j = g.jitter[to]
    p.from = p.to
    p.to = to
    p.fromY = p.y
    p.tx = g.x[to] + (this.rng() * 2 - 1) * j
    p.tz = g.z[to] + (this.rng() * 2 - 1) * j
    p.linkLen = Math.max(1e-6, Math.hypot(p.tx - p.x, p.tz - p.z))
    p.onRoad = g.crossings.has(p.from * g.keys.length + to)
  }

  /** At a waypoint: on to a random linked one, not straight back unless it is a dead end. */
  private nextWaypoint(p: Ped): void {
    const g = this.net!.peds
    const links = g.links[p.to]
    if (links.length === 0) return
    let options = links.length > 1 ? links.filter((k) => k !== p.from) : links
    if (options.length === 0) options = links
    const to = options[Math.floor(this.rng() * options.length)]
    if (g.jitter[p.to] > 1 && this.rng() < PED_IDLE_CHANCE) p.idle = 0.8 + this.rng() * 1.7
    this.aim(p, to)
  }

  private spawnPed(): Ped {
    const g = this.net!.peds
    const at = g.spawnable[Math.floor(this.rng() * g.spawnable.length)]
    const p: Ped = {
      x: g.x[at], z: g.z[at], y: g.y[at], hx: 0, hz: 1,
      from: at, to: at, tx: g.x[at], tz: g.z[at], fromY: g.y[at], linkLen: 1,
      speed: PED_SPEED + (this.rng() - 0.5) * 2 * PED_SPEED_SPREAD,
      style: Math.floor(this.rng() * this.pedStyles),
      idle: 0,
      phase: this.rng() * Math.PI * 2,
      onRoad: false,
    }
    this.nextWaypoint(p)
    p.idle = 0
    return p
  }

  private keepPeds(old: NpcNetwork | null, net: NpcNetwork): void {
    const g = net.peds
    const kept: Ped[] = []
    for (const p of this.peds) {
      const fromKey = old?.peds.keys[p.from]
      const toKey = old?.peds.keys[p.to]
      const from = fromKey === undefined ? undefined : g.index.get(fromKey)
      const to = toKey === undefined ? undefined : g.index.get(toKey)
      if (to === undefined || g.links[to].length === 0) continue
      p.to = to
      if (from !== undefined && g.links[from].includes(to)) p.from = from
      else {
        // Its way here is gone (a model, a road...): hop to the waypoint and carry on from it.
        p.from = to
        p.x = p.tx = g.x[to]
        p.z = p.tz = g.z[to]
        p.y = g.y[to]
        p.onRoad = false
        this.nextWaypoint(p)
      }
      kept.push(p)
    }
    this.peds = kept.slice(0, net.pedTarget)
    while (this.peds.length < net.pedTarget) this.peds.push(this.spawnPed())
  }

  private stepPeds(dt: number): void {
    const g = this.net!.peds
    for (const p of this.peds) {
      if (p.idle > 0) {
        p.idle -= dt
        continue
      }
      const dx = p.tx - p.x
      const dz = p.tz - p.z
      const d = Math.hypot(dx, dz)
      const step = p.speed * dt
      p.phase += step * 3.2
      if (d <= step) {
        p.x = p.tx
        p.z = p.tz
        p.y = g.y[p.to]
        this.nextWaypoint(p)
        continue
      }
      p.x += (dx / d) * step
      p.z += (dz / d) * step
      // Turn smoothly towards where it is going.
      const k = Math.min(1, dt * 10)
      const hx = p.hx + (dx / d - p.hx) * k
      const hz = p.hz + (dz / d - p.hz) * k
      const hl = Math.hypot(hx, hz) || 1
      p.hx = hx / hl
      p.hz = hz / hl
      const f = 1 - (d - step) / p.linkLen
      const toY = g.y[p.to]
      // Down onto the asphalt on a zebra, back up onto the far sidewalk.
      p.y = p.onRoad && f > 0.15 && f < 0.85 ? ROAD_Y : p.fromY + (toY - p.fromY) * Math.max(0, Math.min(1, f))
    }
  }

  private updatePoses(): void {
    const roads = this.net?.roads
    if (roads) for (const car of this.cars) this.carPose(car, roads)
    for (const t of this.trains) this.trainPoses(t)
  }
}
