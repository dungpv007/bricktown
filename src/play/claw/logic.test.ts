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
  resolveTry,
  roundOver,
  seededRng,
  triesLeft,
  type ClawRound,
  type PitPrize,
} from './logic'
import { DUPLICATE_COINS, PRIZES, PRIZE_COUNT, normalizePrizes } from './prizes'

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

  it('never slips on the first try', () => {
    const out = resolveTry(newClawRound(), PILE, 0, 0, always)
    expect(out).toMatchObject({ type: 'grab', slip: false })
  })

  it('slips at most once a round, and the try after a slip is guaranteed anywhere', () => {
    let round: ClawRound = applyTry(newClawRound(), resolveTry(newClawRound(), PILE, 0, 0, always))
    expect(round.won).toEqual(['cat'])
    const slip = resolveTry(round, PILE, 0, 0, always)
    expect(slip).toMatchObject({ type: 'grab', slip: true })
    round = applyTry(round, slip)
    expect(round).toMatchObject({ used: 2, won: ['cat'], slipped: true, guaranteed: true })
    // Guaranteed: grabs even far from every prize, and does not slip.
    const sure = resolveTry(round, PILE, PIT.minX, PIT.maxZ, always)
    expect(sure).toMatchObject({ type: 'grab', slip: false })
    round = applyTry(round, sure)
    expect(round.guaranteed).toBe(false)
    // No second slip, however unlucky.
    expect(resolveTry(round, PILE, 0, 0, always)).toMatchObject({ slip: false })
  })

  it('does not slip on the last try (its guarantee would be lost)', () => {
    const round: ClawRound = { used: MAX_TRIES - 1, won: [], slipped: false, guaranteed: false }
    expect(resolveTry(round, PILE, 0, 0, always)).toMatchObject({ slip: false })
  })

  it('slips about a quarter of the time', () => {
    const rng = seededRng(7)
    let slips = 0
    const round: ClawRound = { used: 1, won: [], slipped: false, guaranteed: false }
    for (let i = 0; i < 2000; i++) if ((resolveTry(round, PILE, 0, 0, rng) as { slip?: boolean }).slip) slips++
    expect(slips / 2000).toBeGreaterThan(0.2)
    expect(slips / 2000).toBeLessThan(0.3)
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
    const owned = PRIZES.slice(0, 6).map((p) => p.id)
    const kinds = pickKinds(seededRng(1), owned, 6000)
    const unowned = kinds.filter((k) => !owned.includes(k)).length / kinds.length
    expect(unowned).toBeGreaterThan(0.7) // 6 kinds x 3 vs 6 x 1: about 0.75
  })
})

describe('prize cabinet', () => {
  it('has 12 kinds with unique ids', () => {
    expect(PRIZE_COUNT).toBe(12)
    expect(new Set(PRIZES.map((p) => p.id)).size).toBe(12)
  })

  it('normalises the saved prizes: known kinds only, each once', () => {
    expect(normalizePrizes(['cat', 'cat', 'dragon', 3, '__proto__', 'star'])).toEqual(['cat', 'star'])
    expect(normalizePrizes('cat')).toEqual([])
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

  it('awards six kinds and the whole collection', () => {
    let play = emptyPlay()
    const earned: string[] = []
    for (const p of PRIZES) {
      const r = collectPrize(play, p.id)
      earned.push(...r.stickers)
      play = r.play
    }
    expect(earned).toEqual(['claw_first', 'claw_6', 'claw_all'])
    expect(play.prizes).toHaveLength(12)
  })
})
