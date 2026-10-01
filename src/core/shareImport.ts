import { PLATE_MAX } from './baseplate'
import { COLORS } from './colors'
import { isFigure, parseFig } from './figures'
import { newId } from './ids'
import { MAX_BRICKS, MAX_HEIGHT_PLATES } from './model'
import { MAZE_MAX_SIZE, MAZE_MIN_SIZE, cellKey, isBorder, isCorner, type Cell, type Maze } from './maze'
import { Occupancy } from './occupancy'
import { PART_BY_ID } from './parts/catalog'
import { footprint } from './rotation'
import type { MazeBest, ShareErrorCode, ShareError, ShareKind, SharePackage } from './share'
import { validateTemplate } from './template'
import type {
  Baseplate, Blueprint, BlueprintKind, Brick, CityPlacement, CityState, MazeChallenge, Rot, SaveData, Template,
} from './types'

/**
 * Imports are untrusted (a link or file from anyone): `validatePackage` checks every value and
 * rebuilds the package from scratch, keeping only known fields; `planImport` gives everything new
 * ids so nothing collides with the kid's data; `applyImport` adds it to the save once confirmed.
 */

export const SHARE_LIMITS = {
  bricks: MAX_BRICKS,
  cityBlueprints: 60,
  citySize: 48,
  nameLength: 40,
  tags: 8,
  /** A best run longer than a day is not a run. */
  bestTimeMs: 24 * 60 * 60 * 1000,
} as const

const KINDS: readonly ShareKind[] = ['model', 'maze', 'city']
const BLUEPRINT_KINDS: readonly BlueprintKind[] = ['building', 'vehicle', 'prop']
const TAG = /^[a-z0-9_-]{1,24}$/
const TEMPLATE_SOURCE = /^tpl:[a-z0-9_]{1,40}$/
const CELL_KEY = /^(\d{1,3}),(\d{1,3})$/
// Control characters, zero-width and text-direction characters (they can disguise a name).
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** A name to show as text: trimmed, without control or direction characters, at most 40 characters. */
export function sanitizeName(v: unknown): string {
  if (typeof v !== 'string') return ''
  const clean = v.replace(UNSAFE_CHARS, '').trim()
  return Array.from(clean).slice(0, SHARE_LIMITS.nameLength).join('')
}

class Refusal {
  constructor(readonly code: ShareErrorCode) {}
}

function fail(code: ShareErrorCode): never {
  throw new Refusal(code)
}

type Loose = Record<string, unknown>

const isRecord = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isColor = (v: unknown): v is number => isInt(v) && v >= 0 && v < COLORS.length
const isRot = (v: unknown): v is Rot => v === 0 || v === 1 || v === 2 || v === 3
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function record(v: unknown): Loose {
  return isRecord(v) ? v : fail('invalid')
}

function list(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v)) fail('invalid')
  if (v.length > max) fail('too_big')
  return v
}

function text(v: unknown): string {
  return typeof v === 'string' ? sanitizeName(v) : fail('invalid')
}

/** The package rebuilt from validated values only, or why it is refused. Never throws. */
export function validatePackage(raw: unknown): SharePackage | ShareError {
  try {
    return checkPackage(raw)
  } catch (e) {
    return { error: e instanceof Refusal ? e.code : 'invalid' }
  }
}

function checkPackage(raw: unknown): SharePackage {
  const pkg = record(raw)
  if (pkg.app !== 'bricktown') fail('unsupported')
  if (pkg.v !== 1) fail(isInt(pkg.v) && pkg.v > 1 ? 'unsupported' : 'invalid')
  const kind = pkg.kind
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) fail('unsupported')
  if (!isTime(pkg.createdAt)) fail('invalid')
  const createdAt = pkg.createdAt
  const header = { app: 'bricktown', v: 1, kind: kind as ShareKind, name: text(pkg.name), createdAt } as const
  switch (kind as ShareKind) {
    case 'model':
      return { ...header, model: checkModel(record(pkg.model), createdAt) }
    case 'maze':
      return { ...header, maze: checkMazeSection(record(pkg.maze), createdAt) }
    case 'city':
      return { ...header, city: checkCity(record(pkg.city), createdAt) }
  }
}

// ---------------------------------------------------------------------------------------------
// models

function checkBaseplate(v: unknown): Baseplate {
  const p = record(v)
  if (!isInt(p.w) || !isInt(p.d) || p.w < 1 || p.d < 1) fail('invalid')
  if (p.w > PLATE_MAX || p.d > PLATE_MAX) fail('too_big')
  if (p.c === undefined) return { w: p.w, d: p.d }
  return isColor(p.c) ? { w: p.w, d: p.d, c: p.c } : fail('invalid')
}

function checkBrick(v: unknown, i: number, plate: Baseplate): Brick {
  const b = record(v)
  const { p, x, y, z, r, c } = b
  if (typeof p !== 'string' || !Object.hasOwn(PART_BY_ID, p)) fail('invalid')
  if (!isInt(x) || !isInt(y) || !isInt(z) || !isRot(r) || !isColor(c)) fail('invalid')
  const part = PART_BY_ID[p]
  const { fx, fz } = footprint(part, r)
  if (x < 0 || z < 0 || y < 0 || x + fx > plate.w || z + fz > plate.d || y + part.h > MAX_HEIGHT_PLATES) fail('invalid')
  const brick: Brick = { id: `b${i}`, p, x, y, z, r, c }
  if (b.fig !== undefined) {
    // parseFig copies only the fields it accepts: equal key counts mean nothing was dropped.
    const fig = parseFig(b.fig)
    if (!fig || !isFigure(brick) || Object.keys(fig).length !== Object.keys(record(b.fig)).length) fail('invalid')
    brick.fig = fig
  }
  return brick
}

function checkBlueprint(v: unknown, time: number): Blueprint {
  const bp = record(v)
  if (typeof bp.id !== 'string') fail('invalid')
  const kind = bp.kind
  if (typeof kind !== 'string' || !(BLUEPRINT_KINDS as readonly string[]).includes(kind)) fail('invalid')
  const tags = bp.tags === undefined ? [] : list(bp.tags, Infinity)
  const baseplate = checkBaseplate(bp.baseplate)
  const bricks = list(bp.bricks, SHARE_LIMITS.bricks).map((b, i) => checkBrick(b, i, baseplate))
  const occupied = new Occupancy()
  for (const b of bricks) {
    if (occupied.collides(b)) fail('invalid')
    occupied.add(b)
  }
  return {
    id: bp.id,
    name: text(bp.name),
    kind: kind as BlueprintKind,
    tags: tags.filter((t): t is string => typeof t === 'string' && TAG.test(t)).slice(0, SHARE_LIMITS.tags),
    baseplate,
    bricks,
    createdAt: time,
    updatedAt: time,
  }
}

/** Steps that use every brick exactly once and build like a template (each brick fits when placed). */
function checkSteps(v: unknown, bp: Blueprint): number[][] {
  const n = bp.bricks.length
  const sized = (a: unknown): a is unknown[] => Array.isArray(a) && a.length <= n
  if (!sized(v) || !v.every(sized)) fail('invalid')
  const steps = v
  const seen = new Set<unknown>()
  for (const step of steps) for (const i of step) seen.add(i)
  const total = steps.reduce((n, s) => n + s.length, 0)
  // Every index once (checked cheaply first, so validateTemplate only ever sees n distinct bricks).
  if (total !== bp.bricks.length || seen.size !== total) fail('invalid')
  const checked = steps as number[][]
  const problems = validateTemplate({
    id: 'import', name: { vi: '', en: '' }, difficulty: 1, kind: bp.kind, tags: [],
    baseplate: bp.baseplate, bricks: bp.bricks, steps: checked,
  })
  return problems.length === 0 ? checked.map((s) => [...s]) : fail('invalid')
}

function checkModel(m: Loose, time: number): NonNullable<SharePackage['model']> {
  const blueprint = checkBlueprint(m.blueprint, time)
  return 'steps' in m ? { blueprint, steps: checkSteps(m.steps, blueprint) } : { blueprint }
}

// ---------------------------------------------------------------------------------------------
// mazes

function checkCellKey(v: unknown, w: number, h: number): string {
  const match = typeof v === 'string' ? CELL_KEY.exec(v) : null
  if (!match) fail('invalid')
  const cell = { cx: Number(match[1]), cz: Number(match[2]) }
  return cell.cx < w && cell.cz < h ? cellKey(cell) : fail('invalid')
}

function checkKeys(v: unknown, w: number, h: number): string[] {
  return [...new Set(list(v, w * h).map((k) => checkCellKey(k, w, h)))]
}

function checkDoor(v: unknown, dims: { w: number; h: number }, walls: Set<string>): Cell | null {
  if (v === null) return null
  const d = record(v)
  if (!isInt(d.cx) || !isInt(d.cz)) fail('invalid')
  const cell = { cx: d.cx, cz: d.cz }
  if (!isBorder(dims, cell) || isCorner(dims, cell) || walls.has(cellKey(cell))) fail('invalid')
  return cell
}

function checkMaze(v: unknown, time: number): Maze {
  const m = record(v)
  const { w, h } = m
  const okSize = (n: unknown): n is number => isInt(n) && n % 2 === 1 && n >= MAZE_MIN_SIZE && n <= MAZE_MAX_SIZE
  if (typeof m.id !== 'string' || !okSize(w) || !okSize(h)) fail('invalid')
  const walls = checkKeys(m.walls, w, h)
  const wallSet = new Set(walls)
  const entry = checkDoor(m.entry, { w, h }, wallSet)
  const exit = checkDoor(m.exit, { w, h }, wallSet)
  if (entry && exit && cellKey(entry) === cellKey(exit)) fail('invalid')
  const doors = new Set([entry, exit].filter((c): c is Cell => c !== null).map(cellKey))
  const coins = checkKeys(m.coins, w, h)
  if (coins.some((k) => wallSet.has(k) || doors.has(k))) fail('invalid')
  if (!isColor(m.wallColor) || (m.floorColor !== undefined && !isColor(m.floorColor))) fail('invalid')
  const maze: Maze = {
    id: m.id, name: text(m.name), w, h, walls, entry, exit, coins, wallColor: m.wallColor,
    createdAt: time, updatedAt: time,
  }
  if (m.floorColor !== undefined) maze.floorColor = m.floorColor
  return maze
}

function checkBest(v: unknown): MazeBest {
  const b = record(v)
  const { timeMs, stars } = b
  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs <= 0 || timeMs > SHARE_LIMITS.bestTimeMs) fail('invalid')
  if (stars !== 1 && stars !== 2 && stars !== 3) fail('invalid')
  return { timeMs, stars }
}

function checkMazeSection(z: Loose, time: number): NonNullable<SharePackage['maze']> {
  const maze = checkMaze(z.maze, time)
  return 'best' in z ? { maze, best: checkBest(z.best) } : { maze }
}

// ---------------------------------------------------------------------------------------------
// cities

function checkCity(c: Loose, time: number): NonNullable<SharePackage['city']> {
  const city = record(c.city)
  const { size } = city
  if (!isInt(size) || size < 1) fail('invalid')
  if (size > SHARE_LIMITS.citySize) fail('too_big')
  const blueprints = list(c.blueprints, SHARE_LIMITS.cityBlueprints).map((b) => checkBlueprint(b, time))
  const ids = new Set(blueprints.map((b) => b.id))
  if (ids.size !== blueprints.length) fail('invalid')
  const roads = checkKeys(city.roads, size, size)
  const placements = list(city.placements, size * size).map((v): CityPlacement => {
    const p = record(v)
    const { id, source, cx, cz, rot } = p
    if (typeof id !== 'string' || typeof source !== 'string') fail('invalid')
    if (!TEMPLATE_SOURCE.test(source) && !ids.has(source)) fail('invalid')
    if (!isInt(cx) || !isInt(cz) || cx < 0 || cz < 0 || cx >= size || cz >= size || !isRot(rot)) fail('invalid')
    return { id, source, cx, cz, rot }
  })
  return { city: { size, roads, placements }, blueprints }
}

// ---------------------------------------------------------------------------------------------
// import

export interface ModelImportPlan {
  kind: 'model'
  name: string
  blueprint: Blueprint
  /** Present when the model came with build steps: added to the Guided picker's shared section. */
  template?: Template
  brickCount: number
}

export interface MazeImportPlan {
  kind: 'maze'
  name: string
  maze: Maze
  /** The sender's best time, for the kid to beat. */
  challenge?: MazeChallenge
}

export interface CityImportPlan {
  kind: 'city'
  name: string
  city: CityState
  /** Added to the library (placements refer to them). */
  blueprints: Blueprint[]
  brickCount: number
  /** What the kid's current city loses: it is replaced as a whole. */
  replaces: { placements: number; roads: number }
}

export type ImportPlan = ModelImportPlan | MazeImportPlan | CityImportPlan

/** A new id with `prefix` that is not in `taken` (and is then taken). */
function freshId(prefix: string | undefined, taken: Set<string>): string {
  let id = newId(prefix)
  while (taken.has(id)) id = newId(prefix)
  taken.add(id)
  return id
}

function freshBlueprint(bp: Blueprint, id: string, now: number): Blueprint {
  const brickIds = new Set<string>()
  return {
    id,
    name: bp.name,
    kind: bp.kind,
    tags: [...bp.tags],
    baseplate: { ...bp.baseplate },
    bricks: bp.bricks.map((b) => ({ ...b, id: freshId(undefined, brickIds), ...(b.fig ? { fig: { ...b.fig } } : {}) })),
    createdAt: now,
    updatedAt: now,
  }
}

/** Guided difficulty from size: small builds are easy. */
const difficultyOf = (bricks: number): Template['difficulty'] => (bricks <= 40 ? 1 : bricks <= 120 ? 2 : 3)

const bricksIn = (bps: Blueprint[]) => bps.reduce((n, b) => n + b.bricks.length, 0)

/** What importing a validated package will add or replace, with new ids throughout. */
export function planImport(data: SaveData, pkg: SharePackage, now = Date.now()): ImportPlan {
  const bpIds = new Set(data.blueprints.map((b) => b.id))
  if (pkg.model) {
    const { steps } = pkg.model
    const blueprint = freshBlueprint(pkg.model.blueprint, freshId('bp', bpIds), now)
    const plan: ModelImportPlan = { kind: 'model', name: pkg.name, blueprint, brickCount: blueprint.bricks.length }
    if (steps) {
      const id = freshId('shared', new Set((data.sharedTemplates ?? []).map((t) => t.id)))
      plan.template = {
        id,
        name: { vi: blueprint.name, en: blueprint.name },
        difficulty: difficultyOf(blueprint.bricks.length),
        kind: blueprint.kind,
        tags: [...blueprint.tags],
        baseplate: { ...blueprint.baseplate },
        bricks: blueprint.bricks.map((b, i) => ({ ...b, id: `${id}-${i}` })),
        steps: steps.map((s) => [...s]),
      }
    }
    return plan
  }
  if (pkg.maze) {
    const { maze, best } = pkg.maze
    const id = freshId('maze', new Set((data.mazes ?? []).map((m) => m.id)))
    const plan: MazeImportPlan = {
      kind: 'maze',
      name: pkg.name,
      maze: {
        ...maze,
        id,
        walls: [...maze.walls],
        coins: [...maze.coins],
        entry: maze.entry && { ...maze.entry },
        exit: maze.exit && { ...maze.exit },
        createdAt: now,
        updatedAt: now,
      },
    }
    if (best) plan.challenge = { timeMs: best.timeMs }
    return plan
  }
  if (pkg.city) {
    const remap = new Map<string, string>()
    const blueprints = pkg.city.blueprints.map((bp) => {
      const id = freshId('bp', bpIds)
      remap.set(bp.id, id)
      return freshBlueprint(bp, id, now)
    })
    const placementIds = new Set<string>()
    const { size, roads, placements } = pkg.city.city
    return {
      kind: 'city',
      name: pkg.name,
      city: {
        size,
        roads: [...roads],
        placements: placements.map((p) => ({ ...p, id: freshId('pl', placementIds), source: remap.get(p.source) ?? p.source })),
      },
      blueprints,
      brickCount: bricksIn(blueprints),
      replaces: { placements: data.city.placements.length, roads: data.city.roads.length },
    }
  }
  throw new Error('package without content') // validated packages always have their section
}

/** The save with the import applied (after the kid confirmed the preview). */
export function applyImport(data: SaveData, plan: ImportPlan): SaveData {
  switch (plan.kind) {
    case 'model':
      return {
        ...data,
        blueprints: [...data.blueprints, plan.blueprint],
        ...(plan.template ? { sharedTemplates: [...(data.sharedTemplates ?? []), plan.template] } : {}),
      }
    case 'maze':
      return {
        ...data,
        mazes: [...(data.mazes ?? []), plan.maze],
        ...(plan.challenge ? { mazeChallenges: { ...data.mazeChallenges, [plan.maze.id]: plan.challenge } } : {}),
      }
    case 'city':
      return { ...data, blueprints: [...data.blueprints, ...plan.blueprints], city: plan.city }
  }
}
