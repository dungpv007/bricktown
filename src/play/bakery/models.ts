import type { Brick } from '../../core/types'
import { brick } from '../kit'
import {
  CAKE_SIZE,
  FROSTING_COLOR,
  edgeCells,
  shapeCells,
  slotsFor,
  type Frosting,
  type Ingredient,
  type Order,
  type Shape,
  type Topping,
} from './logic'

/**
 * The bakery's food and props, built from catalog bricks. Every model is made once and kept (the
 * same array each time), so the kit's bake cache shares one geometry per model across the game.
 * Units: x / z in studs, y in plates (3 plates = 1 brick).
 */

const WHITE = 0
const RED = 2
const BLUE = 3
const YELLOW = 4
const LIME = 11
const GREEN = 5
const PINK = 12
const AZURE = 14
const TAN = 10
const DARK_GRAY = 8
const BLACK = 1
const SILVER = 28
const TRANS_YELLOW = 18
/** Raw cake batter. */
export const BATTER = YELLOW
/** The baked sponge. */
const SPONGE = TAN

type Cell = [number, number]

/** 1-stud-deep pieces laid along X (turned a quarter), longest first, per kind of layer. */
const RUN_PIECES: Record<'brick' | 'plate' | 'tile', Array<[number, string]>> = {
  brick: [
    [6, 'brick_1x6'],
    [4, 'brick_1x4'],
    [3, 'brick_1x3'],
    [2, 'brick_1x2'],
    [1, 'brick_1x1'],
  ],
  plate: [
    [4, 'plate_1x4'],
    [2, 'plate_1x2'],
    [1, 'plate_1x1'],
  ],
  tile: [
    [2, 'tile_1x2'],
    [1, 'plate_1x1'],
  ],
}

/** Covers `cells` with one layer of `kind` pieces in colour `c` at plate height `y` (row by row). */
function fill(
  cells: readonly Cell[],
  kind: 'brick' | 'plate' | 'tile',
  c: number,
  y: number,
  dx = 0,
  dz = 0,
): Brick[] {
  const rows = new Map<number, number[]>()
  for (const [x, z] of cells) {
    const row = rows.get(z)
    if (row) row.push(x)
    else rows.set(z, [x])
  }
  const out: Brick[] = []
  for (const [z, xs] of rows) {
    xs.sort((a, b) => a - b)
    let i = 0
    while (i < xs.length) {
      // The run of touching cells from xs[i].
      let len = 1
      while (i + len < xs.length && xs[i + len] === xs[i] + len) len++
      let x = xs[i]
      let left = len
      for (const [size, part] of RUN_PIECES[kind]) {
        while (left >= size) {
          out.push(
            size === 1 ? brick(part, c, x + dx, y, z + dz) : brick(part, c, x + dx, y, z + dz, 1),
          )
          x += size
          left -= size
        }
      }
      i += len
    }
  }
  return out
}

const once = <K, V>(make: (k: K) => V) => {
  const cache = new Map<K, V>()
  return (k: K): V => {
    let v = cache.get(k)
    if (v === undefined) {
      v = make(k)
      cache.set(k, v)
    }
    return v
  }
}

// ---- Ingredients ----------------------------------------------------------------------------------

export const INGREDIENT_BRICKS: Readonly<Record<Ingredient, Brick[]>> = {
  // A sack of flour: white, a red stripe, flour heaped on top.
  flour: [
    brick('brick_2x2', WHITE, 0, 0, 0),
    brick('plate_2x2', RED, 0, 3, 0),
    brick('brick_2x2', WHITE, 0, 4, 0),
    brick('dish_2x2', WHITE, 0, 7, 0),
  ],
  // A big egg.
  egg: [
    brick('round_2x2', WHITE, 0, 0, 0),
    brick('round_2x2', WHITE, 0, 3, 0),
    brick('dish_2x2', WHITE, 0, 6, 0),
  ],
  // A milk carton: white with a blue band and a roof.
  milk: [
    brick('brick_2x2', WHITE, 0, 0, 0),
    brick('brick_2x2', AZURE, 0, 3, 0),
    brick('brick_2x2', WHITE, 0, 6, 0),
    brick('slope_2x2', BLUE, 0, 9, 0),
  ],
}

// ---- The mixing bowl --------------------------------------------------------------------------------

export const BOWL_SIZE = 8
const BOWL_CELLS = shapeCells('round', BOWL_SIZE)
const BOWL_EDGE = edgeCells(BOWL_CELLS)
const BOWL_INSIDE = BOWL_CELLS.filter(
  ([x, z]) => !BOWL_EDGE.some(([ex, ez]) => ex === x && ez === z),
)

/** The empty bowl: a round base and a 1-brick wall. */
export const BOWL_BRICKS: Brick[] = [
  ...fill(BOWL_CELLS, 'plate', AZURE, 0),
  ...fill(BOWL_EDGE, 'brick', AZURE, 1),
  ...fill(BOWL_EDGE, 'plate', WHITE, 4),
]

/** The inside cells in swirl order (by angle, then by distance), for the mixing pattern. */
const SWIRL = [...BOWL_INSIDE].sort((a, b) => {
  const c = BOWL_SIZE / 2
  const ang = (p: Cell) =>
    (Math.atan2(p[1] + 0.5 - c, p[0] + 0.5 - c) + Math.PI * 2) % (Math.PI * 2)
  return ang(a) - ang(b)
})

/**
 * What is in the bowl, drawn inside it (centred like the bowl): it rises with each ingredient, and
 * the mixing turns the white and yolk patches into batter along a swirl (`mixed` 0..1).
 */
export const bowlContents = once((key: string): Brick[] => {
  const [count, mixedStr, hasEgg] = key.split(':')
  const n = Number(count)
  const mixed = Number(mixedStr)
  if (n === 0) return []
  const top = Math.min(3, n)
  const out: Brick[] = []
  for (let y = 1; y < top; y++) out.push(...fill(BOWL_INSIDE, 'plate', WHITE, y))
  const cut = Math.round(mixed * SWIRL.length)
  SWIRL.forEach(([x, z], i) => {
    const yolk = hasEgg === '1' && x >= 3 && x <= 4 && z >= 3 && z <= 4
    const c = i < cut ? BATTER : yolk ? YELLOW : i % 3 === 0 && mixed > 0 ? BATTER : WHITE
    out.push(brick('plate_1x1', c, x, top, z))
  })
  return out
})

export const bowlKey = (added: number, mixed: number, egg: boolean): string =>
  `${added}:${mixed.toFixed(2)}:${egg ? 1 : 0}`

/** A whisk: a red handle and a silver head, standing upright. */
export const WHISK_HANDLE: Brick[] = [
  brick('round_1x1', RED, 0, 0, 0),
  brick('round_1x1', RED, 0, 3, 0),
  brick('round_1x1', WHITE, 0, 6, 0),
]
/** The whisk's head: a silver cone, drawn upside down under the handle. */
export const WHISK_HEAD: Brick[] = [brick('cone_2x2', SILVER, 0, 0, 0)]

// ---- Moulds, sponge, frosting ---------------------------------------------------------------------

const CELLS: Readonly<Record<Shape, Cell[]>> = {
  round: shapeCells('round'),
  square: shapeCells('square'),
}
const EDGES: Readonly<Record<Shape, Cell[]>> = {
  round: edgeCells(CELLS.round),
  square: edgeCells(CELLS.square),
}

/** A silver cake tin of `shape`. */
export const mouldBricks = once((shape: Shape): Brick[] => [
  ...fill(CELLS[shape], 'plate', SILVER, 0),
  ...fill(EDGES[shape], 'plate', SILVER, 1),
  ...fill(EDGES[shape], 'plate', SILVER, 2),
])

/** The batter in a tin (drawn on the tin, same footprint). */
export const batterBricks = once((shape: Shape): Brick[] => {
  const edge = new Set(EDGES[shape].map(([x, z]) => `${x},${z}`))
  return fill(
    CELLS[shape].filter(([x, z]) => !edge.has(`${x},${z}`)),
    'plate',
    BATTER,
    1,
  )
})

/** The baked sponge: two layers with cream between (7 plates tall). */
export const spongeBricks = once((shape: Shape): Brick[] => [
  ...fill(CELLS[shape], 'brick', SPONGE, 0),
  ...fill(CELLS[shape], 'plate', WHITE, 3),
  ...fill(CELLS[shape], 'brick', SPONGE, 4),
])

/** Plates under the sponge's top: the frosting sits at this height (plates). */
export const SPONGE_PLATES = 7

/** The frosting on top of a sponge: smooth tiles and a rim of drips down the side. */
export const frostingBricks = once((key: string): Brick[] => {
  const [shape, frosting] = key.split(':') as [Shape, Frosting]
  const c = FROSTING_COLOR[frosting]
  return fill(CELLS[shape], 'tile', c, 0)
})

export const frostingKey = (shape: Shape, frosting: Frosting): string => `${shape}:${frosting}`

/** A cake stand: a white board on a short silver foot. */
export const STAND_BRICKS: Brick[] = fill(shapeCells('round', 10), 'plate', WHITE, 0)
/** Height of the board's top (studs). */
export const STAND_TOP = 0.4

// ---- Toppings ---------------------------------------------------------------------------------------

export const TOPPING_BRICKS: Readonly<Record<Topping, Brick[]>> = {
  // A strawberry standing on its leaves.
  strawberry: [brick('plate_2x2', GREEN, 0, 0, 0), brick('cone_2x2', RED, 0, 1, 0)],
  // A striped candle with its flame.
  candle: [
    brick('round_1x1', PINK, 0, 0, 0),
    brick('round_1x1', AZURE, 0, 3, 0),
    brick('cone_1x1', TRANS_YELLOW, 0, 6, 0),
  ],
  // Coloured sprinkles: little dots of sugar.
  sprinkles: [
    brick('plate_1x1', PINK, 0, 0, 0),
    brick('plate_1x1', LIME, 1, 0, 1),
    brick('plate_1x1', YELLOW, 0, 0, 2),
    brick('plate_1x1', AZURE, 2, 0, 0),
    brick('plate_1x1', WHITE, 2, 0, 2),
    brick('plate_1x1', RED, 1, 0, 3),
    brick('plate_1x1', BLUE, 3, 0, 1),
  ],
}
/** Each topping's size on the cake (its model is scaled to fit a 2 × 2 slot). */
export const TOPPING_SCALE: Readonly<Record<Topping, number>> = {
  strawberry: 0.8,
  candle: 0.85,
  sprinkles: 0.62,
}

// ---- The oven ---------------------------------------------------------------------------------------

const OVEN_W = 6
const OVEN_D = 4
const ovenCells: Cell[] = []
for (let z = 0; z < OVEN_D; z++) for (let x = 0; x < OVEN_W; x++) ovenCells.push([x, z])

/** A cute red oven, 6 × 4 studs, 3 bricks tall, with knobs and a chimney (the window is drawn apart). */
export const OVEN_BRICKS: Brick[] = [
  ...fill(ovenCells, 'brick', RED, 0),
  ...fill(ovenCells, 'brick', RED, 3),
  ...fill(ovenCells, 'brick', RED, 6),
  ...fill(ovenCells, 'plate', DARK_GRAY, 9),
  brick('round_1x1', BLACK, 1, 10, 0),
  brick('round_1x1', BLACK, 2, 10, 0),
  brick('round_1x1', WHITE, 4, 10, 3),
  brick('round_1x1', WHITE, 4, 13, 3),
]
export const OVEN_SIZE = { w: OVEN_W, d: OVEN_D, h: 10 * 0.4 }

// ---- The order picture ------------------------------------------------------------------------------

/** Where an order's sample toppings go on its picture (slot indexes, spread out). */
function sampleSlots(shape: Shape, toppings: Topping[]): Array<[number, Topping]> {
  const n = slotsFor(shape).length
  const picks: Array<[number, Topping]> = []
  const spread =
    shape === 'round'
      ? [
          [0, 3, 11],
          [5, 6, 8],
        ]
      : [
          [0, 5, 15],
          [3, 10, 12],
        ]
  toppings.forEach((t, i) => {
    for (const s of spread[i % 2]) if (s < n) picks.push([s, t])
  })
  return picks
}

/** The finished cake an order shows: sponge, frosting and a few of its toppings. */
export const orderCakeBricks = once((key: string): Brick[] => {
  const [shape, frosting, list] = key.split('|') as [Shape, Frosting, string]
  const toppings = list ? (list.split('+') as Topping[]) : []
  const out = [
    ...spongeBricks(shape),
    ...fill(CELLS[shape], 'tile', FROSTING_COLOR[frosting], SPONGE_PLATES),
  ]
  const slots = slotsFor(shape)
  for (const [i, t] of sampleSlots(shape, toppings)) {
    const [sx, sz] = slots[i]
    const x = Math.round(sx + CAKE_SIZE / 2) - 1
    const z = Math.round(sz + CAKE_SIZE / 2) - 1
    const y = SPONGE_PLATES + 1
    if (t === 'strawberry')
      out.push(brick('round_2x2', RED, x, y, z), brick('plate_1x1', GREEN, x, y + 3, z))
    else if (t === 'candle')
      out.push(
        brick('round_1x1', PINK, x, y, z),
        brick('round_1x1', AZURE, x, y + 3, z),
        brick('cone_1x1', TRANS_YELLOW, x, y + 6, z),
      )
    else
      out.push(
        brick('plate_1x1', PINK, x, y, z),
        brick('plate_1x1', LIME, x + 1, y, z + 1),
        brick('plate_1x1', AZURE, x + 1, y, z),
      )
  }
  return out
})

export const orderPictureKey = (o: Order): string =>
  `${o.shape}|${o.frosting}|${o.toppings.join('+')}`

/** The shop's sign, hung on the back wall. */
export const SIGN_BRICKS: Brick[] = [brick('board_bakery_1x6', 9, 0, 0, 0, 0)]
