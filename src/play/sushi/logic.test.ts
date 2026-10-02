import { describe, expect, it } from 'vitest'
import {
  BASE_COINS,
  CUSTOMER_FIGS,
  MENU,
  coinsFor,
  cookStep,
  currentStep,
  generateOrders,
  hasDone,
  hintFor,
  isServed,
  makeDish,
  matches,
  newCook,
  pickCustomers,
  sameOrder,
  stepsFor,
  type Cook,
  type CookAction,
  type Order,
} from './logic'

/** A deterministic random source (a small LCG). */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const run = (c: Cook, actions: CookAction[]): { cook: Cook; results: string[] } => {
  const results: string[] = []
  for (const a of actions) {
    const r = cookStep(c, a)
    c = r.cook
    results.push(r.result)
  }
  return { cook: c, results }
}

const maki: Order = { kind: 'maki', filling: 'salmon' }
const nigiri: Order = { kind: 'nigiri', filling: 'tuna' }

describe('sushi orders', () => {
  it('starts with a maki, never repeats a dish back to back, and has a nigiri in a round of 4', () => {
    for (let seed = 1; seed < 300; seed++) {
      const orders = generateOrders(4, seeded(seed))
      expect(orders).toHaveLength(4)
      expect(orders[0].kind).toBe('maki')
      for (let i = 1; i < orders.length; i++) expect(sameOrder(orders[i], orders[i - 1])).toBe(false)
      expect(orders.some((o) => o.kind === 'nigiri')).toBe(true)
      for (const o of orders) expect(MENU.some((m) => sameOrder(m, o))).toBe(true)
    }
  })

  it('handles odd counts and the extremes of the random source', () => {
    expect(generateOrders(0, () => 0)).toHaveLength(1)
    expect(generateOrders(2.7, () => 0.999999)).toHaveLength(2)
    const all = generateOrders(5, () => 0)
    expect(all[0].kind).toBe('maki')
    expect(all.every((o) => MENU.some((m) => sameOrder(m, o)))).toBe(true)
  })

  it('never offers a cucumber nigiri', () => {
    expect(MENU.some((o) => o.kind === 'nigiri' && o.filling === 'cucumber')).toBe(false)
  })

  it('picks different customers', () => {
    const c = pickCustomers(4, seeded(7))
    expect(new Set(c).size).toBe(4)
    for (const f of c) expect(CUSTOMER_FIGS).toContain(f)
    expect(pickCustomers(CUSTOMER_FIGS.length + 2, seeded(3))).toHaveLength(CUSTOMER_FIGS.length + 2)
  })
})

describe('sushi recipe steps', () => {
  it('a maki: seaweed → rice → filling → roll → cut → serve', () => {
    expect(stepsFor('maki')).toEqual(['seaweed', 'rice', 'filling', 'roll', 'cut', 'serve'])
    const { cook, results } = run(newCook(maki), [
      { type: 'drop', item: 'seaweed', target: 'mat' },
      { type: 'drop', item: 'rice', target: 'mat' },
      { type: 'drop', item: 'salmon', target: 'mat' },
      { type: 'tap', tool: 'roll' },
      { type: 'tap', tool: 'cut' },
      { type: 'drop', item: 'plate', target: 'customer' },
    ])
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'served'])
    expect(isServed(cook)).toBe(true)
    expect(currentStep(cook)).toBeNull()
    expect(cook.mistakes).toBe(0)
  })

  it('a nigiri: rice → topping → press → serve', () => {
    expect(stepsFor('nigiri')).toEqual(['rice', 'filling', 'press', 'serve'])
    const { cook, results } = run(newCook(nigiri), [
      { type: 'drop', item: 'rice', target: 'mat' },
      { type: 'drop', item: 'tuna', target: 'mat' },
      { type: 'tap', tool: 'press' },
      { type: 'drop', item: 'plate', target: 'customer' },
    ])
    expect(results).toEqual(['ok', 'ok', 'ok', 'served'])
    expect(isServed(cook)).toBe(true)
  })

  it('things out of order just go back, without counting', () => {
    const { cook, results } = run(newCook(maki), [
      { type: 'drop', item: 'rice', target: 'mat' },
      { type: 'drop', item: 'salmon', target: 'mat' },
      { type: 'tap', tool: 'cut' },
      { type: 'drop', item: 'seaweed', target: null },
      { type: 'drop', item: 'seaweed', target: 'customer' },
      { type: 'drop', item: 'plate', target: 'customer' },
    ])
    expect(results).toEqual(['notNow', 'notNow', 'notNow', 'notNow', 'notNow', 'notNow'])
    expect(cook).toEqual(newCook(maki))
  })

  it('a wrong filling is a try-again: the customer shakes their head, and the dish waits', () => {
    let c = run(newCook(maki), [
      { type: 'drop', item: 'seaweed', target: 'mat' },
      { type: 'drop', item: 'rice', target: 'mat' },
    ]).cook
    const wrong = cookStep(c, { type: 'drop', item: 'tuna', target: 'mat' })
    expect(wrong.result).toBe('wrong')
    expect(currentStep(wrong.cook)).toBe('filling')
    expect(wrong.cook.mistakes).toBe(1)
    c = cookStep(wrong.cook, { type: 'drop', item: 'salmon', target: 'mat' }).cook
    expect(currentStep(c)).toBe('roll')
    expect(c.filling).toBe('salmon')
    expect(c.mistakes).toBe(1)
  })

  it('cucumber on a nigiri is a wrong filling', () => {
    const c = cookStep(newCook(nigiri), { type: 'drop', item: 'rice', target: 'mat' }).cook
    expect(cookStep(c, { type: 'drop', item: 'cucumber', target: 'mat' }).result).toBe('wrong')
  })

  it('knows what is on the mat', () => {
    const c = run(newCook(maki), [
      { type: 'drop', item: 'seaweed', target: 'mat' },
      { type: 'drop', item: 'rice', target: 'mat' },
    ]).cook
    expect(hasDone(c, 'seaweed')).toBe(true)
    expect(hasDone(c, 'rice')).toBe(true)
    expect(hasDone(c, 'filling')).toBe(false)
    expect(hasDone(c, 'press')).toBe(false)
  })

  it('nothing happens after serving', () => {
    const done: Cook = { ...newCook(nigiri), step: 4, filling: 'tuna' }
    expect(cookStep(done, { type: 'tap', tool: 'press' }).result).toBe('notNow')
  })

  it('points the hint at what is needed', () => {
    let c = newCook(maki)
    expect(hintFor(c)).toEqual({ drag: 'seaweed', to: 'mat' })
    c = run(c, [
      { type: 'drop', item: 'seaweed', target: 'mat' },
      { type: 'drop', item: 'rice', target: 'mat' },
    ]).cook
    expect(hintFor(c)).toEqual({ drag: 'salmon', to: 'mat' })
    c = cookStep(c, { type: 'drop', item: 'salmon', target: 'mat' }).cook
    expect(hintFor(c)).toEqual({ tap: 'roll' })
    c = run(c, [{ type: 'tap', tool: 'roll' }, { type: 'tap', tool: 'cut' }]).cook
    expect(hintFor(c)).toEqual({ drag: 'plate', to: 'customer' })
    c = cookStep(c, { type: 'drop', item: 'plate', target: 'customer' }).cook
    expect(hintFor(c)).toBeNull()
  })
})

describe('sushi matching and rewards', () => {
  it('matches the same kind and filling only', () => {
    expect(matches(maki, { kind: 'maki', filling: 'salmon' })).toBe(true)
    expect(matches(maki, { kind: 'maki', filling: 'tuna' })).toBe(false)
    expect(matches(maki, { kind: 'nigiri', filling: 'salmon' })).toBe(false)
    expect(matches({ kind: 'nigiri', filling: 'cucumber' }, { kind: 'nigiri', filling: 'cucumber' })).toBe(false)
  })

  it('the dish is known once its filling is in', () => {
    const c = newCook(nigiri)
    expect(makeDish(c)).toBeNull()
    expect(makeDish({ ...c, filling: 'tuna' })).toEqual(nigiri)
  })

  it('pays 3 coins, plus a star coin without a try-again', () => {
    expect(coinsFor(0)).toBe(BASE_COINS + 1)
    expect(coinsFor(1)).toBe(BASE_COINS)
    expect(coinsFor(5)).toBe(BASE_COINS)
    // A whole round stays far under the per-round cap.
    expect(4 * coinsFor(0)).toBeLessThanOrEqual(100)
  })
})
