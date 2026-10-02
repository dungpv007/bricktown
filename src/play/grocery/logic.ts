/**
 * The grocery cashier's rules, pure (unit-tested): what each customer buys, the total, what they
 * pay with, and giving change. No three.js here.
 *
 * Two levels:
 * - `small` (Bé nhỏ): 2-4 items, total up to 10, the customer pays exactly: no change, tap "pay".
 * - `big` (Bé lớn): 3-5 items, total up to 18, the customer pays with 5, 10 or 20 and the kid counts
 *   the change (1..19) out of the drawer with 1, 2 and 5 coins.
 */

export type Level = 'small' | 'big'

export const ITEM_KINDS = ['apple', 'banana', 'water', 'bread', 'milk', 'duck', 'melon', 'car'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

/** Fixed prices (coins), so a kid can learn them. */
export const PRICES: Record<ItemKind, number> = {
  apple: 1,
  water: 1,
  banana: 2,
  bread: 2,
  milk: 3,
  duck: 3,
  melon: 4,
  car: 5,
}

export interface LevelRules {
  minItems: number
  maxItems: number
  maxTotal: number
  /** Coins the customer can pay with (big level); the amount paid is one of these above the total. */
  notes: readonly number[]
  /** Coins earned per customer served. */
  reward: number
}

export const LEVELS: Record<Level, LevelRules> = {
  small: { minItems: 2, maxItems: 4, maxTotal: 10, notes: [], reward: 3 },
  big: { minItems: 3, maxItems: 5, maxTotal: 18, notes: [5, 10, 20], reward: 4 },
}

/** Most change a customer can ever ask for. */
export const MAX_CHANGE = 20

/** Coins the kid can hand back as change. */
export const DRAWER_COINS = [1, 2, 5] as const

/** Customers per round. */
export const CUSTOMERS_PER_ROUND = 4

/** Figure presets that come to the shop (no robbers). */
export const SHOPPERS = ['customer', 'kid', 'customer2', 'doctor', 'princess', 'construction', 'astronaut', 'superstar', 'king'] as const

export type Rng = () => number

/** A small seeded random generator (mulberry32), for repeatable baskets in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rng: Rng, n: number): number => Math.min(n - 1, Math.floor(rng() * n))

export const basketTotal = (items: readonly ItemKind[]): number => items.reduce((sum, k) => sum + PRICES[k], 0)

/**
 * What one customer buys: `minItems..maxItems` different items, adding up to at most `maxTotal`.
 * Picks without repeats, then swaps the dearest item for the cheapest left until it fits.
 */
export function makeBasket(level: Level, rng: Rng): ItemKind[] {
  const rules = LEVELS[level]
  const count = rules.minItems + pick(rng, rules.maxItems - rules.minItems + 1)
  const pool: ItemKind[] = [...ITEM_KINDS]
  const basket: ItemKind[] = []
  for (let i = 0; i < count; i++) basket.push(pool.splice(pick(rng, pool.length), 1)[0])
  while (basketTotal(basket) > rules.maxTotal) {
    let dear = 0
    for (let i = 1; i < basket.length; i++) if (PRICES[basket[i]] > PRICES[basket[dear]]) dear = i
    let cheap = -1
    for (let i = 0; i < pool.length; i++) if (cheap < 0 || PRICES[pool[i]] < PRICES[pool[cheap]]) cheap = i
    if (cheap < 0 || PRICES[pool[cheap]] >= PRICES[basket[dear]]) {
      // Nothing cheaper left: drop the dearest item (never below the minimum, which always fits).
      if (basket.length <= rules.minItems) break
      basket.splice(dear, 1)
      continue
    }
    const swapped = basket[dear]
    basket[dear] = pool[cheap]
    pool[cheap] = swapped
  }
  return basket
}

/**
 * What the customer hands over for `total`: exactly the total on the small level; on the big level
 * one of the notes above the total (chosen at random), so there is change of 1..MAX_CHANGE - 1.
 */
export function payment(total: number, level: Level, rng: Rng): { paid: number; change: number } {
  const notes = LEVELS[level].notes.filter((n) => n > total && n - total < MAX_CHANGE)
  if (notes.length === 0) return { paid: total, change: 0 }
  const paid = notes[pick(rng, notes.length)]
  return { paid, change: paid - total }
}

export interface Customer {
  fig: string
  items: ItemKind[]
  total: number
  paid: number
  change: number
}

/** The customers of a round: different shoppers, each with a basket and a payment. */
export function planRound(level: Level, rng: Rng, customers = CUSTOMERS_PER_ROUND): Customer[] {
  const figs: string[] = [...SHOPPERS]
  const out: Customer[] = []
  for (let i = 0; i < customers; i++) {
    const fig = figs.length > 0 ? figs.splice(pick(rng, figs.length), 1)[0] : SHOPPERS[i % SHOPPERS.length]
    const items = makeBasket(level, rng)
    const total = basketTotal(items)
    out.push({ fig, items, total, ...payment(total, level, rng) })
  }
  return out
}

/**
 * Hands one more `coin` of change: the new amount given, or null when it would be more than the
 * `change` owed (the coin wobbles back: try a smaller one).
 */
export function giveChange(given: number, coin: number, change: number): number | null {
  if (!Number.isInteger(coin) || coin <= 0) return null
  const next = given + coin
  return next > change ? null : next
}

export const changeDone = (given: number, change: number): boolean => given === change

/** Coin pictures for `amount`: as few coins as possible from `coins` (biggest first). */
export function coinBreakdown(amount: number, coins: readonly number[] = [10, 5, 1]): number[] {
  const out: number[] = []
  let left = Math.max(0, Math.floor(amount))
  for (const c of [...coins].sort((a, b) => b - a)) {
    while (left >= c) {
      out.push(c)
      left -= c
    }
  }
  return out
}

/** Coins a served customer pays the kid on this level. */
export const customerReward = (level: Level): number => LEVELS[level].reward

/** Coins a whole round pays (`customers` served on `level`). */
export const roundReward = (level: Level, customers = CUSTOMERS_PER_ROUND): number => customerReward(level) * customers
