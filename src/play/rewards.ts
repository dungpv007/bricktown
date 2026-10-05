import { normalizePrizes } from './claw/prizes'
import { newStickers } from './stickers'
import type { GameId, GameStats, PlayData, RoundResult } from './types'
import { UNLOCKABLE_BY_ID } from './unlocks'

/**
 * The coin wallet, stickers and shop purchases as pure functions over `PlayData` (the store
 * wrappers are in play/usePlay). Nothing here can make coins negative or exceed the caps.
 */

/** Most coins a wallet holds. */
export const MAX_COINS = 99_999
/** Most coins one round can pay. */
export const MAX_ROUND_COINS = 100
/** Most customers one round can count. */
export const MAX_ROUND_CUSTOMERS = 20
/** Coins a served customer usually pays (games may pay more for a bonus). */
export const COINS_PER_CUSTOMER = 3

export const emptyPlay = (): PlayData => ({ coins: 0, stickers: [], unlocked: [] })

const clampInt = (v: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0)

/** `play` with `n` more coins (n < 0 takes coins away, never below 0). */
export function addCoins(play: PlayData, n: number): PlayData {
  return { ...play, coins: clampInt(play.coins + (Number.isFinite(n) ? Math.trunc(n) : 0), MAX_COINS) }
}

/** `play` with `n` coins spent, or null when there are not enough (or `n` is not a positive whole number). */
export function spendCoins(play: PlayData, n: number): PlayData | null {
  if (!Number.isInteger(n) || n < 0 || n > play.coins) return null
  return { ...play, coins: play.coins - n }
}

/** Adds every sticker the kid has now reached; `added` lists the new ones (book order). */
export function awardStickers(play: PlayData): { play: PlayData; added: string[] } {
  const added = newStickers(play)
  return added.length === 0 ? { play, added } : { play: { ...play, stickers: [...play.stickers, ...added] }, added }
}

export interface RoundOutcome {
  play: PlayData
  /** Coins actually paid (after clamping). */
  coins: number
  /** Stickers earned by this round. */
  stickers: string[]
}

/** A finished round of `game`: pays its coins, counts it in the game's stats and awards stickers. */
export function recordRound(play: PlayData, game: GameId, result: RoundResult): RoundOutcome {
  const coins = clampInt(result.coins, MAX_ROUND_COINS)
  const customers = clampInt(result.customers, MAX_ROUND_CUSTOMERS)
  const before: GameStats = play.stats?.[game] ?? { rounds: 0, customers: 0, perfect: 0, coins: 0 }
  const stats: GameStats = {
    rounds: before.rounds + 1,
    customers: before.customers + customers,
    perfect: before.perfect + (result.perfect ? 1 : 0),
    coins: before.coins + coins,
  }
  const paid = addCoins({ ...play, stats: { ...play.stats, [game]: stats } }, coins)
  const { play: next, added } = awardStickers(paid)
  return { play: next, coins: next.coins - play.coins, stickers: added }
}

export type BuyError = 'unknown' | 'owned' | 'coins'

/** Buys shop item `id`: the new play data (coins spent, item owned, stickers awarded), or why not. */
export function buyUnlock(play: PlayData, id: string): { play: PlayData; stickers: string[] } | { error: BuyError } {
  const item = UNLOCKABLE_BY_ID[id]
  if (!item) return { error: 'unknown' }
  if (play.unlocked.includes(id)) return { error: 'owned' }
  const paid = spendCoins(play, item.price)
  if (!paid) return { error: 'coins' }
  const { play: next, added } = awardStickers({ ...paid, unlocked: [...paid.unlocked, id] })
  return { play: next, stickers: added }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
/** Saved ids: short lowercase words (stickers, unlocks and game ids a newer version adds are kept too). */
const ID = /^[a-z0-9_]{1,40}$/
/** Keys that must never become own properties of a record built from a file. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ID.test(x)))] : [])
const count = (v: unknown, max = 1e9): number => (typeof v === 'number' ? clampInt(v, max) : 0)

/**
 * `SaveData.play` as stored, made safe: undefined when absent or not an object (nothing earned);
 * coins clamped to 0..MAX_COINS; sticker and unlock lists keep distinct id-like strings; stats keep
 * id-like game keys with whole, non-negative counters; claw prizes keep known kinds, each once.
 */
export function normalizePlay(raw: unknown): PlayData | undefined {
  if (!isRecord(raw)) return undefined
  const out: PlayData = { coins: count(raw.coins, MAX_COINS), stickers: ids(raw.stickers), unlocked: ids(raw.unlocked) }
  if (isRecord(raw.stats)) {
    const stats: Record<string, GameStats> = {}
    for (const [game, s] of Object.entries(raw.stats)) {
      if (!ID.test(game) || UNSAFE_KEYS.has(game) || !isRecord(s)) continue
      stats[game] = { rounds: count(s.rounds), customers: count(s.customers), perfect: count(s.perfect), coins: count(s.coins) }
    }
    if (Object.keys(stats).length > 0) out.stats = stats
  }
  const prizes = normalizePrizes(raw.prizes)
  if (prizes.length > 0) out.prizes = prizes
  return out
}
