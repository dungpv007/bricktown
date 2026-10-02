import { describe, expect, it } from 'vitest'
import {
  BASE_COINS,
  CAKE_SIZE,
  FROSTINGS,
  INGREDIENTS,
  MIX_TAPS,
  SHAPES,
  STAR_COINS,
  TOPPINGS,
  cakeReducer,
  edgeCells,
  makeOrder,
  makeOrders,
  matchesOrder,
  missingTopping,
  newCake,
  nextIngredient,
  orderKey,
  pickCustomers,
  rewardFor,
  shapeCells,
  slotsFor,
  type Cake,
  type CakeAction,
  type Order,
} from './logic'

/** A seeded random (mulberry32) so the tests are repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const run = (actions: CakeAction[], from: Cake = newCake()): Cake =>
  actions.reduce(cakeReducer, from)

/** All the steps up to decorating a cake of `shape` frosted `frosting`. */
const upToDecorate = (shape: Order['shape'], frosting: Order['frosting']): CakeAction[] => [
  ...INGREDIENTS.map((ingredient) => ({ type: 'add', ingredient }) as CakeAction),
  ...Array.from({ length: MIX_TAPS }, () => ({ type: 'mix' }) as CakeAction),
  { type: 'pour', shape },
  { type: 'bake' },
  { type: 'baked' },
  { type: 'frost', frosting },
]

describe('bakery orders', () => {
  it('are a shape, a frosting and 1-2 distinct toppings in a fixed order', () => {
    const rand = seeded(1)
    for (let i = 0; i < 300; i++) {
      const o = makeOrder(rand)
      expect(SHAPES).toContain(o.shape)
      expect(FROSTINGS).toContain(o.frosting)
      expect(o.toppings.length).toBeGreaterThanOrEqual(1)
      expect(o.toppings.length).toBeLessThanOrEqual(2)
      expect(new Set(o.toppings).size).toBe(o.toppings.length)
      expect(o.toppings).toEqual(TOPPINGS.filter((t) => o.toppings.includes(t)))
    }
  })

  it('cover every shape, frosting and topping over many rounds', () => {
    const rand = seeded(7)
    const orders = Array.from({ length: 200 }, () => makeOrder(rand))
    for (const s of SHAPES) expect(orders.some((o) => o.shape === s)).toBe(true)
    for (const f of FROSTINGS) expect(orders.some((o) => o.frosting === f)).toBe(true)
    for (const t of TOPPINGS) expect(orders.some((o) => o.toppings.includes(t))).toBe(true)
    expect(orders.some((o) => o.toppings.length === 2)).toBe(true)
  })

  it('never repeat the same cake twice in a row within a round', () => {
    for (let seed = 0; seed < 50; seed++) {
      const orders = makeOrders(4, seeded(seed))
      expect(orders).toHaveLength(4)
      for (let i = 1; i < orders.length; i++)
        expect(orderKey(orders[i])).not.toBe(orderKey(orders[i - 1]))
    }
  })

  it('come with different customers', () => {
    const figs = pickCustomers(3, seeded(3))
    expect(figs).toHaveLength(3)
    expect(new Set(figs).size).toBe(3)
  })
})

describe('cake shapes', () => {
  it('a square cake fills its grid; a round one is a stepped circle', () => {
    expect(shapeCells('square')).toHaveLength(CAKE_SIZE * CAKE_SIZE)
    const rows = new Map<number, number>()
    for (const [, z] of shapeCells('round')) rows.set(z, (rows.get(z) ?? 0) + 1)
    expect([...rows.values()]).toEqual([4, 6, 8, 8, 8, 8, 6, 4])
  })

  it('edges are the cells with a side outside', () => {
    expect(edgeCells(shapeCells('square', 4))).toHaveLength(12)
  })

  it('topping slots lie wholly on the cake top', () => {
    expect(slotsFor('square')).toHaveLength(16)
    expect(slotsFor('round')).toHaveLength(12)
    for (const [x, z] of slotsFor('round')) expect(Math.hypot(x, z)).toBeLessThan(CAKE_SIZE / 2)
  })
})

describe('the cake step machine', () => {
  it('goes ingredients → mix → pour → oven → baking → frost → decorate → served', () => {
    let c = newCake()
    expect(c.step).toBe('ingredients')
    c = run(
      [
        { type: 'add', ingredient: 'milk' },
        { type: 'add', ingredient: 'flour' },
      ],
      c,
    )
    expect(c.step).toBe('ingredients')
    expect(nextIngredient(c)).toBe('egg')
    c = cakeReducer(c, { type: 'add', ingredient: 'egg' })
    expect(c.step).toBe('mix')
    for (let i = 1; i < MIX_TAPS; i++) c = cakeReducer(c, { type: 'mix' })
    expect(c.step).toBe('mix')
    c = cakeReducer(c, { type: 'mix' })
    expect(c.step).toBe('pour')
    c = cakeReducer(c, { type: 'pour', shape: 'round' })
    expect(c).toMatchObject({ step: 'oven', shape: 'round' })
    expect(c.toppings).toHaveLength(slotsFor('round').length)
    c = run([{ type: 'bake' }, { type: 'baked' }], c)
    expect(c.step).toBe('frost')
    c = cakeReducer(c, { type: 'frost', frosting: 'pink' })
    expect(c).toMatchObject({ step: 'decorate', frosting: 'pink' })
    c = cakeReducer(c, { type: 'frost', frosting: 'blue' }) // the colour can still change
    expect(c.frosting).toBe('blue')
    c = cakeReducer(c, { type: 'serve' })
    expect(c.step).toBe('served')
    expect(cakeReducer(c, { type: 'reset' })).toEqual(newCake())
  })

  it('ignores actions out of turn (no skipping, no double adds)', () => {
    const start = newCake()
    for (const a of [
      { type: 'mix' },
      { type: 'pour', shape: 'round' },
      { type: 'bake' },
      { type: 'baked' },
      { type: 'frost', frosting: 'pink' },
      { type: 'top', slot: 0, topping: 'candle' },
      { type: 'serve' },
    ] as CakeAction[]) {
      expect(cakeReducer(start, a)).toBe(start)
    }
    const once = cakeReducer(start, { type: 'add', ingredient: 'egg' })
    expect(cakeReducer(once, { type: 'add', ingredient: 'egg' })).toBe(once)
  })

  it('places toppings freely on valid slots; a taken slot sends it to the nearest free one', () => {
    let c = run(upToDecorate('square', 'white'))
    c = cakeReducer(c, { type: 'top', slot: 3, topping: 'candle' })
    c = cakeReducer(c, { type: 'top', slot: 3, topping: 'strawberry' })
    expect(c.toppings[3]).toBe('candle')
    expect(c.toppings.filter((t) => t === 'strawberry')).toHaveLength(1)
    const [x3, z3] = slotsFor('square')[3]
    const landed = c.toppings.indexOf('strawberry')
    const [x, z] = slotsFor('square')[landed]
    expect(Math.hypot(x - x3, z - z3)).toBe(2) // a neighbour
    // A full cake: the new topping takes the slot it was dropped on.
    for (let i = 0; i < c.toppings.length; i++)
      c = cakeReducer(c, { type: 'top', slot: i, topping: 'sprinkles' })
    expect(c.toppings.every((t) => t !== null)).toBe(true)
    c = cakeReducer(c, { type: 'top', slot: 0, topping: 'candle' })
    expect(c.toppings[0]).toBe('candle')
    expect(cakeReducer(c, { type: 'top', slot: 99, topping: 'candle' })).toBe(c)
    expect(cakeReducer(c, { type: 'top', slot: -1, topping: 'candle' })).toBe(c)
  })
})

describe('matching and rewards', () => {
  const order: Order = { shape: 'round', frosting: 'pink', toppings: ['strawberry', 'candle'] }

  it('a cake like the picture (extra toppings fine) earns the ⭐ bonus', () => {
    let c = run(upToDecorate('round', 'pink'))
    expect(missingTopping(c, order)).toBe('strawberry')
    c = run(
      [
        { type: 'top', slot: 0, topping: 'strawberry' },
        { type: 'top', slot: 5, topping: 'candle' },
        { type: 'top', slot: 6, topping: 'sprinkles' },
      ],
      c,
    )
    expect(matchesOrder(c, order)).toBe(true)
    expect(rewardFor(c, order)).toEqual({ coins: BASE_COINS + STAR_COINS, star: true })
  })

  it('any other cake is still accepted and paid, without the star', () => {
    const wrongShape = run([
      ...upToDecorate('square', 'pink'),
      { type: 'top', slot: 0, topping: 'strawberry' },
      { type: 'top', slot: 1, topping: 'candle' },
    ])
    const wrongColour = run([
      ...upToDecorate('round', 'blue'),
      { type: 'top', slot: 0, topping: 'strawberry' },
      { type: 'top', slot: 1, topping: 'candle' },
    ])
    const missing = run([
      ...upToDecorate('round', 'pink'),
      { type: 'top', slot: 0, topping: 'strawberry' },
    ])
    for (const c of [wrongShape, wrongColour, missing]) {
      expect(matchesOrder(c, order)).toBe(false)
      expect(rewardFor(c, order)).toEqual({ coins: BASE_COINS, star: false })
    }
  })
})
