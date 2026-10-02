import { describe, expect, it } from 'vitest'
import { emptyPlay, MAX_ROUND_COINS, recordRound } from '../rewards'
import {
  basketTotal,
  changeDone,
  coinBreakdown,
  customerReward,
  DRAWER_COINS,
  giveChange,
  ITEM_KINDS,
  LEVELS,
  makeBasket,
  MAX_CHANGE,
  payment,
  planRound,
  PRICES,
  roundReward,
  seededRng,
  SHOPPERS,
  type Level,
} from './logic'

const LEVEL_IDS: Level[] = ['small', 'big']

describe('grocery baskets', () => {
  it('every item has a positive whole price', () => {
    for (const k of ITEM_KINDS) expect(Number.isInteger(PRICES[k]) && PRICES[k] > 0).toBe(true)
  })

  it('adds up a basket', () => {
    expect(basketTotal([])).toBe(0)
    expect(basketTotal(['apple', 'milk', 'car'])).toBe(1 + 3 + 5)
  })

  for (const level of LEVEL_IDS) {
    it(`${level}: item count, distinct items and total stay in the level's rules`, () => {
      const rules = LEVELS[level]
      const counts = new Set<number>()
      for (let seed = 1; seed <= 500; seed++) {
        const basket = makeBasket(level, seededRng(seed))
        counts.add(basket.length)
        expect(basket.length).toBeGreaterThanOrEqual(rules.minItems)
        expect(basket.length).toBeLessThanOrEqual(rules.maxItems)
        expect(new Set(basket).size).toBe(basket.length)
        expect(basketTotal(basket)).toBeLessThanOrEqual(rules.maxTotal)
      }
      // Every size of basket shows up.
      expect(counts.size).toBe(rules.maxItems - rules.minItems + 1)
    })
  }

  it('the same seed gives the same basket', () => {
    expect(makeBasket('big', seededRng(42))).toEqual(makeBasket('big', seededRng(42)))
  })
})

describe('grocery payment', () => {
  it('small: the customer pays exactly, no change', () => {
    for (let total = 1; total <= 10; total++) expect(payment(total, 'small', seededRng(total))).toEqual({ paid: total, change: 0 })
  })

  it('big: pays with 5, 10 or 20 above the total; change 1..19', () => {
    const changes = new Set<number>()
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seededRng(seed)
      const total = 2 + Math.floor(rng() * 17)
      const { paid, change } = payment(total, 'big', rng)
      expect([5, 10, 20]).toContain(paid)
      expect(paid).toBeGreaterThan(total)
      expect(change).toBe(paid - total)
      expect(change).toBeGreaterThanOrEqual(1)
      expect(change).toBeLessThan(MAX_CHANGE)
      changes.add(change)
    }
    expect(Math.max(...changes)).toBeGreaterThan(10) // counting past ten happens
  })

  it('plans a round of 4 different shoppers with consistent totals', () => {
    for (const level of LEVEL_IDS) {
      const round = planRound(level, seededRng(7))
      expect(round).toHaveLength(4)
      expect(new Set(round.map((c) => c.fig)).size).toBe(4)
      for (const c of round) {
        expect(SHOPPERS).toContain(c.fig)
        expect(c.total).toBe(basketTotal(c.items))
        expect(c.paid - c.change).toBe(c.total)
        if (level === 'small') expect(c.change).toBe(0)
        else expect(c.change).toBeGreaterThan(0)
      }
    }
  })
})

describe('grocery change', () => {
  it('accepts coins up to the change and refuses an overshoot', () => {
    expect(giveChange(0, 5, 7)).toBe(5)
    expect(giveChange(5, 2, 7)).toBe(7)
    expect(giveChange(5, 5, 7)).toBeNull()
    expect(giveChange(6, 2, 7)).toBeNull()
    expect(giveChange(0, 0, 7)).toBeNull()
    expect(giveChange(0, -1, 7)).toBeNull()
  })

  it('is done exactly at the change', () => {
    expect(changeDone(6, 7)).toBe(false)
    expect(changeDone(7, 7)).toBe(true)
  })

  it('any change up to 20 can be made by tapping 1 coins (never stuck)', () => {
    for (let change = 1; change <= MAX_CHANGE; change++) {
      let given = 0
      while (!changeDone(given, change)) given = giveChange(given, DRAWER_COINS[0], change)!
      expect(given).toBe(change)
    }
  })

  it('breaks an amount into coin pictures', () => {
    expect(coinBreakdown(0)).toEqual([])
    expect(coinBreakdown(13)).toEqual([10, 1, 1, 1])
    expect(coinBreakdown(17)).toEqual([10, 5, 1, 1])
    expect(coinBreakdown(7, [1, 5])).toEqual([5, 1, 1])
  })
})

describe('grocery rewards', () => {
  it('pays more on the big level, within the round cap', () => {
    expect(customerReward('small')).toBe(3)
    expect(customerReward('big')).toBeGreaterThan(customerReward('small'))
    expect(roundReward('big')).toBeLessThanOrEqual(MAX_ROUND_COINS)
  })

  it('a round puts its coins in the wallet and earns the first cashier sticker; five rounds make a super cashier', () => {
    let play = emptyPlay()
    const first = recordRound(play, 'grocery', { customers: 4, coins: roundReward('small'), perfect: false })
    expect(first.coins).toBe(12)
    expect(first.play.coins).toBe(12)
    expect(first.stickers).toContain('grocery_first')
    expect(first.stickers).not.toContain('grocery_perfect')
    play = first.play
    let last = first
    for (let i = 0; i < 4; i++) {
      last = recordRound(play, 'grocery', { customers: 4, coins: roundReward('big'), perfect: i === 3 })
      play = last.play
    }
    expect(last.stickers).toContain('grocery_5')
    expect(last.stickers).toContain('grocery_perfect')
    expect(play.coins).toBe(12 + 4 * 16)
  })
})
