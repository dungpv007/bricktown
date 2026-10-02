import { describe, expect, it } from 'vitest'
import { CELL } from '../city'
import { roadKey } from '../roads'
import type { CityState } from '../types'
import { AVENUE_LANES, cellCenter, DX, DZ, HALF, LANE, laneCurve, newPose, polylinePose, rightOf, type Dir } from './geometry'
import { buildNetwork, MAX_CARS } from './network'
import { NpcSim } from './sim'

const sizeOf = () => ({ w: 8, d: 8 })

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const row = (z: number, x0: number, x1: number) => range(x0, x1).map((x) => roadKey(x, z))
const col = (x: number, z0: number, z1: number) => range(z0, z1).map((z) => roadKey(x, z))

const city = (over: Partial<CityState>): CityState => ({ size: 16, roads: [], placements: [], ...over })

/** A rail ring from (2,2) to (9,6), crossed by a road column at x = 5 (crossings at (5,2) and (5,6)) and a road row at z = 8. */
const ring = [...row(2, 2, 9), ...row(6, 2, 9), ...col(2, 3, 5), ...col(9, 3, 5)]
const crossingCity = city({ roads: [...new Set([...col(5, 0, 9), ...row(8, 1, 9)])], rails: ring })

function run(sim: NpcSim, seconds: number, each?: () => void, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) {
    sim.step(dt)
    each?.()
  }
}

const cellOf = (v: number) => Math.floor(v / CELL)

describe('npc road network', () => {
  it('links road cells to their road neighbours (N, E, S, W) and flags level crossings', () => {
    const net = buildNetwork(crossingCity, sizeOf).roads
    const at = (cx: number, cz: number) => net.index.get(roadKey(cx, cz))!
    const junction = at(5, 8)
    expect(net.degree[junction]).toBe(4)
    expect([...net.nb.slice(junction * 4, junction * 4 + 4)]).toEqual([at(5, 7), at(6, 8), at(5, 9), at(4, 8)])
    expect(net.degree[at(5, 0)]).toBe(1)
    expect(net.crossing[at(5, 2)]).toBe(1)
    expect(net.crossing[at(5, 3)]).toBe(0)
    expect(net.spawnable).not.toContain(at(5, 2))
  })

  it('sizes the crowd from the city: a car per 6 road cells (at most 14), one train per rail line of 8+ cells', () => {
    const net = buildNetwork(crossingCity, sizeOf)
    expect(net.carTarget).toBe(Math.floor(18 / 6))
    expect(net.trains).toHaveLength(1)
    expect(net.trains[0].loop).toBe(true)
    const big = buildNetwork(city({ size: 40, roads: range(0, 15).flatMap((z) => row(z * 2, 0, 20)) }), sizeOf)
    expect(big.carTarget).toBe(MAX_CARS)
    // A short rail line gets no train; an empty city gets nobody.
    expect(buildNetwork(city({ rails: row(1, 0, 5) }), sizeOf).trains).toHaveLength(0)
    const empty = buildNetwork(city({}), sizeOf)
    expect([empty.carTarget, empty.pedTarget, empty.trains.length]).toEqual([0, 0, 0])
  })
})

describe('npc lanes', () => {
  it('runs on the right-hand side of the centre line, whatever the heading', () => {
    const pose = newPose()
    for (let d = 0; d < 4; d++) {
      const dir = d as Dir
      const curve = laneCurve(dir, dir)
      expect(curve.length).toBeCloseTo(CELL, 5)
      polylinePose(curve, curve.length / 2, pose)
      const r = rightOf(dir)
      // Offset from the centre line, measured towards the driver's right.
      expect(pose.x * DX[r] + pose.z * DZ[r]).toBeCloseTo(LANE, 5)
      expect([pose.hx, pose.hz]).toEqual([DX[dir], DZ[dir]])
    }
  })

  it('turns right tight and left wide, ending in the right lane of the new road', () => {
    const pose = newPose()
    const right = laneCurve(0, 1) // N then E
    const left = laneCurve(0, 3) // N then W
    expect(right.length).toBeLessThan(left.length)
    polylinePose(right, right.length, pose)
    expect([pose.x, pose.z]).toEqual([HALF, LANE]) // E side, south (right) half
    polylinePose(left, left.length, pose)
    expect(pose.x).toBeCloseTo(-HALF, 9)
    expect(pose.z).toBeCloseTo(-LANE, 9) // W side, north (right) half
  })
})

describe('npc cars', () => {
  it('turns at random at junctions (never back the way it came there) and U-turns at dead ends', () => {
    const net = buildNetwork(crossingCity, sizeOf)
    const sim = new NpcSim({ seed: 7 })
    sim.setNetwork(net)
    const roads = net.roads
    const junction = roads.index.get(roadKey(5, 8))!
    const deadEnds = [roadKey(5, 0), roadKey(5, 9), roadKey(1, 8), roadKey(9, 8)].map((k) => roads.index.get(k)!)
    const turns = new Set<string>()
    let uTurns = 0
    run(sim, 240, () => {
      for (const car of sim.cars) {
        if (car.cell === junction) {
          expect(car.dout).not.toBe((car.din + 2) & 3)
          turns.add(`${car.din}>${car.dout}`)
        }
        if (deadEnds.includes(car.cell) && car.dout === ((car.din + 2) & 3)) uTurns++
      }
    })
    expect(turns.size).toBeGreaterThanOrEqual(4)
    expect(uTurns).toBeGreaterThan(0)
  })

  it('keeps its distance to a stopped car ahead', () => {
    const roads = row(3, 0, 13)
    const sim = new NpcSim({ seed: 3, carLengths: [6] })
    sim.setNetwork(buildNetwork(city({ roads }), sizeOf))
    const net = sim.net!.roads
    const [leader, follower] = sim.cars
    sim.cars = [leader, follower]
    // Both heading E; the leader parked three cells ahead.
    Object.assign(leader, { cell: net.index.get(roadKey(8, 3))!, din: 1, dout: 1, s: 4, v: 0, cruise: 0 })
    Object.assign(follower, { cell: net.index.get(roadKey(6, 3))!, din: 1, dout: 1, s: 0, v: 0 })
    // It drives up and stops behind (well before it would give up waiting and squeeze past).
    let stopped = 0
    for (let t = 0; t < 6 && stopped < 0.5; t += 1 / 30) {
      sim.step(1 / 30)
      stopped = follower.v === 0 ? stopped + 1 / 30 : 0
    }
    expect(follower.v).toBe(0)
    const gap = leader.x - follower.x - 6
    expect(gap).toBeGreaterThan(0.3)
    expect(gap).toBeLessThan(2)
    expect(follower.z).toBeCloseTo(cellCenter(3) + LANE, 5) // E-bound: the south (right) lane
  })

  it('waits before a level crossing while a train is near, and never touches a train', () => {
    const sim = new NpcSim({ seed: 11 })
    sim.setNetwork(buildNetwork(crossingCity, sizeOf))
    const crossings = [roadKey(5, 2), roadKey(5, 6)].map((k) => sim.net!.roads.index.get(k)!)
    expect(sim.trains).toHaveLength(1)
    expect(sim.trains[0].cars).toHaveLength(3)
    let waits = 0
    let closest = Infinity
    run(sim, 300, () => {
      for (const car of sim.cars) {
        const next = sim.net!.roads.nb[car.cell * 4 + car.dout]
        if (crossings.includes(next) && sim.trainNearCrossing(next) && car.v === 0) waits++
        for (const t of sim.trains) for (const p of t.cars) closest = Math.min(closest, Math.hypot(p.x - car.x, p.z - car.z))
      }
    })
    expect(waits).toBeGreaterThan(0)
    // A car is ~6 studs long, a train vehicle ~9: centres this far apart never overlap side by side.
    expect(closest).toBeGreaterThan(5)
  })
})

describe('npc on avenues', () => {
  // An E-W avenue (rows 4-5) crossed by a N-S avenue (columns 8-9): a box at (8..9, 4..5). A side
  // street (column 3) meets the E-W avenue from the south, another (row 12) the N-S avenue from the west.
  const roads = [
    ...new Set([
      ...row(4, 0, 15), ...row(5, 0, 15), ...col(8, 0, 15), ...col(9, 0, 15),
      ...col(3, 6, 12), ...row(12, 3, 7),
    ]),
  ]
  const pavement = [...row(6, 0, 2), ...row(6, 4, 7), ...row(3, 0, 7), ...row(3, 10, 15), ...col(10, 6, 15)]
  const aveCity = city({ roads, terrain: { water: [], pavement, sand: [] } })

  it('gives each avenue half one heading (right-hand traffic); boxes take both avenues; junctions are claimed', () => {
    const net = buildNetwork(aveCity, sizeOf).roads
    const at = (cx: number, cz: number) => net.index.get(roadKey(cx, cz))!
    const bit = (d: number) => 1 << d
    expect(net.accept[at(2, 4)]).toBe(bit(3)) // north half heads W
    expect(net.accept[at(2, 5)]).toBe(bit(1)) // south half heads E
    expect(net.accept[at(8, 2)]).toBe(bit(2)) // west half heads S
    expect(net.accept[at(9, 2)]).toBe(bit(0)) // east half heads N
    expect(net.accept[at(8, 4)]).toBe(bit(3) | bit(2)) // NW box quarter: westbound row, southbound column
    expect(net.avenue[at(2, 4)]).toBe(bit(3))
    expect(net.avenue[at(3, 12)]).toBe(0) // a street
    expect(net.junction[at(2, 4)]).toBe(0)
    expect(net.junction[at(3, 5)]).toBe(1) // the side street joins here
    expect(net.junction[at(3, 4)]).toBe(1) // ...and cross traffic uses its partner
    expect(net.junction[at(8, 4)]).toBe(1)
    // Cross traffic may drive across a junction pair, never against its heading.
    expect(net.accept[at(3, 5)] & bit(3)).toBe(0)
    expect(net.accept[at(3, 5)] & bit(0)).toBe(bit(0))
  })

  it('a right turn onto an avenue ends in its outer lane, a left turn in its inner lane', () => {
    const pose = newPose()
    const right = laneCurve(0, 1, 0, 2) // street heading N, right onto an E-bound avenue half
    polylinePose(right, right.length, pose)
    expect(pose.x).toBeCloseTo(HALF, 9)
    expect(pose.z).toBeCloseTo(AVENUE_LANES[1], 9)
    const left = laneCurve(0, 3, 0, 1)
    polylinePose(left, left.length, pose)
    expect(pose.z).toBeCloseTo(-AVENUE_LANES[0], 9) // the driver's right of W is N (-Z)
    // The two lanes sit inside one half of the avenue, clear of the centre line and the kerb.
    expect(AVENUE_LANES[0]).toBeLessThan(-HALF + 2)
    expect(AVENUE_LANES[1]).toBeGreaterThan(0)
    expect(AVENUE_LANES[1]).toBeLessThan(HALF - 1.25 - 1.2)
  })

  it('cars keep to their heading and lanes on avenues, turn in the box and at side streets, and use both lanes', () => {
    const net = buildNetwork(aveCity, sizeOf)
    const sim = new NpcSim({ seed: 21 })
    sim.setNetwork(net)
    expect(sim.cars.length).toBeGreaterThan(5)
    const r = net.roads
    const boxTurns = new Set<string>()
    const lanes = new Set<number>()
    const visited = new Set<number>()
    run(sim, 240, () => {
      for (const car of sim.cars) {
        visited.add(car.cell)
        // Never against an avenue's heading.
        expect(r.accept[car.cell] & (1 << car.din), `cell ${r.keys[car.cell]} heading ${car.din}`).not.toBe(0)
        if (r.avenue[car.cell] && !r.junction[car.cell]) {
          // A plain stretch: straight on, centred in a lane.
          expect(car.dout).toBe(car.din)
          if (car.oi === car.oo && car.oi > 0 && car.s > 2 && car.s < 6) {
            const right = rightOf(car.din)
            const off = (car.x - cellCenter(r.cx[car.cell])) * DX[right] + (car.z - cellCenter(r.cz[car.cell])) * DZ[right]
            expect(off).toBeCloseTo(AVENUE_LANES[car.oi - 1], 5)
            lanes.add(car.oi)
          }
        }
        const k = r.keys[car.cell]
        if (['8,4', '9,4', '8,5', '9,5'].includes(k) && car.dout !== car.din) boxTurns.add(`${car.din}>${car.dout}`)
      }
    })
    expect(lanes).toEqual(new Set([1, 2]))
    expect(boxTurns.size).toBeGreaterThanOrEqual(3)
    expect(visited.has(r.index.get(roadKey(3, 10))!)).toBe(true) // into the side streets
    expect(visited.has(r.index.get(roadKey(5, 12))!)).toBe(true)
  })

  it('people walk the outer sidewalks of avenues and cross only on zebras at junctions and boxes', () => {
    const net = buildNetwork(aveCity, sizeOf)
    const sim = new NpcSim({ seed: 4 })
    sim.setNetwork(net)
    expect(sim.peds.length).toBeGreaterThan(3)
    const road = net.roads
    let zebra = 0
    run(sim, 200, () => {
      for (const p of sim.peds) {
        const cx = cellOf(p.x)
        const cz = cellOf(p.z)
        const r = road.index.get(roadKey(cx, cz))
        if (r === undefined) continue
        const lx = p.x - cellCenter(cx)
        const lz = p.z - cellCenter(cz)
        const band = HALF - 1.25 - 0.05
        let onWalk = false
        for (let d = 0; d < 4; d++) {
          const along = lx * DX[d] + lz * DZ[d]
          if (road.nb[r * 4 + d] < 0 && along >= band) onWalk = true
        }
        const h = [1, 2, 4, 8].indexOf(road.avenue[r])
        if (h >= 0 && !p.onRoad && !onWalk) {
          // On an avenue half, off the kerbs (an end's kerb runs right across): never out by the centre line.
          const partner = (h + 3) & 3
          expect(lx * DX[partner] + lz * DZ[partner]).toBeLessThan(0)
        }
        if (Math.abs(lx) >= band && Math.abs(lz) >= band) onWalk = true // a corner between two open sides
        if (!onWalk || p.onRoad) {
          expect(p.onRoad, `${p.x},${p.z}`).toBe(true)
          expect(road.junction[r]).toBe(1)
          zebra++
        }
      }
    })
    expect(zebra).toBeGreaterThan(0)
  })
})

describe('npc trains', () => {
  it('circles a closed loop, one way, along the track', () => {
    const sim = new NpcSim({ seed: 5 })
    sim.setNetwork(buildNetwork(city({ rails: ring }), sizeOf))
    const [train] = sim.trains
    expect(train.loop).toBe(true)
    const rails = new Set(ring)
    let wraps = 0
    let last = train.u
    run(sim, 60, () => {
      expect(train.dir).toBe(1)
      if (train.u < last) wraps++
      last = train.u
      for (const p of train.cars) expect(rails.has(roadKey(cellOf(p.x), cellOf(p.z)))).toBe(true)
    })
    expect(wraps).toBeGreaterThan(0)
  })

  it('shuttles back and forth on an open line, staying between the buffer stops', () => {
    const line = row(4, 1, 12)
    const sim = new NpcSim({ seed: 5 })
    sim.setNetwork(buildNetwork(city({ rails: line }), sizeOf))
    const [train] = sim.trains
    expect(train.loop).toBe(false)
    const dirs = new Set<number>()
    const xmin = cellCenter(1)
    const xmax = cellCenter(12)
    run(sim, 90, () => {
      dirs.add(train.dir)
      for (const p of train.cars) {
        expect(p.x - 4.5).toBeGreaterThanOrEqual(xmin - 1e-6)
        expect(p.x + 4.5).toBeLessThanOrEqual(xmax + 1e-6)
        expect(p.z).toBeCloseTo(cellCenter(4), 6)
      }
    })
    expect(dirs).toEqual(new Set([1, -1]))
  })
})

describe('npc pedestrians', () => {
  // A road row with a junction, pavement squares both sides, a pond and a rail line through the pavement.
  const roads = [...row(5, 0, 12), ...col(6, 2, 4)]
  const pavement = [...row(6, 0, 12), ...row(7, 0, 12), ...row(4, 0, 4), ...row(4, 8, 12), ...row(3, 0, 4)].filter((k) => k !== roadKey(9, 7))
  const water = [roadKey(2, 8), roadKey(3, 8)]
  const rails = col(9, 6, 9)
  const pedCity = city({ roads, rails, terrain: { water, pavement: pavement.filter((k) => !rails.includes(k)), sand: [] } })

  it('walks only on pavement and sidewalks, never on water or rails, crossing roads only at junctions', () => {
    const net = buildNetwork(pedCity, sizeOf)
    expect(net.pedTarget).toBeGreaterThan(5)
    const sim = new NpcSim({ seed: 9 })
    sim.setNetwork(net)
    const road = net.roads
    const pave = new Set(pedCity.terrain!.pavement)
    let zebra = 0
    run(sim, 200, () => {
      for (const p of sim.peds) {
        const cx = cellOf(p.x)
        const cz = cellOf(p.z)
        const key = roadKey(cx, cz)
        expect(water.includes(key)).toBe(false)
        expect(rails.includes(key)).toBe(false)
        const r = road.index.get(key)
        if (r === undefined) {
          expect(pave.has(key)).toBe(true)
          continue
        }
        // On a road cell: on a sidewalk strip (a closed side, or a corner between two open sides)...
        const lx = p.x - cellCenter(cx)
        const lz = p.z - cellCenter(cz)
        const band = HALF - 1.25 - 0.05
        let onWalk = false
        for (let d = 0; d < 4; d++) {
          const along = lx * DX[d] + lz * DZ[d]
          if (road.nb[r * 4 + d] < 0 && along >= band) onWalk = true
        }
        if (Math.abs(lx) >= band && Math.abs(lz) >= band) onWalk = true
        if (!onWalk || p.onRoad) {
          // ...or on a zebra at a junction.
          expect(p.onRoad).toBe(true)
          expect(road.degree[r]).toBeGreaterThanOrEqual(3)
          zebra++
        }
      }
    })
    expect(zebra).toBeGreaterThan(0)
  })

  it('is deterministic for a seed', () => {
    const snapshot = (seed: number) => {
      const sim = new NpcSim({ seed, carLengths: [6, 7, 9], pedStyles: 4 })
      sim.setNetwork(buildNetwork({ ...crossingCity, terrain: pedCity.terrain }, sizeOf))
      run(sim, 30)
      return JSON.stringify([sim.cars.map((c) => [c.x, c.z, c.variant]), sim.trains.map((t) => t.u), sim.peds.map((p) => [p.x, p.z, p.style])])
    }
    expect(snapshot(42)).toBe(snapshot(42))
    expect(snapshot(42)).not.toBe(snapshot(43))
  })

  it('keeps agents when the city changes and drops those whose ground is gone', () => {
    const sim = new NpcSim({ seed: 2 })
    sim.setNetwork(buildNetwork(crossingCity, sizeOf))
    run(sim, 5)
    const before = sim.cars.map((c) => [c.x, c.z])
    // Adding a road far away keeps every car where it was.
    sim.setNetwork(buildNetwork({ ...crossingCity, roads: [...crossingCity.roads, ...row(14, 0, 3)] }, sizeOf))
    expect(sim.cars.slice(0, before.length).map((c) => [c.x, c.z])).toEqual(before)
    // Removing the roads removes the cars.
    sim.setNetwork(buildNetwork({ ...crossingCity, roads: [] }, sizeOf))
    expect(sim.cars).toEqual([])
    expect(sim.trains).toHaveLength(1)
  })
})

describe('placed cars (the kid\'s vehicles on the roads)', () => {
  const vsize = (source: string) => (source === 'car' ? { w: 8, d: 16, vehicle: true } : { w: 8, d: 8 })
  // A loop of streets: cars can drive round and round.
  const loop = [...row(2, 2, 10), ...row(8, 2, 10), ...col(2, 3, 7), ...col(10, 3, 7)]
  const withCar = city({
    roads: loop,
    placements: [
      { id: 'mine', source: 'car', cx: 5, cz: 2, rot: 3, fit: 0.3125 },
      { id: 'house', source: 'house', cx: 5, cz: 4, rot: 0 },
    ],
  })

  it('lists vehicle placements on a road cell, heading the way they face', () => {
    const net = buildNetwork(withCar, vsize)
    expect(net.placed).toHaveLength(1)
    expect(net.placed[0]).toMatchObject({ id: 'mine', cell: net.roads.index.get(roadKey(5, 2)), dir: 1 })
    expect(net.placed[0].length).toBeCloseTo(5)
  })
  it('drives a placed car along the lanes with the others; a held one leaves the traffic', () => {
    const sim = new NpcSim({ seed: 5 })
    sim.setNetwork(buildNetwork(withCar, vsize))
    expect(sim.placedCount()).toBe(1)
    const car = sim.cars.find((c) => c.placed === 'mine')!
    expect(car.hx).toBeCloseTo(1) // facing E, as placed
    const start = { x: car.x, z: car.z }
    const cells = new Set<string>()
    run(sim, 20, () => cells.add(roadKey(cellOf(car.x), cellOf(car.z))))
    expect(Math.hypot(car.x - start.x, car.z - start.z)).toBeGreaterThan(1)
    for (const k of cells) expect(loop).toContain(k) // never off the road
    expect(cells.size).toBeGreaterThan(4)
    sim.setHeld(new Set(['mine']))
    expect(sim.placedCount()).toBe(0)
    sim.setHeld(new Set())
    expect(sim.placedCount()).toBe(1)
    // Its placement removed: the car goes too.
    sim.setNetwork(buildNetwork({ ...withCar, placements: [] }, vsize))
    expect(sim.placedCount()).toBe(0)
  })
})
