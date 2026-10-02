/**
 * The bakery's rules, pure (no React, no three.js) and unit-tested: what a customer orders, the
 * steps of making one cake (a small state machine), whether the cake matches the order, and what it
 * pays. There is no fail state: every cake is accepted; a matching one earns a bonus ⭐ and coins.
 */

export type Ingredient = 'flour' | 'egg' | 'milk'
export const INGREDIENTS: readonly Ingredient[] = ['flour', 'egg', 'milk']

export type Shape = 'round' | 'square'
export const SHAPES: readonly Shape[] = ['round', 'square']

export type Frosting = 'pink' | 'white' | 'chocolate' | 'yellow' | 'blue'
export const FROSTINGS: readonly Frosting[] = ['pink', 'white', 'chocolate', 'yellow', 'blue']
/** The brick colour (COLORS index) of each frosting. */
export const FROSTING_COLOR: Readonly<Record<Frosting, number>> = {
  pink: 12,
  white: 0,
  chocolate: 9,
  yellow: 4,
  blue: 14,
}

export type Topping = 'strawberry' | 'candle' | 'sprinkles'
export const TOPPINGS: readonly Topping[] = ['strawberry', 'candle', 'sprinkles']

/** What a customer asks for, by picture: the cake's shape, its frosting and 1-2 kinds of topping. */
export interface Order {
  shape: Shape
  frosting: Frosting
  /** Distinct, in `TOPPINGS` order. */
  toppings: Topping[]
}

const pick = <T>(list: readonly T[], rand: () => number): T =>
  list[Math.min(list.length - 1, Math.floor(rand() * list.length))]

export const orderKey = (o: Order): string => `${o.shape}-${o.frosting}-${o.toppings.join('+')}`

/** One random order. */
export function makeOrder(rand: () => number = Math.random): Order {
  const first = pick(TOPPINGS, rand)
  const toppings = new Set<Topping>([first])
  if (rand() < 0.5) toppings.add(pick(TOPPINGS, rand))
  return {
    shape: pick(SHAPES, rand),
    frosting: pick(FROSTINGS, rand),
    toppings: TOPPINGS.filter((t) => toppings.has(t)),
  }
}

/** `count` orders for a round; two customers in a row never want the very same cake. */
export function makeOrders(count: number, rand: () => number = Math.random): Order[] {
  const out: Order[] = []
  for (let i = 0; i < count; i++) {
    let o = makeOrder(rand)
    for (let tries = 0; tries < 8 && i > 0 && orderKey(o) === orderKey(out[i - 1]); tries++)
      o = makeOrder(rand)
    out.push(o)
  }
  return out
}

/** Customer looks (FIG_PRESETS ids); the shop's unlockable figures are left for the kid to buy. */
export const CUSTOMER_FIGS: readonly string[] = [
  'customer',
  'customer2',
  'kid',
  'doctor',
  'astronaut',
  'firefighter',
  'construction',
  'police',
  'chef',
]

/** `count` different customers in a random order. */
export function pickCustomers(count: number, rand: () => number = Math.random): string[] {
  const pool = [...CUSTOMER_FIGS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.max(1, Math.min(count, pool.length)))
}

// ---- The cake's shape on the stud grid -----------------------------------------------------------

/** A cake (and its mould) is CAKE_SIZE × CAKE_SIZE studs. */
export const CAKE_SIZE = 8

/** The stud cells [x, z] of a shape, in an n × n grid (a round one is a stepped circle). */
export function shapeCells(shape: Shape, n = CAKE_SIZE): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const r = n / 2
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      if (shape === 'square' || Math.hypot(x + 0.5 - r, z + 0.5 - r) <= r) out.push([x, z])
    }
  }
  return out
}

/** The cells of `cells` on its edge (a side neighbour is outside). */
export function edgeCells(cells: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const has = new Set(cells.map(([x, z]) => `${x},${z}`))
  return cells.filter(
    ([x, z]) =>
      !has.has(`${x - 1},${z}`) ||
      !has.has(`${x + 1},${z}`) ||
      !has.has(`${x},${z - 1}`) ||
      !has.has(`${x},${z + 1}`),
  )
}

/**
 * Where toppings can go on a cake: the centres (studs, from the cake's centre) of the 2 × 2 blocks
 * that lie wholly on its top.
 */
export function slotsFor(shape: Shape, n = CAKE_SIZE): Array<[number, number]> {
  const has = new Set(shapeCells(shape, n).map(([x, z]) => `${x},${z}`))
  const out: Array<[number, number]> = []
  for (let z = 0; z + 1 < n; z += 2) {
    for (let x = 0; x + 1 < n; x += 2) {
      if (
        has.has(`${x},${z}`) &&
        has.has(`${x + 1},${z}`) &&
        has.has(`${x},${z + 1}`) &&
        has.has(`${x + 1},${z + 1}`)
      )
        out.push([x + 1 - n / 2, z + 1 - n / 2])
    }
  }
  return out
}

// ---- Making a cake: the steps -------------------------------------------------------------------

/**
 * ingredients (drag flour, egg, milk into the bowl, any order) → mix (tap the bowl) → pour (drag the
 * bowl onto a mould: its shape is the cake's) → oven (drag the mould in) → baking (a short timer) →
 * frost (pick a colour) → decorate (drag toppings freely, the colour can still change) → served.
 */
export type Step =
  'ingredients' | 'mix' | 'pour' | 'oven' | 'baking' | 'frost' | 'decorate' | 'served'

/** Taps on the bowl to mix the batter. */
export const MIX_TAPS = 5

export interface Cake {
  step: Step
  added: Ingredient[]
  mixes: number
  shape: Shape | null
  frosting: Frosting | null
  /** The topping on each of `slotsFor(shape)` (null: empty). */
  toppings: Array<Topping | null>
}

export const newCake = (): Cake => ({
  step: 'ingredients',
  added: [],
  mixes: 0,
  shape: null,
  frosting: null,
  toppings: [],
})

export type CakeAction =
  | { type: 'add'; ingredient: Ingredient }
  | { type: 'mix' }
  | { type: 'pour'; shape: Shape }
  | { type: 'bake' }
  | { type: 'baked' }
  | { type: 'frost'; frosting: Frosting }
  | { type: 'top'; slot: number; topping: Topping }
  | { type: 'serve' }
  | { type: 'reset' }

/** One step of the recipe; an action that does not fit the current step changes nothing. */
export function cakeReducer(cake: Cake, action: CakeAction): Cake {
  switch (action.type) {
    case 'add': {
      if (cake.step !== 'ingredients' || cake.added.includes(action.ingredient)) return cake
      const added = [...cake.added, action.ingredient]
      return { ...cake, added, step: added.length >= INGREDIENTS.length ? 'mix' : 'ingredients' }
    }
    case 'mix': {
      if (cake.step !== 'mix') return cake
      const mixes = cake.mixes + 1
      return { ...cake, mixes, step: mixes >= MIX_TAPS ? 'pour' : 'mix' }
    }
    case 'pour':
      return cake.step === 'pour'
        ? {
            ...cake,
            shape: action.shape,
            step: 'oven',
            toppings: slotsFor(action.shape).map(() => null),
          }
        : cake
    case 'bake':
      return cake.step === 'oven' ? { ...cake, step: 'baking' } : cake
    case 'baked':
      return cake.step === 'baking' ? { ...cake, step: 'frost' } : cake
    case 'frost':
      return cake.step === 'frost' || cake.step === 'decorate'
        ? { ...cake, frosting: action.frosting, step: 'decorate' }
        : cake
    case 'top': {
      if (cake.step !== 'decorate' || action.slot < 0 || action.slot >= cake.toppings.length)
        return cake
      const toppings = cake.toppings.slice()
      toppings[landingSlot(cake.shape ?? 'square', cake.toppings, action.slot)] = action.topping
      return { ...cake, toppings }
    }
    case 'serve':
      return cake.step === 'decorate' ? { ...cake, step: 'served' } : cake
    case 'reset':
      return newCake()
  }
}

/**
 * Where a topping dropped on `slot` lands: there if it is free, else on the nearest free slot (a
 * topping already on the cake is never knocked off), or on `slot` itself when the cake is full.
 */
export function landingSlot(
  shape: Shape,
  toppings: ReadonlyArray<Topping | null>,
  slot: number,
): number {
  if (toppings[slot] === null || toppings[slot] === undefined) return slot
  const slots = slotsFor(shape)
  const [sx, sz] = slots[slot]
  let best = slot
  let bestDist = Infinity
  toppings.forEach((t, i) => {
    if (t !== null) return
    const d = Math.hypot(slots[i][0] - sx, slots[i][1] - sz)
    if (d < bestDist) {
      best = i
      bestDist = d
    }
  })
  return best
}

/** The kinds of topping on the cake. */
export const toppingKinds = (cake: Cake): Set<Topping> =>
  new Set(cake.toppings.filter((t): t is Topping => t !== null))

/** The next ingredient the bowl still needs (for the hint), or null. */
export const nextIngredient = (cake: Cake): Ingredient | null =>
  INGREDIENTS.find((i) => !cake.added.includes(i)) ?? null

/** An ordered topping not on the cake yet (for the hint), or null. */
export const missingTopping = (cake: Cake, order: Order): Topping | null => {
  const have = toppingKinds(cake)
  return order.toppings.find((t) => !have.has(t)) ?? null
}

/** Same shape, same frosting and every ordered kind of topping on it (extra toppings are fine). */
export function matchesOrder(cake: Cake, order: Order): boolean {
  return (
    cake.shape === order.shape &&
    cake.frosting === order.frosting &&
    missingTopping(cake, order) === null
  )
}

/** Coins for any cake handed over, and the bonus for one that matches the order. */
export const BASE_COINS = 3
export const STAR_COINS = 2

export function rewardFor(cake: Cake, order: Order): { coins: number; star: boolean } {
  const star = matchesOrder(cake, order)
  return { coins: BASE_COINS + (star ? STAR_COINS : 0), star }
}

/** Customers per round. */
export const CUSTOMERS_PER_ROUND = 3
