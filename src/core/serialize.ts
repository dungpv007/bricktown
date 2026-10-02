import { PLATE_MAX } from './baseplate'
import { MIN_SCALE, normalizeScale } from './city'
import { COLORS } from './colors'
import { newId } from './ids'
import { MINIFIG_PART, parseFig } from './figures'
import { DEFAULT_MAZE_WALL_COLOR, MAZE_MAX_SIZE, MAZE_MIN_SIZE, cellKey, inBounds, isBorder, isCorner, type Cell, type Maze } from './maze'
import { validateTemplate } from './template'
import type { Baseplate, Blueprint, Brick, CityPlacement, MazeChallenge, MazeRecord, SaveData, Template } from './types'

export const SCHEMA_VERSION = 3

/** Best runs of the ready-made mazes are kept under `tpl:<template id>`. */
const TEMPLATE_KEY_PREFIX = 'tpl:'

export function createEmptySave(): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    blueprints: [],
    city: { size: 48, roads: [], placements: [] },
    workshop: { kind: 'building', baseplate: { w: 16, d: 16 }, bricks: [] },
    guided: null,
    completedTemplates: [],
    sharedTemplates: [],
    mazes: [],
    mazeRecords: {},
    mazeChallenges: {},
  }
}

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

/** Key N migrates a save from schema version N to N + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  /**
   * v2 appended colours 16-29 and the optional `Baseplate.c`; ids 0-15 kept their meaning. Saves
   * only ever stored colour indices (the old `glass` flag lived in the COLORS table, now `trans`),
   * so there is nothing to rewrite: a missing plate colour means the kind's default.
   */
  1: (data) => data,
  /**
   * v3 made the maze mode and sharing fields required: the kid's mazes, the best runs, shared
   * templates and challenges. A late v2 save may already carry some of them (sharing wrote them as
   * optional fields), so they are kept; `normalize` then checks every value.
   */
  2: (data) => ({
    ...data,
    sharedTemplates: Array.isArray(data.sharedTemplates) ? data.sharedTemplates : [],
    mazes: Array.isArray(data.mazes) ? data.mazes : [],
    mazeRecords: isRecord(data.mazeRecords) ? data.mazeRecords : {},
    mazeChallenges: isRecord(data.mazeChallenges) ? data.mazeChallenges : {},
  }),
}
// `CityPlacement.s` (a model drawn x2..x10) was added during v3 without a bump: it is optional, an
// absent one means x1, and `normalize` rounds / clamps it into 1..10 (garbage becomes x1). An older
// client simply ignores it and draws the model at its normal size.
// `Brick.fig` (minifigure styles) was added during v2 without its own bump: it is optional and purely
// additive, older saves simply have no figures, and `normalize` drops any style it cannot read.
// Adding a value to a FigStyle option list (FIG_FACES, FIG_HATS, FIG_PRINTS, FIG_ACCESSORIES) or a
// colour needs a schema bump: older clients drop styles they cannot read (`parseFig`), so a save
// using the new value would lose its figure's look there.

const UNSUPPORTED = 'unsupported save'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function migrate(raw: unknown): SaveData {
  if (!isRecord(raw)) throw new Error(UNSUPPORTED)
  let version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
    throw new Error(UNSUPPORTED)
  }
  let data: Record<string, unknown> = { ...raw }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) throw new Error(UNSUPPORTED)
    data = { ...step(data), schemaVersion: version + 1 }
    version += 1
  }
  if (!Array.isArray(data.blueprints) || !isRecord(data.city) || !isRecord(data.workshop)) {
    throw new Error(UNSUPPORTED)
  }
  return normalize(data, data.city, data.workshop)
}

const KINDS: readonly string[] = ['building', 'vehicle', 'prop']
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const isColor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && COLORS[v] !== undefined
const arrayOr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback)

/**
 * Fills in whatever a hand-edited or older file left out with the empty-save defaults, so the rest
 * of the app can trust the shape (a missing `guided` or `city.roads` must not crash a scene).
 */
function normalize(data: Record<string, unknown>, city: Record<string, unknown>, workshop: Record<string, unknown>): SaveData {
  const empty = createEmptySave()
  const baseplate = workshop.baseplate
  const guided = data.guided
  return {
    ...(data as unknown as SaveData),
    schemaVersion: SCHEMA_VERSION,
    blueprints: arrayOr<Blueprint>(data.blueprints, []).map((bp) =>
      isRecord(bp) && Array.isArray(bp.bricks) ? { ...bp, bricks: normalizeBricks(bp.bricks) } : bp,
    ),
    city: {
      size: isPositiveInt(city.size) ? city.size : empty.city.size,
      roads: arrayOr<string>(city.roads, []).filter((r) => typeof r === 'string'),
      placements: arrayOr<unknown>(city.placements, []).map(normalizePlacement),
    },
    workshop: {
      kind: typeof workshop.kind === 'string' && KINDS.includes(workshop.kind) ? (workshop.kind as SaveData['workshop']['kind']) : empty.workshop.kind,
      baseplate:
        isRecord(baseplate) && isPositiveInt(baseplate.w) && isPositiveInt(baseplate.d)
          ? normalizePlate(baseplate.w, baseplate.d, baseplate.c)
          : empty.workshop.baseplate,
      bricks: normalizeBricks(arrayOr(workshop.bricks, [])),
      ...(typeof workshop.editingBlueprintId === 'string' ? { editingBlueprintId: workshop.editingBlueprintId } : {}),
    },
    guided:
      isRecord(guided) && typeof guided.templateId === 'string' && typeof guided.step === 'number' && Array.isArray(guided.placed)
        ? (guided as unknown as SaveData['guided'])
        : null,
    completedTemplates: arrayOr<string>(data.completedTemplates, []).filter((id) => typeof id === 'string'),
    sharedTemplates: arrayOr<unknown>(data.sharedTemplates, [])
      .filter(isTemplateLike)
      .map((t) => ({ ...t, bricks: normalizeBricks(t.bricks) }) as unknown as Template)
      .filter(isSoundTemplate),
    mazes: normalizeMazes(arrayOr(data.mazes, [])),
    mazeRecords: normalizeMazeRecords(data.mazeRecords),
    mazeChallenges: normalizeChallenges(data.mazeChallenges),
  }
}

/** A template Guided mode can build: one that a hand-edited file broke is dropped. */
function isSoundTemplate(t: Template): boolean {
  try {
    return validateTemplate(t).length === 0
  } catch {
    return false // a shape validateTemplate does not expect (it assumes the template's types)
  }
}

/** Enough of a template's shape for `validateTemplate` to make sense of it, on a plate the app can show. */
function isTemplateLike(v: unknown): v is Record<string, unknown> & { bricks: unknown[] } {
  return (
    isRecord(v) && typeof v.id === 'string' && isRecord(v.name) && isRecord(v.baseplate) &&
    isPositiveInt(v.baseplate.w) && isPositiveInt(v.baseplate.d) && v.baseplate.w <= PLATE_MAX && v.baseplate.d <= PLATE_MAX &&
    Array.isArray(v.bricks) && Array.isArray(v.steps)
  )
}

/** Keys that must never become own properties of a record built from a file. */
const isUnsafeKey = (key: string) => key === '__proto__' || key === 'constructor' || key === 'prototype'

function normalizeChallenges(v: unknown): Record<string, MazeChallenge> {
  const out: Record<string, MazeChallenge> = {}
  if (!isRecord(v)) return out
  for (const [id, c] of Object.entries(v)) {
    if (isUnsafeKey(id) || !isRecord(c) || typeof c.timeMs !== 'number' || !Number.isFinite(c.timeMs) || c.timeMs <= 0) continue
    out[id] = typeof c.from === 'string' ? { timeMs: c.timeMs, from: c.from } : { timeMs: c.timeMs }
  }
  return out
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isMazeSize = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v % 2 === 1 && v >= MAZE_MIN_SIZE && v <= MAZE_MAX_SIZE

/**
 * Mazes with an id and a valid size, held to the maze rules (see core/maze): cell lists keep only
 * distinct in-grid keys; a door must be on the outer ring, not on a corner, not a wall and not the
 * other door, else it is dropped; the rest of the outer ring is wall; coins only lie on floor
 * cells that are not doors. Duplicate ids keep the first.
 */
function normalizeMazes(raw: unknown[]): Maze[] {
  const seen = new Set<string>()
  const out: Maze[] = []
  for (const m of raw) {
    if (!isRecord(m) || typeof m.id !== 'string' || m.id === '' || seen.has(m.id) || !isMazeSize(m.w) || !isMazeSize(m.h)) continue
    // `tpl:<id>` keys a ready-made maze's best run: a kid's maze must never share it.
    const id = m.id.startsWith(TEMPLATE_KEY_PREFIX) ? newId('maze') : m.id
    seen.add(m.id)
    seen.add(id)
    const dims = { w: m.w, h: m.h }
    const keys = (v: unknown): string[] => {
      const valid = arrayOr<unknown>(v, []).filter((k): k is string => {
        if (typeof k !== 'string' || !/^\d+,\d+$/.test(k)) return false
        const [cx, cz] = k.split(',').map(Number)
        return inBounds(dims, { cx, cz }) && cellKey({ cx, cz }) === k
      })
      return [...new Set(valid)]
    }
    const walls = new Set(keys(m.walls))
    const door = (v: unknown, other: Cell | null): Cell | null => {
      if (!isRecord(v) || !Number.isInteger(v.cx) || !Number.isInteger(v.cz)) return null
      const cell = { cx: v.cx as number, cz: v.cz as number }
      const ok =
        isBorder(dims, cell) && !isCorner(dims, cell) && !walls.has(cellKey(cell)) &&
        !(other && other.cx === cell.cx && other.cz === cell.cz)
      return ok ? cell : null
    }
    const entry = door(m.entry, null)
    const exit = door(m.exit, entry)
    const doors = new Set([entry, exit].filter((c): c is Cell => c !== null).map(cellKey))
    for (let cz = 0; cz < m.h; cz++) {
      for (let cx = 0; cx < m.w; cx++) {
        const k = cellKey({ cx, cz })
        if (isBorder(dims, { cx, cz }) && !doors.has(k)) walls.add(k)
      }
    }
    out.push({
      id,
      name: typeof m.name === 'string' ? m.name : '',
      w: m.w,
      h: m.h,
      walls: [...walls],
      entry,
      exit,
      coins: keys(m.coins).filter((k) => !walls.has(k) && !doors.has(k)),
      wallColor: isColor(m.wallColor) ? m.wallColor : DEFAULT_MAZE_WALL_COLOR,
      ...(isColor(m.floorColor) ? { floorColor: m.floorColor } : {}),
      createdAt: isFiniteNumber(m.createdAt) ? m.createdAt : 0,
      updatedAt: isFiniteNumber(m.updatedAt) ? m.updatedAt : 0,
      ...(typeof m.templateId === 'string' ? { templateId: m.templateId } : {}),
    })
  }
  return out
}

function normalizeMazeRecords(raw: unknown): Record<string, MazeRecord> {
  const out: Record<string, MazeRecord> = {}
  if (!isRecord(raw)) return out
  for (const [key, r] of Object.entries(raw)) {
    if (isUnsafeKey(key) || !isRecord(r)) continue
    const { timeMs, stars, coins } = r
    if (!isFiniteNumber(timeMs) || timeMs < 0) continue
    if (stars !== 1 && stars !== 2 && stars !== 3) continue
    if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 0) continue
    out[key] = { timeMs, stars, coins }
  }
  return out
}

/** A placement as stored, with its size multiplier made safe (see `normalizeScale`); x1 drops it. */
function normalizePlacement(p: unknown): CityPlacement {
  if (!isRecord(p) || !('s' in p)) return p as unknown as CityPlacement
  const { s, ...rest } = p
  const scale = normalizeScale(s)
  return (scale === MIN_SCALE ? rest : { ...rest, s: scale }) as unknown as CityPlacement
}

/**
 * Bricks as stored, except that a figure style is kept only on a minifigure brick and only when it
 * is valid (see `parseFig`); otherwise it is dropped.
 */
function normalizeBricks(bricks: unknown[]): Brick[] {
  return bricks.map((b) => {
    if (!isRecord(b) || !('fig' in b)) return b as unknown as Brick
    const { fig, ...rest } = b
    const style = rest.p === MINIFIG_PART ? parseFig(fig) : null
    return (style ? { ...rest, fig: style } : rest) as unknown as Brick
  })
}

function normalizePlate(w: number, d: number, c: unknown): Baseplate {
  return isColor(c) ? { w, d, c } : { w, d }
}

export function exportSave(data: SaveData): string {
  return JSON.stringify({ app: 'bricktown', ...data }, null, 2)
}

export function importSave(json: string): SaveData {
  const parsed: unknown = JSON.parse(json)
  if (!isRecord(parsed) || parsed.app !== 'bricktown') throw new Error(UNSUPPORTED)
  const { app: _app, ...rest } = parsed
  void _app
  return migrate(rest)
}
