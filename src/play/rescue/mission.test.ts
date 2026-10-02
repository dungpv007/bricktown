import { describe, expect, it } from 'vitest'
import { sampleCity } from '../../content/cities/sample'
import { CELL } from '../../core/city'
import type { CityState } from '../../core/types'
import { emptyPlay } from '../rewards'
import { STICKER_BY_ID } from '../stickers'
import {
  fireLeft,
  freeRoads,
  guidePoint,
  hasArrived,
  isCandidate,
  missionReward,
  missionSpawn,
  missionStep,
  nextKind,
  pickTarget,
  recordMission,
  roadField,
  roadPath,
  robberPose,
  robberSpot,
  sprayStep,
  SPRAY_SECONDS,
  tapRobber,
  newRobber,
  yawTowards,
  type SourceInfoOf,
} from './mission'
import { ParticlePool, emitCount } from './particles'
import { planMission, sourceInfoOf } from './plan'

const infoOf: SourceInfoOf = sourceInfoOf({ blueprints: [] })

/** A street along z = 5 from x = 0..11; north of it the fire station (4 x 4 cells) at the west end, a bakery and a house. */
function town(): CityState {
  const roads: string[] = []
  for (let x = 0; x < 12; x++) roads.push(`${x},5`)
  return {
    size: 16,
    roads,
    placements: [
      { id: 'station', source: 'tpl:fire_station', cx: 0, cz: 1, rot: 0 },
      { id: 'house', source: 'tpl:house_small', cx: 9, cz: 3, rot: 0 },
      { id: 'bakery', source: 'tpl:bakery', cx: 5, cz: 3, rot: 0 },
      { id: 'tree', source: 'tpl:tree', cx: 12, cz: 12, rot: 0 },
    ],
  }
}

describe('rescue: targets', () => {
  it('burns buildings (never the stations), and robbers pick shops', () => {
    expect(isCandidate('fire', infoOf('tpl:house_small'))).toBe(true)
    expect(isCandidate('fire', infoOf('tpl:fire_station'))).toBe(false)
    expect(isCandidate('fire', infoOf('tpl:police_hq'))).toBe(false)
    expect(isCandidate('fire', infoOf('tpl:tree'))).toBe(false)
    expect(isCandidate('fire', infoOf('tpl:car'))).toBe(false)
    expect(isCandidate('police', infoOf('tpl:bakery'))).toBe(true)
    expect(isCandidate('police', infoOf('tpl:sushi_restaurant'))).toBe(true)
    expect(isCandidate('police', infoOf('tpl:house_small'))).toBe(false)
    expect(isCandidate('fire', null)).toBe(false)
  })

  it('picks a target in the city, its stop on the road beside it', () => {
    const city = town()
    const fire = pickTarget(city, 'fire', infoOf, { from: { x: 4, z: 44 }, rng: () => 0 })
    expect(fire).not.toBeNull()
    expect(['house', 'bakery']).toContain(fire!.placementId)
    expect(fire!.road).not.toBeNull()
    expect(fire!.road!.endsWith(',5')).toBe(true)
    const police = pickTarget(city, 'police', infoOf, { from: { x: 4, z: 44 } })
    expect(police?.placementId).toBe('bakery')
  })

  it('avoids the last target and prefers far ones when there is a choice', () => {
    const city = town()
    for (let i = 0; i < 5; i++) {
      const t = pickTarget(city, 'fire', infoOf, { from: { x: 4, z: 44 }, avoid: 'house', rng: () => i / 5 })
      expect(t?.placementId).toBe('bakery')
    }
    // From right beside the bakery, the far house is picked.
    const far = pickTarget(city, 'fire', infoOf, { from: { x: 6 * CELL, z: 4 * CELL }, rng: () => 0 })
    expect(far?.placementId).toBe('house')
  })

  it('has nothing to pick in an empty city: the plan falls back to the built-in town', () => {
    const empty: CityState = { size: 48, roads: [], placements: [] }
    expect(pickTarget(empty, 'fire', infoOf, { from: { x: 0, z: 0 } })).toBeNull()
    const plan = planMission(empty, { blueprints: [] }, 'police', null, () => 0.5)
    expect(plan.builtIn).toBe(true)
    expect(isCandidate('police', infoOf(plan.target.source))).toBe(true)
    expect(plan.path.length).toBeGreaterThan(1)
    expect(plan.path[plan.path.length - 1]).toBe(plan.target.road)
  })

  it('plans in the kid city when it has a fitting building, starting by the station', () => {
    const plan = planMission(town(), { blueprints: [] }, 'fire', null, () => 0)
    expect(plan.builtIn).toBe(false)
    expect(plan.spawn.road).not.toBeNull()
    // The station spans cells 0..3 along x: its road cell is at the west end.
    expect(Number(plan.spawn.road!.split(',')[0])).toBeLessThanOrEqual(3)
  })

  it('plans fire and police missions in the sample town', () => {
    for (const kind of ['fire', 'police'] as const) {
      for (let i = 0; i < 6; i++) {
        const plan = planMission(sampleCity(), { blueprints: [] }, kind, null, () => i / 6)
        expect(plan.builtIn).toBe(false)
        expect(plan.target.road).not.toBeNull()
        expect(plan.field.get(plan.spawn.road!)).toBeGreaterThan(0)
      }
    }
  })
})

describe('rescue: the way there', () => {
  const city = town()
  const roads = freeRoads(city, infoOf)
  const field = roadField(roads, '10,5')

  it('measures road distance to the goal', () => {
    expect(field.get('10,5')).toBe(0)
    expect(field.get('0,5')).toBe(10)
    expect(field.has('0,0')).toBe(false)
    expect(roadPath(field, '7,5')).toEqual(['7,5', '8,5', '9,5', '10,5'])
  })

  it('points the arrow a couple of cells along the road, and at the stop when near or off the roads', () => {
    const ring = { x: 10.5 * CELL, z: 5.5 * CELL }
    const out = { x: 0, z: 0 }
    guidePoint(field, ring, 2.5 * CELL, 5.5 * CELL, out)
    expect(out).toEqual({ x: 4.5 * CELL, z: 5.5 * CELL })
    guidePoint(field, ring, 10 * CELL, 5.5 * CELL, out)
    expect(out).toEqual(ring)
    // Just off the road: back onto it.
    guidePoint(field, ring, 3.5 * CELL, 6.5 * CELL, out)
    expect(out.z).toBe(5.5 * CELL)
    // Far off the road (a field with no roads near): straight at the stop.
    guidePoint(field, ring, 3.5 * CELL, 12.5 * CELL, out)
    expect(out).toEqual(ring)
    // No roads at all.
    guidePoint(new Map(), ring, 0, 0, out)
    expect(out).toEqual(ring)
  })

  it('starts by the station facing the way, and arrives near the target', () => {
    const target = pickTarget(city, 'fire', infoOf, { from: { x: 0, z: 0 }, avoid: 'bakery' })!
    const f = roadField(roads, target.road)
    const spawn = missionSpawn(city, 'fire', infoOf, roads, f, target.ring)
    expect(Number(spawn.road!.split(',')[0])).toBeLessThanOrEqual(3)
    expect(spawn.road!.endsWith(',5')).toBe(true)
    // Facing +X (east, along the street): yaw -pi/2.
    expect(spawn.yaw).toBeCloseTo(yawTowards(1, 0))
    expect(yawTowards(0, -1)).toBeCloseTo(0)
    expect(hasArrived(target, spawn.x, spawn.z)).toBe(false)
    expect(hasArrived(target, target.ring.x + 3, target.ring.z)).toBe(true)
    expect(hasArrived(target, target.x, target.z)).toBe(true)
  })
})

describe('rescue: phases, hose and robber', () => {
  it('walks the phases in order and ignores anything else', () => {
    let p = missionStep('ringing', 'go')
    expect(p).toBe('ringing')
    for (const [e, want] of [['answer', 'call'], ['go', 'drive'], ['done', 'drive'], ['arrive', 'action'], ['done', 'cheer'], ['finish', 'summary'], ['again', 'ringing']] as const) {
      p = missionStep(p, e)
      expect(p).toBe(want)
    }
  })

  it('puts the fire out after holding the hose long enough, never going back', () => {
    let p = 0
    p = sprayStep(p, 1, false)
    expect(p).toBe(0)
    for (let t = 0; t < SPRAY_SECONDS - 0.05; t += 0.05) p = sprayStep(p, 0.05, true)
    expect(p).toBeLessThan(1)
    expect(fireLeft(p)).toBeGreaterThan(0)
    p = sprayStep(p, 0.05, false)
    expect(p).toBeLessThan(1)
    for (let i = 0; i < 5; i++) p = sprayStep(p, 0.05, true)
    expect(p).toBe(1)
    expect(fireLeft(p)).toBe(0)
    // A long frame counts as a short one (a backgrounded tab does not put the fire out at once).
    expect(sprayStep(0, 10, true)).toBeCloseTo(0.1 / SPRAY_SECONDS)
  })

  it('catches the robber with a tap once the car is there', () => {
    const r = newRobber()
    expect(tapRobber(r, 'drive').caught).toBe(false)
    const caught = tapRobber(r, 'action')
    expect(caught.caught).toBe(true)
    expect(tapRobber(caught, 'action')).toBe(caught)
  })

  it('puts the robber in front of the shop, between it and the road', () => {
    const t = { x: 40, z: 20, halfW: 8, halfD: 8, ring: { x: 44, z: 44 } }
    const spot = robberSpot(t)
    expect(spot.z).toBeGreaterThan(t.z + t.halfD)
    expect(spot.z).toBeLessThan(t.ring.z)
  })

  it('runs the robber round his spot, pausing each lap', () => {
    const out = { x: 0, z: 0, heading: 0, running: false }
    const seen = new Set<boolean>()
    for (let t = 0; t < 12; t += 0.1) {
      robberPose(t, { x: 50, z: 50 }, out)
      expect(Math.hypot(out.x - 50, out.z - 50)).toBeLessThanOrEqual(5.01)
      seen.add(out.running)
    }
    expect(seen).toEqual(new Set([true, false]))
  })
})

describe('rescue: rewards', () => {
  it('pays a mission, more when speedy', () => {
    expect(missionReward(20)).toEqual({ coins: 15, perfect: true })
    expect(missionReward(90)).toEqual({ coins: 10, perfect: false })
    expect(missionReward(NaN)).toEqual({ coins: 10, perfect: false })
  })

  it('records missions: coins, team counters and the brave-firefighter / super-police stickers', () => {
    const first = recordMission(emptyPlay(), 'fire', 30)
    expect(first.coins).toBe(15)
    expect(first.play.coins).toBe(15)
    expect(first.play.stats?.rescue.rounds).toBe(1)
    expect(first.play.stats?.rescue_fire.rounds).toBe(1)
    expect(first.stickers).toContain('rescue_first')
    expect(STICKER_BY_ID.rescue_first.name.en).toBe('Brave firefighter')
    expect(first.stickers).not.toContain('rescue_5')
    expect(nextKind(first.play)).toBe('police')

    const second = recordMission(first.play, 'police', 100)
    expect(second.coins).toBe(10)
    expect(second.stickers).toContain('rescue_5')
    expect(STICKER_BY_ID.rescue_5.name.en).toBe('Super police')
    expect(nextKind(second.play)).toBe('fire')
    // The team counters do not count twice toward the all-games totals.
    expect(second.play.stats?.rescue.customers).toBe(2)
  })

  it('starts with a fire call', () => {
    expect(nextKind(emptyPlay())).toBe('fire')
  })
})

describe('rescue: particle pool', () => {
  it('reuses slots round the ring and ages particles out', () => {
    const pool = new ParticlePool(3)
    for (let i = 0; i < 5; i++) pool.emit(i, 0, 0, 0, 1, 0, 1, 1)
    expect(pool.count()).toBe(3)
    expect([...pool.px].sort()).toEqual([2, 3, 4])
    pool.step(0.5, 0)
    expect(pool.py[0]).toBeCloseTo(0.5)
    pool.step(0.6, 0)
    expect(pool.count()).toBe(0)
  })

  it('carries fractional emission over frames', () => {
    const carry = { v: 0 }
    let n = 0
    for (let i = 0; i < 60; i++) n += emitCount(10, 1 / 60, carry)
    expect(n).toBeGreaterThanOrEqual(9)
    expect(n).toBeLessThanOrEqual(10)
  })
})
