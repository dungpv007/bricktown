import { autoSteps } from '../../core/template'
import type { Baseplate, BlueprintKind, Brick, LocalizedText, Rot, Template } from '../../core/types'

export interface TemplateSpec {
  id: string
  name: LocalizedText
  difficulty: 1 | 2 | 3
  kind: BlueprintKind
  tags: string[]
  baseplate: Baseplate
  /** Defaults to `autoSteps(bricks)`. */
  steps?: number[][]
  /**
   * The first `openingCount` bricks added (floor and furniture) become the opening steps, up to
   * `OPENING_STEP_SIZE` per step, so kids see the inside before walls close it in. The remaining
   * bricks follow `autoSteps`. Ignored when `steps` is given.
   */
  openingCount?: number
}

/** An opening in a wall: cells `from..to` along the wall, courses `c0..c1` (all inclusive). */
export interface WallGap {
  from: number
  to: number
  c0: number
  c1: number
  /**
   * Bridge the opening with a beam in the course above `c1`. The beam is two bricks that each rest on the
   * wall beside the opening (one cell of overlap per side), so the opening can be up to 10 cells wide.
   */
  lintel?: boolean
}

export interface WallSpec {
  axis: 'x' | 'z'
  /** The wall's fixed coordinate (z for an x-axis wall, x for a z-axis wall). */
  fixed: number
  from: number
  to: number
  /** Bottom plate of course 0; each course is one brick (3 plates) high. */
  y: number
  courses: number
  color: number | ((course: number) => number)
  gaps?: WallGap[]
}

export interface BoxWallsSpec {
  x0: number
  x1: number
  z0: number
  z1: number
  y: number
  courses: number
  color: number | ((course: number) => number)
  /** Openings per side; the front is the z0 side (forward is -Z). Cells are x for front/back, z for left/right. */
  gaps?: { front?: WallGap[]; back?: WallGap[]; left?: WallGap[]; right?: WallGap[] }
}

export interface Builder {
  /** Adds a brick; `done` gives it the stable id `${templateId}-${index}`. */
  add(p: string, x: number, y: number, z: number, r: Rot, c: number): Brick
  /** Adds several bricks that share a y level. Each entry is `[part, x, z, rot, color]`. */
  layer(y: number, entries: Array<[string, number, number, Rot, number]>): Brick[]
  /** Number of bricks added so far. */
  count(): number
  /** One straight wall of 1xN bricks; odd courses are staggered against even ones. */
  wall(spec: WallSpec): void
  /** Four walls around the rectangle `x0..x1` by `z0..z1` (inclusive). */
  walls(spec: BoxWallsSpec): void
  /** Tiles the rectangle `x0..x1` by `z0..z1` (inclusive) with the largest plates that fit. */
  plates(y: number, x0: number, z0: number, x1: number, z1: number, color: number): void
  /** Two-tier gable roof over a footprint exactly 8 studs deep (from `z0`) and an even number of studs wide; the ridge runs along X. */
  gableRoof(y: number, x0: number, x1: number, z0: number, color: number): void
  done(spec: TemplateSpec): Template
}

export const OPENING_STEP_SIZE = 6

const RUN_LENGTHS = [6, 4, 3, 2, 1]
/** Plate sizes as [studs along x, studs along z] at r = 0; largest first. */
const PLATE_SIZES: Array<[number, number]> = [[4, 8], [4, 4], [2, 4], [2, 2], [1, 4], [1, 2], [1, 1]]
const SLOPE_WIDTHS = [4, 2]
const ROOF_BRICK_WIDTHS = [6, 4, 2]

/** Splits `length` studs into pieces from `sizes` (largest first), always taking the largest that fits. */
function split(length: number, sizes: number[]): number[] {
  const out: number[] = []
  for (let left = length; left > 0; ) {
    const n = sizes.find((s) => s <= left) as number
    out.push(n)
    left -= n
  }
  return out
}

/**
 * One or two bricks that together are `length` studs long. Each brick has to touch the wall below
 * (only its two ends do), so a beam never has more than two pieces.
 */
function beamPieces(length: number): number[] {
  if (RUN_LENGTHS.includes(length)) return [length]
  const pairs = RUN_LENGTHS.filter((a) => RUN_LENGTHS.includes(length - a) && a >= length - a)
  if (pairs.length === 0) throw new Error(`No two bricks make a beam of length ${length}`)
  const a = pairs[pairs.length - 1] // the most even split
  return [a, length - a]
}

/** Groups the bricks at `indices` into single-layer steps of at most `max` bricks. */
function chunkSteps(bricks: Brick[], indices: number[], max: number): number[][] {
  return autoSteps(
    indices.map((i) => bricks[i]),
    max,
  ).map((step) => step.map((j) => indices[j]))
}

/** Tiny helper for authoring templates in code. Ids are deterministic, never random. */
export function createBuilder(): Builder {
  const bricks: Brick[] = []
  const add: Builder['add'] = (p, x, y, z, r, c) => {
    const brick: Brick = { id: String(bricks.length), p, x, y, z, r, c }
    bricks.push(brick)
    return brick
  }

  const wall: Builder['wall'] = ({ axis, fixed, from, to, y, courses, color, gaps = [] }) => {
    const brick = (n: number, pos: number, level: number, c: number) => {
      if (axis === 'x') add(`brick_1x${n}`, pos, level, fixed, 1, c)
      else add(`brick_1x${n}`, fixed, level, pos, 0, c)
    }
    for (let course = 0; course < courses; course++) {
      const level = y + course * 3
      const c = typeof color === 'number' ? color : color(course)
      const beams = gaps.filter((g) => g.lintel && g.c1 + 1 === course)
      // The cells a beam covers (the opening plus one cell of wall each side) are left to the beam.
      const open = [
        ...gaps.filter((g) => course >= g.c0 && course <= g.c1),
        ...beams.map((g) => ({ ...g, from: g.from - 1, to: g.to + 1 })),
      ].sort((a, b) => a.from - b.from)
      // Solid stretches of this course, between the gaps.
      const stretches: Array<[number, number]> = []
      let start = from
      for (const g of open) {
        if (g.from > start) stretches.push([start, g.from - 1])
        start = Math.max(start, g.to + 1)
      }
      if (start <= to) stretches.push([start, to])
      for (const [a, b] of stretches) {
        const lengths = split(b - a + 1, RUN_LENGTHS)
        if (course % 2 === 1) lengths.reverse()
        let pos = a
        for (const n of lengths) {
          brick(n, pos, level, c)
          pos += n
        }
      }
      for (const g of beams) {
        let pos = g.from - 1
        for (const n of beamPieces(g.to - g.from + 3)) {
          brick(n, pos, level, c)
          pos += n
        }
      }
    }
  }

  /** A row of same-depth pieces across the roof, left to right. */
  const roofRow = (part: string, widths: number[], x0: number, x1: number, y: number, z: number, r: Rot, c: number) => {
    let x = x0
    for (const n of split(x1 - x0 + 1, widths)) {
      add(`${part}${n}`, x, y, z, r, c)
      x += n
    }
  }

  return {
    add,
    layer: (y, entries) => entries.map(([p, x, z, r, c]) => add(p, x, y, z, r, c)),
    count: () => bricks.length,
    wall,
    walls({ x0, x1, z0, z1, y, courses, color, gaps = {} }) {
      const common = { y, courses, color }
      wall({ ...common, axis: 'x', fixed: z0, from: x0, to: x1, gaps: gaps.front })
      wall({ ...common, axis: 'x', fixed: z1, from: x0, to: x1, gaps: gaps.back })
      wall({ ...common, axis: 'z', fixed: x0, from: z0 + 1, to: z1 - 1, gaps: gaps.left })
      wall({ ...common, axis: 'z', fixed: x1, from: z0 + 1, to: z1 - 1, gaps: gaps.right })
    },
    plates(y, x0, z0, x1, z1, color) {
      const taken = new Set<string>()
      const free = (x: number, z: number) =>
        x >= x0 && x <= x1 && z >= z0 && z <= z1 && !taken.has(`${x},${z}`)
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!free(x, z)) continue
          for (const [w, d] of PLATE_SIZES) {
            const orientations: Array<[number, number, Rot]> = [[w, d, 0], [d, w, 1]]
            const fit = orientations.find(([fx, fz]) => {
              for (let i = 0; i < fx; i++) for (let j = 0; j < fz; j++) if (!free(x + i, z + j)) return false
              return true
            })
            if (!fit) continue
            const [fx, fz, r] = fit
            for (let i = 0; i < fx; i++) for (let j = 0; j < fz; j++) taken.add(`${x + i},${z + j}`)
            add(`plate_${w}x${d}`, x, y, z, r, color)
            break
          }
        }
      }
    },
    gableRoof(y, x0, x1, z0, color) {
      // Tier 1 rests on the walls: a slope on each eave and two rows of bricks between them.
      roofRow('slope_2x', SLOPE_WIDTHS, x0, x1, y, z0, 2, color)
      roofRow('slope_2x', SLOPE_WIDTHS, x0, x1, y, z0 + 6, 0, color)
      for (const z of [z0 + 2, z0 + 4]) roofRow('brick_2x', ROOF_BRICK_WIDTHS, x0, x1, y, z, 1, color)
      // Tier 2 completes the ridge.
      roofRow('slope_2x', SLOPE_WIDTHS, x0, x1, y + 3, z0 + 2, 2, color)
      roofRow('slope_2x', SLOPE_WIDTHS, x0, x1, y + 3, z0 + 4, 0, color)
    },
    done(spec) {
      const final = bricks.map((b, i) => ({ ...b, id: `${spec.id}-${i}` }))
      let steps = spec.steps
      if (!steps && spec.openingCount) {
        const all = final.map((_, i) => i)
        const early = all.slice(0, spec.openingCount)
        const rest = all.slice(spec.openingCount)
        steps = [...chunkSteps(final, early, OPENING_STEP_SIZE), ...chunkSteps(final, rest, 4)]
      }
      return {
        id: spec.id,
        name: spec.name,
        difficulty: spec.difficulty,
        kind: spec.kind,
        tags: spec.tags,
        baseplate: spec.baseplate,
        bricks: final,
        steps: steps ?? autoSteps(final),
      }
    },
  }
}
