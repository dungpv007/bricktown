/**
 * The sushi game's rules, pure (unit-tested; no React, no three.js):
 * - the round's orders and customers;
 * - the recipe as a step machine (maki: seaweed → rice → filling → roll → cut → serve;
 *   nigiri: rice → topping → press → serve);
 * - whether a dish matches its order, and what a served customer pays.
 *
 * There is no fail state: an item dropped at the wrong moment just goes back ("not now"), and a wrong
 * filling makes the customer shake their head ("wrong", a try-again moment); nothing is ever lost.
 */

export type SushiKind = 'maki' | 'nigiri'
export type Filling = 'salmon' | 'cucumber' | 'tuna'

export interface Order {
  kind: SushiKind
  filling: Filling
}

/** What the kid can pick up: the ingredients on the counter and the finished plate. */
export type ItemId = 'seaweed' | 'rice' | Filling | 'plate'
/** What the kid can tap: the mat, to roll, cut or press. */
export type ToolId = 'roll' | 'cut' | 'press'
/** Where things can be dropped. */
export type TargetId = 'mat' | 'customer'

export type Step = 'seaweed' | 'rice' | 'filling' | 'roll' | 'cut' | 'press' | 'serve'

export const FILLINGS: readonly Filling[] = ['salmon', 'cucumber', 'tuna']

/** Everything the restaurant makes (cucumber nigiri is not a thing). */
export const MENU: readonly Order[] = [
  { kind: 'maki', filling: 'salmon' },
  { kind: 'maki', filling: 'cucumber' },
  { kind: 'maki', filling: 'tuna' },
  { kind: 'nigiri', filling: 'salmon' },
  { kind: 'nigiri', filling: 'tuna' },
]

/** Fillings that can go on a nigiri. */
export const canTop = (kind: SushiKind, filling: Filling): boolean => kind === 'maki' || filling !== 'cucumber'

export const sameOrder = (a: Order, b: Order): boolean => a.kind === b.kind && a.filling === b.filling

export const orderKey = (o: Order): string => `${o.kind}-${o.filling}`

export type Rng = () => number

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]

/**
 * The round's orders: the first is always a maki (the full recipe, which the hint teaches), never the
 * same dish twice in a row, and a round of 3 or more has at least one nigiri (variety).
 */
export function generateOrders(count: number, rng: Rng = Math.random): Order[] {
  const n = Math.max(1, Math.floor(count))
  const out: Order[] = []
  for (let i = 0; i < n; i++) {
    const prev = out[i - 1]
    let pool = MENU.filter((o) => !prev || !sameOrder(o, prev))
    if (i === 0) pool = pool.filter((o) => o.kind === 'maki')
    // The last chance for a nigiri in a round that has none yet.
    if (i === n - 1 && n >= 3 && !out.some((o) => o.kind === 'nigiri')) pool = pool.filter((o) => o.kind === 'nigiri')
    out.push(pick(pool, rng))
  }
  return out
}

/** Friendly figures who come to eat (existing presets; the shop's unlockable ones are left out). */
export const CUSTOMER_FIGS: readonly string[] = ['customer', 'customer2', 'kid', 'doctor', 'astronaut', 'firefighter', 'construction', 'police', 'waiter']

/** `count` different customers in a random order (repeats only when there are more than the figures). */
export function pickCustomers(count: number, rng: Rng = Math.random): string[] {
  const bag = [...CUSTOMER_FIGS]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return Array.from({ length: Math.max(1, Math.floor(count)) }, (_, i) => bag[i % bag.length])
}

/** The recipe of a dish, step by step. */
export function stepsFor(kind: SushiKind): readonly Step[] {
  return kind === 'maki' ? ['seaweed', 'rice', 'filling', 'roll', 'cut', 'serve'] : ['rice', 'filling', 'press', 'serve']
}

/** One dish being made for one customer. */
export interface Cook {
  order: Order
  /** Index into `stepsFor(order.kind)`; its length once served. */
  step: number
  /** The filling put in (null until then). */
  filling: Filling | null
  /** Try-again moments for this customer. */
  mistakes: number
}

export const newCook = (order: Order): Cook => ({ order, step: 0, filling: null, mistakes: 0 })

/** The step waiting now, or null once served. */
export const currentStep = (c: Cook): Step | null => stepsFor(c.order.kind)[c.step] ?? null

export const isServed = (c: Cook): boolean => currentStep(c) === null

/** Steps done so far, by name (what is on the mat). */
export const hasDone = (c: Cook, step: Step): boolean => {
  const i = stepsFor(c.order.kind).indexOf(step)
  return i >= 0 && i < c.step
}

export type CookAction = { type: 'drop'; item: ItemId; target: TargetId | null } | { type: 'tap'; tool: ToolId }

/**
 * - ok: the step is done (the dish moves on);
 * - wrong: a filling the customer did not ask for (they shake their head; the item goes back);
 * - notNow: not what this step needs (the item goes back with a wobble, nothing counted);
 * - served: the plate reached the customer with the right dish.
 */
export type CookResult = 'ok' | 'wrong' | 'notNow' | 'served'

const advance = (c: Cook, patch: Partial<Cook> = {}): Cook => ({ ...c, ...patch, step: c.step + 1 })

const isFilling = (item: ItemId): item is Filling => (FILLINGS as readonly string[]).includes(item)

/** The step machine: what an action does to the dish. Never throws, never loses progress. */
export function cookStep(c: Cook, action: CookAction): { cook: Cook; result: CookResult } {
  const step = currentStep(c)
  const notNow = { cook: c, result: 'notNow' as const }
  if (step === null) return notNow
  if (action.type === 'tap') {
    return action.tool === step ? { cook: advance(c), result: 'ok' } : notNow
  }
  const { item, target } = action
  if (step === 'serve') {
    if (item !== 'plate' || target !== 'customer') return notNow
    const dish = makeDish(c)
    return dish && matches(c.order, dish) ? { cook: advance(c), result: 'served' } : notNow
  }
  if (target !== 'mat') return notNow
  if (step === 'seaweed' || step === 'rice') return item === step ? { cook: advance(c), result: 'ok' } : notNow
  if (step === 'filling' && isFilling(item)) {
    if (item !== c.order.filling) return { cook: { ...c, mistakes: c.mistakes + 1 }, result: 'wrong' }
    return { cook: advance(c, { filling: item }), result: 'ok' }
  }
  return notNow
}

/** What is being made, once its filling is in (null before). */
export function makeDish(c: Cook): Order | null {
  return c.filling ? { kind: c.order.kind, filling: c.filling } : null
}

/** A dish matches its order when it is the same kind with the same filling. */
export const matches = (order: Order, dish: Order): boolean => canTop(dish.kind, dish.filling) && sameOrder(order, dish)

/** What the kid should do now, for the pointing hand. */
export type Hint = { drag: ItemId; to: TargetId } | { tap: ToolId } | null

export function hintFor(c: Cook): Hint {
  const step = currentStep(c)
  switch (step) {
    case null:
      return null
    case 'seaweed':
    case 'rice':
      return { drag: step, to: 'mat' }
    case 'filling':
      return { drag: c.order.filling, to: 'mat' }
    case 'serve':
      return { drag: 'plate', to: 'customer' }
    default:
      return { tap: step }
  }
}

/** Coins a served customer pays: 3, and a ⭐ bonus coin when nothing needed a try-again. */
export const BASE_COINS = 3
export const coinsFor = (mistakes: number): number => BASE_COINS + (mistakes === 0 ? 1 : 0)
