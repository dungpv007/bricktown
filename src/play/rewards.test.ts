import { describe, expect, it } from 'vitest'
import { FIG_PRESETS } from '../core/figures'
import { PART_BY_ID } from '../core/parts/catalog'
import { createEmptySave, migrate } from '../core/serialize'
import { newRound, roundReducer } from './kit/round'
import { gameById, gameForSource, GAMES } from './registry'
import { addCoins, buyUnlock, emptyPlay, MAX_COINS, MAX_ROUND_COINS, normalizePlay, recordRound, spendCoins } from './rewards'
import { STICKERS } from './stickers'
import type { PlayData } from './types'
import { isLocked, UNLOCKABLES } from './unlocks'

const withCoins = (coins: number): PlayData => ({ ...emptyPlay(), coins })

describe('wallet', () => {
  it('adds coins, clamped to 0..MAX_COINS', () => {
    expect(addCoins(withCoins(5), 10).coins).toBe(15)
    expect(addCoins(withCoins(5), -50).coins).toBe(0)
    expect(addCoins(withCoins(MAX_COINS - 1), 10).coins).toBe(MAX_COINS)
    expect(addCoins(withCoins(5), Number.NaN).coins).toBe(5)
  })

  it('spends only what is there, in whole positive amounts', () => {
    expect(spendCoins(withCoins(10), 4)?.coins).toBe(6)
    expect(spendCoins(withCoins(10), 10)?.coins).toBe(0)
    expect(spendCoins(withCoins(10), 11)).toBeNull()
    expect(spendCoins(withCoins(10), -1)).toBeNull()
    expect(spendCoins(withCoins(10), 1.5)).toBeNull()
  })
})

describe('rounds and stickers', () => {
  it('pays the round, counts it per game and awards the first stickers once', () => {
    const first = recordRound(emptyPlay(), 'sushi', { customers: 4, coins: 12, perfect: true })
    expect(first.coins).toBe(12)
    expect(first.play.coins).toBe(12)
    expect(first.play.stats?.sushi).toEqual({ rounds: 1, customers: 4, perfect: 1, coins: 12 })
    expect(first.stickers).toEqual(['first_customer', 'perfect_first', 'sushi_first', 'sushi_perfect'])
    const second = recordRound(first.play, 'sushi', { customers: 4, coins: 12 })
    expect(second.stickers).toEqual([])
    expect(second.play.stickers).toHaveLength(4)
  })

  it('reaches milestones: 10 customers, 5 rounds of a game, every game', () => {
    let play = emptyPlay()
    for (let i = 0; i < 5; i++) play = recordRound(play, 'bakery', { customers: 2, coins: 6 }).play
    expect(play.stickers).toEqual(expect.arrayContaining(['customers_10', 'rounds_5', 'bakery_5']))
    expect(play.stickers).not.toContain('all_games')
    for (const g of ['sushi', 'grocery', 'rescue']) play = recordRound(play, g, { customers: 1, coins: 1 }).play
    expect(play.stickers).not.toContain('all_games') // the claw machine is a role too
    play = recordRound(play, 'claw', { customers: 1, coins: 0 }).play
    expect(play.stickers).toContain('all_games')
  })

  it('clamps what a round can pay; the demo earns no game stickers', () => {
    const r = recordRound(emptyPlay(), 'demo', { customers: 999, coins: 10_000 })
    expect(r.coins).toBe(MAX_ROUND_COINS)
    expect(r.play.stats?.demo.customers).toBe(20)
    expect(r.stickers).toEqual([])
  })

  it('has 27 stickers with unique ids', () => {
    expect(STICKERS).toHaveLength(27)
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(27)
  })
})

describe('unlock shop', () => {
  it('offers at least 6 items that exist in the catalog / presets', () => {
    expect(UNLOCKABLES.length).toBeGreaterThanOrEqual(6)
    for (const u of UNLOCKABLES) {
      if (u.kind === 'part') expect(PART_BY_ID[u.ref], u.id).toBeDefined()
      else expect(FIG_PRESETS.some((p) => p.id === u.ref), u.id).toBe(true)
    }
  })

  it('locks only shop items, until bought', () => {
    expect(isLocked(undefined, 'figure', 'police')).toBe(false)
    expect(isLocked(undefined, 'part', 'brick_2x4')).toBe(false)
    expect(isLocked(undefined, 'figure', 'king')).toBe(true)
    expect(isLocked({ ...emptyPlay(), unlocked: ['fig_king'] }, 'figure', 'king')).toBe(false)
  })

  it('buys with coins, never below zero, never twice', () => {
    const item = UNLOCKABLES[0]
    expect(buyUnlock(withCoins(item.price - 1), item.id)).toEqual({ error: 'coins' })
    const bought = buyUnlock(withCoins(item.price), item.id)
    if ('error' in bought) throw new Error(bought.error)
    expect(bought.play.coins).toBe(0)
    expect(bought.play.unlocked).toEqual([item.id])
    expect(bought.stickers).toEqual(['shopper'])
    expect(buyUnlock({ ...bought.play, coins: 999 }, item.id)).toEqual({ error: 'owned' })
    expect(buyUnlock(withCoins(999), 'nope')).toEqual({ error: 'unknown' })
  })
})

describe('normalizePlay', () => {
  it('keeps valid data and repairs the rest', () => {
    expect(normalizePlay(undefined)).toBeUndefined()
    expect(normalizePlay('rich')).toBeUndefined()
    expect(normalizePlay({})).toEqual({ coins: 0, stickers: [], unlocked: [] })
    expect(
      normalizePlay({
        coins: -5,
        stickers: ['sushi_first', 'sushi_first', 42, 'Bad Id'],
        unlocked: ['fig_king', null],
        stats: JSON.parse('{"sushi":{"rounds":2.7,"customers":-1,"perfect":"x","coins":9},"__proto__":{"rounds":1},"Bad!":{}}'),
      }),
    ).toEqual({ coins: 0, stickers: ['sushi_first'], unlocked: ['fig_king'], stats: { sushi: { rounds: 2, customers: 0, perfect: 0, coins: 9 } } })
    expect(normalizePlay({ coins: 1e12 })?.coins).toBe(MAX_COINS)
  })

  it('is applied when a save loads, and absent play stays absent', () => {
    const base = createEmptySave()
    expect(migrate(base).play).toBeUndefined()
    const loaded = migrate({ ...base, play: { coins: 7.9, stickers: ['first_customer'], unlocked: [] } })
    expect(loaded.play).toEqual({ coins: 7, stickers: ['first_customer'], unlocked: [] })
    expect(migrate({ ...base, play: 'garbage' }).play).toBeUndefined()
  })
})

describe('round flow', () => {
  it('intro, then customers, then the summary', () => {
    let s = newRound(2)
    expect(roundReducer(s, { type: 'serve', coins: 3 })).toBe(s) // not started
    s = roundReducer(s, { type: 'start' })
    s = roundReducer(s, { type: 'mistake' })
    s = roundReducer(s, { type: 'serve', coins: 3 })
    expect(s).toMatchObject({ phase: 'serving', customer: 1, coins: 3, mistakes: 1 })
    s = roundReducer(s, { type: 'serve', coins: 4 })
    expect(s).toMatchObject({ phase: 'summary', customer: 2, coins: 7 })
    expect(roundReducer(s, { type: 'again' })).toMatchObject({ phase: 'serving', customer: 0, coins: 0, mistakes: 0 })
  })
})

describe('registry', () => {
  it('maps the shop templates to the planned games', () => {
    expect(gameForSource('tpl:sushi_restaurant')?.id).toBe('sushi')
    expect(gameForSource('tpl:bakery')?.id).toBe('bakery')
    expect(gameForSource('tpl:grocery')?.id).toBe('grocery')
    for (const t of ['fire_station', 'police_station', 'police_hq']) expect(gameForSource(`tpl:${t}`)?.id).toBe('rescue')
    expect(gameForSource('tpl:arcade')?.id).toBe('claw')
    expect(gameForSource('tpl:house_small')).toBeUndefined()
    expect(gameForSource('tpl:__proto__')).toBeUndefined()
    expect(gameForSource('bp_sushi_restaurant')).toBeUndefined() // the kid's own blueprints offer no game
    expect(gameById('demo')?.templates).toEqual([])
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length)
  })
})
