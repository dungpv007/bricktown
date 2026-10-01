import { PLATE_MAX } from './baseplate'
import { CELL, canPlaceInCity } from './city'
import { COLORS } from './colors'
import { isFigure, parseFig } from './figures'
import { newId } from './ids'
import { MAX_BRICKS, MAX_HEIGHT_PLATES } from './model'
import { MAZE_MAX_SIZE, MAZE_MIN_SIZE, cellKey, isBorder, isCorner, solve, type Cell, type Maze } from './maze'
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
  /** Tags sent per blueprint (only `tags` of them are kept). */
  tagList: 64,
  /** Distinct part ids a package can use. */
  partTable: 256,
  /** A best run longer than a day is not a run. */
  bestTimeMs: 24 * 60 * 60 * 1000,
} as const

/** A shared best run faster than this per cell of the shortest path is not believable: dropped. */
export const MIN_BEST_MS_PER_CELL = 250

/** Names given to creations whose name is empty after cleaning (Vietnamese, the default language). */
export const DEFAULT_SHARE_NAMES: Record<ShareKind, string> = { model: 'Mô hình', maze: 'Mê cung', city: 'Thành phố' }

export interface ShareImportOptions {
  /** Baseplate of a built-in template (for city placements); unknown templates count as one cell. */
  templateSize?: (templateId: string) => Baseplate | undefined
  /** Replacement names for empty ones, e.g. in the kid's language. */
  names?: Partial<Record<ShareKind, string>>
}

const KINDS: readonly ShareKind[] = ['model', 'maze', 'city']
const BLUEPRINT_KINDS: readonly BlueprintKind[] = ['building', 'vehicle', 'prop']
const TAG = /^[a-z0-9_-]{1,24}$/
const TEMPLATE_PREFIX = 'tpl:'
const TEMPLATE_SOURCE = /^tpl:[a-z0-9_]{1,40}$/
const CELL_KEY = /^(\d{1,3}),(\d{1,3})$/
/** What an unknown template placement occupies: one city cell. */
const PLACEHOLDER_PLATE: Baseplate = { w: CELL, d: CELL }
/**
 * Characters that can hide or disguise text: controls, soft hyphen, zero-width and direction marks,
 * line/paragraph separators, invisible operators, BOM and tag characters. The zero-width joiner is
 * kept: emoji sequences (families, professions) need it.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200C\u200E-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu
/** Longest input looked at: far more than 40 characters, even with many combining marks. */
const NAME_SCAN = 4096

const graphemes: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

/** The first `n` user-perceived characters (code points where Intl.Segmenter is missing). */
function firstChars(s: string, n: number): string {
  if (!graphemes) return Array.from(s).slice(0, n).join('')
  let out = ''
  let count = 0
  for (const { segment } of graphemes.segment(s)) {
    if (count++ === n) break
    out += segment
  }
  return out
}

/**
 * A name to show as text: without hiding characters, trimmed, at most 40 characters (never cutting
 * an emoji apart); `fallback` when nothing is left.
 */
export function sanitizeName(v: unknown, fallback = ''): string {
  if (typeof v !== 'string') return fallback
  const clean = firstChars(v.slice(0, NAME_SCAN).replace(UNSAFE_CHARS, '').trim(), SHARE_LIMITS.nameLength)
  return clean || fallback
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

function text(v: unknown, fallback: string): string {
  return typeof v === 'string' ? sanitizeName(v, fallback) : fail('invalid')
}

/** The package rebuilt from validated values only, or why it is refused. Never throws. */
export function validatePackage(raw: unknown, opts: ShareImportOptions = {}): SharePackage | ShareError {
  try {
    return checkPackage(raw, opts)
  } catch (e) {
    return { error: e instanceof Refusal ? e.code : 'invalid' }
  }
}

function checkPackage(raw: unknown, opts: ShareImportOptions): SharePackage {
  const pkg = record(raw)
  if (pkg.app !== 'bricktown') fail('unsupported')
  if (pkg.v !== 1) fail(isInt(pkg.v) && pkg.v > 1 ? 'unsupported' : 'invalid')
  const kind = pkg.kind
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) fail('unsupported')
  if (!isTime(pkg.createdAt)) fail('invalid')
  const createdAt = pkg.createdAt
  const names = { ...DEFAULT_SHARE_NAMES, ...opts.names }
  const header = { app: 'bricktown', v: 1, kind: kind as ShareKind, name: text(pkg.name, names[kind as ShareKind]), createdAt } as const
  switch (kind as ShareKind) {
    case 'model':
      return { ...header, model: checkModel(record(pkg.model), createdAt, names.model) }
    case 'maze':
      return { ...header, maze: checkMazeSection(record(pkg.maze), createdAt, names.maze) }
    case 'city':
      return { ...header, city: checkCity(record(pkg.city), createdAt, names.model, opts) }
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

/**
 * True when two bricks share a voxel. Bricks are already inside the plate (x, z < PLATE_MAX = 48,
 * which fits in 64; y < MAX_HEIGHT_PLATES), so a voxel is one number: much cheaper than
 * Occupancy's string keys for 60 blueprints of 1500 bricks.
 */
function anyOverlap(bricks: Brick[]): boolean {
  const voxels = new Set<number>()
  for (const b of bricks) {
    const part = PART_BY_ID[b.p]
    const { fx, fz } = footprint(part, b.r)
    for (let dy = 0; dy < part.h; dy++) {
      for (let dx = 0; dx < fx; dx++) {
        for (let dz = 0; dz < fz; dz++) {
          const key = ((b.y + dy) * 64 + b.x + dx) * 64 + b.z + dz
          if (voxels.has(key)) return true
          voxels.add(key)
        }
      }
    }
  }
  return false
}

function checkBlueprint(v: unknown, time: number, fallbackName: string): Blueprint {
  const bp = record(v)
  if (typeof bp.id !== 'string') fail('invalid')
  const kind = bp.kind
  if (typeof kind !== 'string' || !(BLUEPRINT_KINDS as readonly string[]).includes(kind)) fail('invalid')
  const tags = bp.tags === undefined ? [] : list(bp.tags, SHARE_LIMITS.tagList)
  const baseplate = checkBaseplate(bp.baseplate)
  const bricks = list(bp.bricks, SHARE_LIMITS.bricks).map((b, i) => checkBrick(b, i, baseplate))
  if (anyOverlap(bricks)) fail('invalid')
  return {
    id: bp.id,
    name: text(bp.name, fallbackName),
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
  const total = steps.reduce((sum, s) => sum + s.length, 0)
  if (total !== n) fail('invalid')
  const seen = new Set<unknown>()
  for (const step of steps) for (const i of step) seen.add(i)
  // Every index once (checked cheaply first, so validateTemplate only ever sees n distinct bricks).
  if (seen.size !== total) fail('invalid')
  const checked = steps as number[][]
  const problems = validateTemplate({
    id: 'import', name: { vi: '', en: '' }, difficulty: 1, kind: bp.kind, tags: [],
    baseplate: bp.baseplate, bricks: bp.bricks, steps: checked,
  })
  return problems.length === 0 ? checked.map((s) => [...s]) : fail('invalid')
}

function checkModel(m: Loose, time: number, fallbackName: string): NonNullable<SharePackage['model']> {
  const blueprint = checkBlueprint(m.blueprint, time, fallbackName)
  if (blueprint.bricks.length === 0) fail('invalid') // nothing to see or build
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

function checkDoor(v: unknown, dims: { w: number; h: number }, walls: Set<string>): Cell {
  const d = record(v) // a shared maze must be playable: both doors present
  if (!isInt(d.cx) || !isInt(d.cz)) fail('invalid')
  const cell = { cx: d.cx, cz: d.cz }
  if (!isBorder(dims, cell) || isCorner(dims, cell) || walls.has(cellKey(cell))) fail('invalid')
  return cell
}

/** A playable maze (both doors, a path between them) and the length of its shortest path. */
function checkMaze(v: unknown, time: number, fallbackName: string): { maze: Maze; pathLength: number } {
  const m = record(v)
  const { w, h } = m
  const okSize = (n: unknown): n is number => isInt(n) && n % 2 === 1 && n >= MAZE_MIN_SIZE && n <= MAZE_MAX_SIZE
  if (typeof m.id !== 'string' || !okSize(w) || !okSize(h)) fail('invalid')
  const walls = checkKeys(m.walls, w, h)
  const wallSet = new Set(walls)
  const entry = checkDoor(m.entry, { w, h }, wallSet)
  const exit = checkDoor(m.exit, { w, h }, wallSet)
  if (cellKey(entry) === cellKey(exit)) fail('invalid')
  const doors = new Set([cellKey(entry), cellKey(exit)])
  const coins = checkKeys(m.coins, w, h)
  if (coins.some((k) => wallSet.has(k) || doors.has(k))) fail('invalid')
  if (!isColor(m.wallColor) || (m.floorColor !== undefined && !isColor(m.floorColor))) fail('invalid')
  const maze: Maze = {
    id: m.id, name: text(m.name, fallbackName), w, h, walls, entry, exit, coins, wallColor: m.wallColor,
    createdAt: time, updatedAt: time,
  }
  if (m.floorColor !== undefined) maze.floorColor = m.floorColor
  const path = solve(maze)
  if (!path) fail('invalid')
  return { maze, pathLength: path.length }
}

/** The best run, or null when it is faster than the maze allows (an impossible challenge). */
function checkBest(v: unknown, pathLength: number): MazeBest | null {
  const b = record(v)
  const { timeMs, stars } = b
  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs <= 0 || timeMs > SHARE_LIMITS.bestTimeMs) fail('invalid')
  if (stars !== 1 && stars !== 2 && stars !== 3) fail('invalid')
  return timeMs < pathLength * MIN_BEST_MS_PER_CELL ? null : { timeMs, stars }
}

function checkMazeSection(z: Loose, time: number, fallbackName: string): NonNullable<SharePackage['maze']> {
  const { maze, pathLength } = checkMaze(z.maze, time, fallbackName)
  const best = 'best' in z ? checkBest(z.best, pathLength) : null
  return best ? { maze, best } : { maze }
}

// ---------------------------------------------------------------------------------------------
// cities

/**
 * Roads and placements on the map; each placement fits where it is (inside the city, not on a road,
 * not overlapping an earlier one), sized by its blueprint's plate or the template's (`templateSize`).
 * Only the blueprints a placement uses are kept.
 */
function checkCity(c: Loose, time: number, fallbackName: string, opts: ShareImportOptions): NonNullable<SharePackage['city']> {
  const city = record(c.city)
  const { size } = city
  if (!isInt(size) || size < 1) fail('invalid')
  if (size > SHARE_LIMITS.citySize) fail('too_big')
  const blueprints = list(c.blueprints, SHARE_LIMITS.cityBlueprints).map((b) => checkBlueprint(b, time, fallbackName))
  const byId = new Map(blueprints.map((b) => [b.id, b]))
  if (byId.size !== blueprints.length) fail('invalid')
  const sizeOf = (source: string): Baseplate =>
    source.startsWith(TEMPLATE_PREFIX)
      ? (opts.templateSize?.(source.slice(TEMPLATE_PREFIX.length)) ?? PLACEHOLDER_PLATE)
      : (byId.get(source)?.baseplate ?? PLACEHOLDER_PLATE)
  const placed: CityState = { size, roads: checkKeys(city.roads, size, size), placements: [] }
  for (const v of list(city.placements, size * size)) {
    const p = record(v)
    const { id, source, cx, cz, rot } = p
    if (typeof id !== 'string' || typeof source !== 'string') fail('invalid')
    if (!TEMPLATE_SOURCE.test(source) && !byId.has(source)) fail('invalid')
    if (!isInt(cx) || !isInt(cz) || !isRot(rot)) fail('invalid')
    const placement: CityPlacement = { id, source, cx, cz, rot }
    if (canPlaceInCity(placed, placement, sizeOf) !== null) fail('invalid')
    placed.placements.push(placement)
  }
  const used = new Set(placed.placements.map((p) => p.source))
  return { city: placed, blueprints: blueprints.filter((b) => used.has(b.id)) }
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
      const id = freshId('shared', new Set(data.sharedTemplates.map((t) => t.id)))
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
    const id = freshId('maze', new Set(data.mazes.map((m) => m.id)))
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
        ...(plan.template ? { sharedTemplates: [...data.sharedTemplates, plan.template] } : {}),
      }
    case 'maze':
      return {
        ...data,
        mazes: [...data.mazes, plan.maze],
        ...(plan.challenge ? { mazeChallenges: { ...data.mazeChallenges, [plan.maze.id]: plan.challenge } } : {}),
      }
    case 'city':
      return { ...data, blueprints: [...data.blueprints, ...plan.blueprints], city: plan.city }
  }
}
