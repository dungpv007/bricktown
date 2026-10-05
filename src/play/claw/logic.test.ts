import { describe, expect, it } from 'vitest'
import { emptyPlay, normalizePlay } from '../rewards'
import { collectPrize } from './collection'
import {
  GRAB_RADIUS,
  MAX_TRIES,
  PILE_SIZE,
  PIT,
  applyTry,
  clampClaw,
  makePile,
  nearestPrize,
  newClawRound,
  pickKinds,
  isGuaranteed,
  MERCY_AFTER,
  SLIP_CHANCE,
  resolveTry,
  roundOver,
  seededRng,
  triesLeft,
  type ClawRound,
  type PitPrize,
} from './logic'
import { DUPLICATE_COINS, GIFT_CONTENTS, GIFT_LOOKS, PRIZES, PRIZE_BY_ID, PRIZE_COUNT, VEHICLE_SHARE, isPrizeId, normalizePrizes } from './prizes'

const prize = (id: number, x: number, z: number, kind = 'bunny'): PitPrize => ({ id, kind, x, z, rot: 0 })
const PILE = [prize(0, -3, 0, 'bunny'), prize(1, 0, 0, 'cat'), prize(2, 3, -2, 'panda')]
const never = () => 0.99
const always = () => 0

describe('claw machine rules', () => {
  it('keeps the claw inside the pit', () => {
    expect(clampClaw(99, -99)).toEqual({ x: PIT.maxX, z: PIT.minZ })
    expect(clampClaw(1, 2)).toEqual({ x: 1, z: 2 })
    expect(clampClaw(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ x: 0, z: 0 })
  })

  it('grabs the nearest prize within the generous radius, nothing when none is near', () => {
    expect(nearestPrize(PILE, 0.4, 0.3)?.id).toBe(1)
    expect(nearestPrize(PILE, -1.6, 0)?.id).toBe(0) // between two: the nearer one
    expect(nearestPrize(PILE, -3 + GRAB_RADIUS * 0.99, 0)?.id).toBe(0)
    expect(nearestPrize(PILE, 0, 3.4)).toBeNull()
    expect(resolveTry(newClawRound(), PILE, 0, 3.4, never)).toEqual({ type: 'miss' })
  })

  it('a grab may slip on any try, a miss never does', () => {
    expect(resolveTry(newClawRound(), PILE, 0, 0, always)).toMatchObject({ type: 'grab', slip: true })
    expect(resolveTry(newClawRound(), PILE, 0, 0, never)).toMatchObject({ type: 'grab', slip: false })
    expect(resolveTry(newClawRound(), PILE, 0, 3.4, always)).toEqual({ type: 'miss' })
  })

  it('slips about one grab in five', () => {
    const rng = seededRng(7)
    let slips = 0
    for (let i = 0; i < 4000; i++) if ((resolveTry(newClawRound(), PILE, 0, 0, rng) as { slip?: boolean }).slip) slips++
    expect(SLIP_CHANCE).toBe(0.2)
    expect(slips / 4000).toBeGreaterThan(0.17)
    expect(slips / 4000).toBeLessThan(0.23)
  })

  it('mercy: after two slips in a row the next grab holds; misses do not break the run, a hold resets it', () => {
    let round: ClawRound = newClawRound()
    for (let i = 0; i < MERCY_AFTER; i++) {
      expect(isGuaranteed(round)).toBe(false)
      round = applyTry(round, resolveTry(round, PILE, 0, 0, always))
    }
    expect(round).toMatchObject({ used: 2, won: [], streak: 2 })
    round = applyTry(round, { type: 'miss' })
    expect(isGuaranteed(round)).toBe(true)
    const sure = resolveTry(round, PILE, 0, 0, always)
    expect(sure).toMatchObject({ type: 'grab', slip: false })
    round = applyTry(round, sure)
    expect(round).toMatchObject({ won: ['cat'], streak: 0 })
    expect(resolveTry(round, PILE, 0, 0, always)).toMatchObject({ slip: true })
  })

  it('a round is five tries, misses count too', () => {
    let round = newClawRound()
    for (let i = 0; i < MAX_TRIES; i++) {
      expect(roundOver(round)).toBe(false)
      round = applyTry(round, i % 2 ? { type: 'miss' } : resolveTry(round, PILE, 0, 0, never))
    }
    expect(roundOver(round)).toBe(true)
    expect(triesLeft(round)).toBe(0)
    expect(round.won).toEqual(['cat', 'cat', 'cat'])
    expect(applyTry(round, { type: 'miss' })).toBe(round)
    expect(resolveTry(round, PILE, 0, 0, never)).toEqual({ type: 'miss' })
  })

  it('builds a deterministic pile inside the pit, weighted toward kinds not owned yet', () => {
    const a = makePile(seededRng(42), [])
    expect(a).toEqual(makePile(seededRng(42), []))
    expect(a).toHaveLength(PILE_SIZE)
    expect(new Set(a.map((p) => p.id)).size).toBe(PILE_SIZE)
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(PIT.minX)
      expect(p.x).toBeLessThanOrEqual(PIT.maxX)
      expect(p.z).toBeGreaterThanOrEqual(PIT.minZ)
      expect(p.z).toBeLessThanOrEqual(PIT.maxZ)
    }
    const owned = PRIZES.slice(0, 5).map((p) => p.id)
    const kinds = pickKinds(seededRng(1), owned, 6000)
    const unowned = kinds.filter((k) => !owned.includes(k)).length / kinds.length
    expect(unowned).toBeGreaterThan(0.7) // 5 kinds x 3 vs 5 x 1: about 0.75
  })

  it('vehicles are 60% of the draws, in the pit and inside gifts alike', () => {
    let pitVehicles = 0
    let pit = 0
    let giftVehicles = 0
    let gifts = 0
    for (let seed = 1; seed <= 600; seed++) {
      for (const p of makePile(seededRng(seed), PRIZES.slice(0, 4).map((q) => q.id))) {
        const vehicle = PRIZE_BY_ID[p.kind].group === 'vehicle'
        if (p.gift) {
          gifts++
          if (vehicle) giftVehicles++
        } else {
          pit++
          if (vehicle) pitVehicles++
        }
      }
    }
    expect(VEHICLE_SHARE).toBe(0.6)
    expect(pitVehicles / pit).toBeGreaterThan(0.57)
    expect(pitVehicles / pit).toBeLessThan(0.63)
    expect(giftVehicles / gifts).toBeGreaterThan(0.55)
    expect(giftVehicles / gifts).toBeLessThan(0.65)
  })

  it('about a third of the pile are gift boxes, each hiding an animal or a vehicle', () => {
    let gifts = 0
    let total = 0
    for (let seed = 1; seed <= 200; seed++) {
      for (const p of makePile(seededRng(seed), [])) {
        total++
        if (!p.gift) continue
        gifts++
        expect(GIFT_LOOKS).toContain(p.gift)
        expect(GIFT_CONTENTS).toContain(p.kind)
        expect(PRIZE_BY_ID[p.kind].group).not.toBe('toy')
      }
    }
    expect(gifts / total).toBeGreaterThan(0.25)
    expect(gifts / total).toBeLessThan(0.35)
    // Inside a gift: kinds not owned yet come up more often too.
    const owned = GIFT_CONTENTS.slice(0, 4)
    const inside = pickKinds(seededRng(3), owned, 4000, GIFT_CONTENTS)
    expect(inside.every((k) => GIFT_CONTENTS.includes(k))).toBe(true)
    expect(inside.filter((k) => !owned.includes(k)).length / inside.length).toBeGreaterThan(0.7)
  })
})

describe('prize cabinet', () => {
  it('has 18 kinds with unique ids: 6 animals, 10 vehicles, a ball and a star (gifts are boxes, not kinds)', () => {
    expect(PRIZE_COUNT).toBe(18)
    expect(new Set(PRIZES.map((p) => p.id)).size).toBe(18)
    expect(PRIZES.filter((p) => p.group === 'animal')).toHaveLength(6)
    expect(PRIZES.filter((p) => p.group === 'vehicle')).toHaveLength(10)
    for (const look of GIFT_LOOKS) expect(isPrizeId(look)).toBe(false)
  })

  it('normalises the saved prizes: known kinds only, each once', () => {
    expect(normalizePrizes(['cat', 'cat', 'dragon', 3, '__proto__', 'star'])).toEqual(['cat', 'star'])
    expect(normalizePrizes('cat')).toEqual([])
    // Gift boxes were kinds once: such saves drop them harmlessly.
    expect(normalizePrizes(['gift_box', 'bunny', 'gift_round'])).toEqual(['bunny'])
    expect(normalizePlay({ coins: 1, stickers: [], unlocked: [], prizes: ['panda', 'nope', 'panda'] })?.prizes).toEqual(['panda'])
    expect(normalizePlay({ coins: 1, stickers: [], unlocked: [] })).not.toHaveProperty('prizes')
  })

  it('a new kind goes on the shelf (with stickers), a duplicate turns into coins', () => {
    const first = collectPrize(emptyPlay(), 'bunny')
    expect(first).toMatchObject({ isNew: true, coins: 0, stickers: ['claw_first'] })
    expect(first.play.prizes).toEqual(['bunny'])
    const dup = collectPrize(first.play, 'bunny')
    expect(dup).toMatchObject({ isNew: false, coins: DUPLICATE_COINS, stickers: [] })
    expect(dup.play.prizes).toEqual(['bunny'])
    expect(dup.play.coins).toBe(first.play.coins + DUPLICATE_COINS)
    expect(collectPrize(dup.play, 'dragon').play).toBe(dup.play)
  })

  it('awards the first prize, half the set (9) and the whole set (18)', () => {
    let play = emptyPlay()
    const earned: string[] = []
    for (const p of PRIZES) {
      const r = collectPrize(play, p.id)
      earned.push(...r.stickers)
      play = r.play
    }
    expect(earned).toEqual(['claw_first', 'claw_6', 'claw_all'])
    expect(play.prizes).toHaveLength(18)
  })
})
