import type { Brick } from '../../core/types'
import { brick } from '../kit'
import type { Filling, ItemId, Order } from './logic'

/**
 * Everything in the sushi bar, built from catalog bricks. Every array is a module constant (or
 * cached here), so equal models share one baked geometry and no bake runs twice.
 *
 * Colours (COLORS ids): 0 white, 1 black, 2 red, 5 green, 6 orange, 8 dark gray, 9 brown, 10 tan,
 * 11 lime, 12 pink, 21 dark blue, 25 dark tan, 28 silver.
 */

const WHITE = 0
const BLACK = 1
const RED = 2
const GREEN = 5
const ORANGE = 6
const DARK_GRAY = 8
const BROWN = 9
const TAN = 10
const LIME = 11
const PINK = 12
const DARK_BLUE = 21
const DARK_TAN = 25
const SILVER = 28

/** The colour of each filling (fish slices and the dot in a maki). */
export const FILLING_COLOR: Record<Filling, number> = { salmon: ORANGE, cucumber: LIME, tuna: RED }

// ---------- On the counter: what the kid picks up ----------

/** The ingredients as they wait on the counter (each about 2×2 studs; the game scales them up). */
export const SOURCE: Record<Exclude<ItemId, 'plate'>, Brick[]> = {
  // A little stack of seaweed sheets.
  seaweed: [brick('plate_2x2', GREEN, 0, 0, 0), brick('plate_2x2', GREEN, 0, 1, 0), brick('tile_2x2', GREEN, 0, 2, 0)],
  // A blue bowl of rice (the game lays a flattened white round on top: RICE_TOP).
  rice: [brick('round_2x2', DARK_BLUE, 0, 0, 0)],
  // A thick salmon slab with a white stripe.
  salmon: [brick('plate_2x2', ORANGE, 0, 0, 0), brick('plate_2x2', ORANGE, 0, 1, 0), brick('tile_1x2', WHITE, 1, 2, 0), brick('tile_1x2', ORANGE, 0, 2, 0)],
  // A cucumber cut in half: green skin, lime inside.
  cucumber: [brick('round_2x2', GREEN, 0, 0, 0), brick('plate_1x1', LIME, 0, 3, 0), brick('plate_1x1', LIME, 1, 3, 1)],
  // A deep red tuna slab.
  tuna: [brick('plate_2x2', RED, 0, 0, 0), brick('plate_2x2', RED, 0, 1, 0), brick('tile_2x2', RED, 0, 2, 0), brick('plate_1x1', PINK, 0.5, 3, 0.5)],
}

// ---------- On the mat: the dish being made (local coords, the mat's middle at 2, 2) ----------

/** The bamboo mat: slats of tan and dark tan running along X (6 × 5 studs, centred on 2, 2). */
export const MAT: Brick[] = Array.from({ length: 5 }, (_, i) => [
  brick('plate_1x4', i % 2 ? DARK_TAN : TAN, -1, 0, i - 0.5, 1),
  brick('plate_1x2', i % 2 ? DARK_TAN : TAN, 3, 0, i - 0.5, 1),
]).flat()

/** Layers of a maki on the mat (centered = false; the mat group places 0..4 × 0..4 on the mat). */
export const SHEET: Brick[] = [brick('plate_4x4', GREEN, 0, 0, 0)]
/** Rice over most of the sheet (a strip of seaweed is left to close the roll). */
export const RICE_LAYER: Brick[] = [0, 1, 2].map((x) => brick('plate_1x4', WHITE, x, 1, 0))
const fillingCache = new Map<Filling, Brick[]>()
/** A line of filling across the rice. */
export function fillingLayer(f: Filling): Brick[] {
  let out = fillingCache.get(f)
  if (!out) {
    out = [brick('tile_1x2', FILLING_COLOR[f], 1, 2, 0, 0), brick('tile_1x2', FILLING_COLOR[f], 1, 2, 2, 0)]
    fillingCache.set(f, out)
  }
  return out
}

/** The rice in the bowl: a white round, drawn squashed flat (scale y ≈ 0.35). */
export const RICE_TOP: Brick[] = [brick('round_2x2', WHITE, 0, 0, 0)]

/** One slice of the rolled maki (a short green cylinder); the roll is three of them lying along X. */
export const ROLL_SLICE: Brick[] = [brick('round_2x2', GREEN, 0, 0, 0)]

/** Nigiri rice: two oblong rice blocks (2 × 4, along Z) on the mat. */
export const NIGIRI_RICE: Brick[] = [
  brick('plate_2x4', WHITE, 0, 0, 0),
  brick('plate_2x4', WHITE, 0, 1, 0),
  brick('plate_2x4', WHITE, 2.25, 0, 0),
  brick('plate_2x4', WHITE, 2.25, 1, 0),
]
const toppingCache = new Map<Filling, Brick[]>()
/** The fish slices laid on the two nigiri. */
export function nigiriTopping(f: Filling): Brick[] {
  let out = toppingCache.get(f)
  if (!out) {
    out = [brick('tile_2x2', FILLING_COLOR[f], 0, 2, -0.25), brick('tile_2x2', FILLING_COLOR[f], 0, 2, 2.25), brick('tile_2x2', FILLING_COLOR[f], 2.25, 2, -0.25), brick('tile_2x2', FILLING_COLOR[f], 2.25, 2, 2.25)]
    toppingCache.set(f, out)
  }
  return out
}

/** The knife that cuts the roll: a silver blade and a brown handle. */
export const KNIFE: Brick[] = [brick('plate_1x4', SILVER, 0, 0, 0, 1), brick('tile_1x2', SILVER, 0, 1, 0, 1), brick('plate_1x2', BROWN, 4, 0, 0, 1), brick('plate_1x2', BROWN, 4, 1, 0, 1)]

// ---------- The finished dish on its wooden board (8 × 4), as served and as ordered ----------

/** A standing maki piece: green seaweed round, white rice on top with the filling in the middle. */
function makiPiece(f: Filling, x: number, z: number): Brick[] {
  return [brick('round_2x2', GREEN, x, 1, z), brick('round_2x2', WHITE, x, 4, z), brick('plate_1x1', FILLING_COLOR[f], x + 0.5, 7, z + 0.5)]
}

/** One nigiri: a rice block with a fish slice draped over it. */
function nigiriPiece(f: Filling, x: number, z: number): Brick[] {
  return [brick('plate_2x4', WHITE, x, 1, z), brick('plate_2x4', WHITE, x, 2, z), brick('tile_2x2', FILLING_COLOR[f], x, 3, z - 0.25), brick('tile_2x2', FILLING_COLOR[f], x, 3, z + 2.25)]
}

/** Pieces of a dish (3 maki or 2 nigiri). */
export const piecesOf = (o: Order): number => (o.kind === 'maki' ? 3 : 2)

const dishCache = new Map<string, Brick[]>()
/**
 * The dish on its board, with `eaten` pieces already gone (0: the whole dish, as in the order
 * bubble). A wasabi dollop and pink ginger sit at the end.
 */
export function dishBricks(o: Order, eaten = 0): Brick[] {
  const n = piecesOf(o)
  const left = Math.max(0, n - eaten)
  const key = `${o.kind}-${o.filling}-${left}`
  let out = dishCache.get(key)
  if (!out) {
    out = [brick('plate_4x8', BROWN, 0, 0, 0, 1), brick('cone_1x1', LIME, 6.5, 1, 0.5), brick('plate_1x1', PINK, 6.5, 1, 2.5), brick('plate_1x1', PINK, 7, 2, 2.5)]
    for (let i = 0; i < left; i++) {
      out.push(...(o.kind === 'maki' ? makiPiece(o.filling, 0.2 + i * 2.1, 1) : nigiriPiece(o.filling, 0.4 + i * 2.9, 0)))
    }
    dishCache.set(key, out)
  }
  return out
}

// ---------- The room ----------

/** Where the customer eats: a smooth red placemat (8 × 4) with chopsticks at its back edge. */
export const PLACEMAT: Brick[] = [
  ...[0, 2, 4, 6].flatMap((x) => [brick('tile_2x2', RED, x, 0, 0), brick('tile_2x2', RED, x, 0, 2)]),
  brick('plate_1x4', TAN, 2, 0, -1.3, 1),
  brick('plate_1x4', TAN, 2, 0, -0.6, 1),
]

/** A soy sauce bottle: black body, red cap. */
export const SOY_BOTTLE: Brick[] = [brick('round_1x1', BLACK, 0, 0, 0), brick('round_1x1', BLACK, 0, 3, 0), brick('cone_1x1', RED, 0, 6, 0)]

/** A paper lantern: red with black caps. */
export const LANTERN: Brick[] = [brick('round_1x1', BLACK, 0.5, 0, 0.5), brick('round_2x2', RED, 0, 3, 0), brick('round_2x2', RED, 0, 6, 0), brick('round_1x1', BLACK, 0.5, 9, 0.5)]

/** A bar stool: a red seat on a dark leg. */
export const STOOL: Brick[] = [brick('round_1x1', DARK_GRAY, 0.5, 0, 0.5), brick('round_2x2', RED, 0, 3, 0)]

/** The shop sign over the counter. */
export const SIGN: Brick[] = [brick('board_sushi_1x6', WHITE, 0, 0, 0)]
