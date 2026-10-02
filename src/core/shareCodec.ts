import { Inflate, deflateSync } from 'fflate'
import { MAZE_MAX_SIZE, cellKey, parseCellKey, type Cell, type Maze } from './maze'
import type { MazeBest, ShareKind, SharePackage } from './share'
import { SHARE_LIMITS } from './shareImport'
import type { Blueprint, BlueprintKind, CityPlacement, FigStyle } from './types'

/**
 * The wire format of a share: compact JSON, deflate-raw compressed, base64url encoded.
 *
 * Compact JSON keeps links short enough for a QR code: one part-id table and one figure-style table
 * per package, bricks as tuples `[partIdx, x, y, z, r, c, figIdx?]`, mazes as one grid string, roads
 * as flat coordinate lists. Ids and timestamps are not sent (an import generates new ones).
 *
 * `unpackShare` turns compact JSON back into the canonical `SharePackage` shape WITHOUT validating
 * it: anything malformed comes out as a value validation rejects (`null`, a missing part...). It
 * never throws on junk, and it measures every list against `SHARE_LIMITS` before building anything
 * from it (a longer list means `too_big`), so a small payload cannot make it allocate much.
 */

/** Hard cap on the decompressed JSON: guards against zip bombs. */
export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024

export type CompactBrick = number[]

export interface CompactBlueprint {
  n: string
  k: BlueprintKind
  /** Tags, when there are any. */
  g?: string[]
  /** Baseplate `[w, d]` or `[w, d, c]`. */
  p: number[]
  b: CompactBrick[]
}

export interface CompactMaze {
  n: string
  w: number
  h: number
  /** Row by row (z, then x): `#` wall, `.` floor, `o` floor with a coin. */
  g: string
  /** Entry `[cx, cz]`, absent when the maze has none. */
  e?: number[]
  /** Exit `[cx, cz]`, absent when the maze has none. */
  x?: number[]
  c: number
  f?: number
}

export interface CompactPackage {
  a: string
  v: number
  k: ShareKind
  n: string
  t: number
  /** Part ids, indexed by brick tuples. */
  P?: string[]
  /** Figure styles, indexed by brick tuples. */
  F?: FigStyle[]
  /** Model; steps as run lengths `s` when they take the bricks in order, else in full as `S`. */
  m?: { b: CompactBlueprint; s?: number[]; S?: number[][] }
  /** Maze and best run `[timeMs, stars]`. */
  z?: { m: CompactMaze; b?: number[] }
  /**
   * City: size, roads as flat `[cx, cz, ...]`, placements `[blueprintIdx | 'tpl:<id>', cx, cz, rot]`,
   * plus a fifth item, the size multiplier, only for a scaled (x2..x10) placement. Optional, sent
   * only when there are any (older links have neither): terrain `T` as three flat cell lists
   * `[water, pavement, sand]`, and rails `R` as a flat cell list.
   */
  c?: { s: number; r: number[]; p: Array<Array<number | string>>; b: CompactBlueprint[]; T?: number[][]; R?: number[] }
}

// ---------------------------------------------------------------------------------------------
// base64url

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const LOOKUP = new Map(Array.from(ALPHABET, (ch, i) => [ch, i]))

/** Base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6))
    for (let j = 0; j < chars; j++) out += ALPHABET[(n >> (18 - 6 * j)) & 63]
  }
  return out
}

/** Bytes of a base64url string (no padding); null for any other character or an impossible length. */
export function fromBase64Url(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null
  const out = new Uint8Array(Math.floor((s.length * 6) / 8))
  let bits = 0
  let acc = 0
  let o = 0
  for (const ch of s) {
    const v = LOOKUP.get(ch)
    if (v === undefined) return null
    acc = ((acc << 6) | v) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 0xff
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// compression

/** base64url(deflate-raw(utf-8 text)). */
export function compress(text: string): string {
  return toBase64Url(deflateSync(new TextEncoder().encode(text), { level: 9 }))
}

export type DecompressResult = { text: string } | { error: 'corrupt' | 'too_big' }

/** Input is fed in small slices so a bomb is stopped after at most ~1 MB of extra output. */
const INFLATE_SLICE = 1024

/** Inverse of `compress`, refusing to produce more than `maxBytes` of text. */
export function decompress(payload: string, maxBytes = MAX_DECOMPRESSED_BYTES): DecompressResult {
  const bytes = fromBase64Url(payload)
  if (!bytes || bytes.length === 0) return { error: 'corrupt' }
  const chunks: Uint8Array[] = []
  let total = 0
  let tooBig = false
  try {
    const inflater = new Inflate((chunk) => {
      total += chunk.length
      if (total > maxBytes) tooBig = true
      else chunks.push(chunk.slice())
    })
    for (let i = 0; i < bytes.length && !tooBig; i += INFLATE_SLICE) {
      const end = Math.min(bytes.length, i + INFLATE_SLICE)
      inflater.push(bytes.subarray(i, end), end === bytes.length)
    }
  } catch {
    return { error: tooBig ? 'too_big' : 'corrupt' }
  }
  if (tooBig) return { error: 'too_big' }
  const all = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.length
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(all) }
  } catch {
    return { error: 'corrupt' }
  }
}

// ---------------------------------------------------------------------------------------------
// pack

/** Index of each distinct value, in order of first use. */
class Table<T> {
  readonly items: T[] = []
  private readonly index = new Map<string, number>()
  constructor(private readonly keyOf: (item: T) => string) {}
  of(item: T): number {
    const key = this.keyOf(item)
    let i = this.index.get(key)
    if (i === undefined) {
      i = this.items.length
      this.items.push(item)
      this.index.set(key, i)
    }
    return i
  }
}

function packBlueprint(bp: Blueprint, parts: Table<string>, figs: Table<FigStyle>): CompactBlueprint {
  const { w, d, c } = bp.baseplate
  const out: CompactBlueprint = {
    n: bp.name,
    k: bp.kind,
    p: c === undefined ? [w, d] : [w, d, c],
    b: bp.bricks.map((b) => {
      const t = [parts.of(b.p), b.x, b.y, b.z, b.r, b.c]
      if (b.fig) t.push(figs.of(b.fig))
      return t
    }),
  }
  if (bp.tags.length > 0) out.g = [...bp.tags]
  return out
}

/** Step sizes when the steps take bricks 0..n-1 in order, else null. */
function runLengths(steps: number[][], brickCount: number): number[] | null {
  let next = 0
  for (const step of steps) {
    if (step.length === 0) return null
    for (const i of step) if (i !== next++) return null
  }
  return next === brickCount ? steps.map((s) => s.length) : null
}

function packMaze(maze: Maze): CompactMaze {
  const walls = new Set(maze.walls)
  const coins = new Set(maze.coins)
  let g = ''
  for (let cz = 0; cz < maze.h; cz++) {
    for (let cx = 0; cx < maze.w; cx++) {
      const k = cellKey({ cx, cz })
      g += walls.has(k) ? '#' : coins.has(k) ? 'o' : '.'
    }
  }
  const out: CompactMaze = { n: maze.name, w: maze.w, h: maze.h, g, c: maze.wallColor }
  if (maze.entry) out.e = [maze.entry.cx, maze.entry.cz]
  if (maze.exit) out.x = [maze.exit.cx, maze.exit.cz]
  if (maze.floorColor !== undefined) out.f = maze.floorColor
  return out
}

export function packShare(pkg: SharePackage): CompactPackage {
  const parts = new Table<string>((p) => p)
  const figs = new Table<FigStyle>((f) => JSON.stringify(f))
  const out: CompactPackage = { a: pkg.app, v: pkg.v, k: pkg.kind, n: pkg.name, t: pkg.createdAt }
  if (pkg.model) {
    const { blueprint, steps } = pkg.model
    const m: NonNullable<CompactPackage['m']> = { b: packBlueprint(blueprint, parts, figs) }
    if (steps) {
      const runs = runLengths(steps, blueprint.bricks.length)
      if (runs) m.s = runs
      else m.S = steps.map((s) => [...s])
    }
    out.m = m
  }
  if (pkg.maze) {
    const { maze, best } = pkg.maze
    out.z = best ? { m: packMaze(maze), b: [best.timeMs, best.stars] } : { m: packMaze(maze) }
  }
  if (pkg.city) {
    const { city, blueprints } = pkg.city
    const indexOf = new Map(blueprints.map((b, i) => [b.id, i]))
    const flat = (keys: string[]) =>
      keys.flatMap((k) => {
        const { cx, cz } = parseCellKey(k)
        return [cx, cz]
      })
    out.c = {
      s: city.size,
      r: flat(city.roads),
      p: city.placements.map((p) => {
        const tuple = [indexOf.get(p.source) ?? p.source, p.cx, p.cz, p.rot]
        return p.s === undefined || p.s === 1 ? tuple : [...tuple, p.s]
      }),
      b: blueprints.map((b) => packBlueprint(b, parts, figs)),
    }
    const { terrain, rails } = city
    if (terrain && terrain.water.length + terrain.pavement.length + terrain.sand.length > 0) {
      out.c.T = [flat(terrain.water), flat(terrain.pavement), flat(terrain.sand)]
    }
    if (rails && rails.length > 0) out.c.R = flat(rails)
  }
  if (parts.items.length > 0) out.P = parts.items
  if (figs.items.length > 0) out.F = figs.items
  return out
}

// ---------------------------------------------------------------------------------------------
// unpack (structure only; see validatePackage in core/shareImport for the checks)

type Loose = Record<string, unknown>

const isLoose = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)
const isIndex = (v: unknown, length: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length

/** Thrown when a list is longer than any valid share allows; caught in `unpackShare`. */
class TooBig {}

/** `v` itself when it is not an array; an array only when it is at most `max` long. */
function capped(v: unknown, max: number): unknown {
  if (Array.isArray(v) && v.length > max) throw new TooBig()
  return v
}

const MAX_CITY_CELLS = SHARE_LIMITS.citySize * SHARE_LIMITS.citySize

function unpackBrick(t: unknown, i: number, parts: unknown[], figs: unknown[]): unknown {
  if (!Array.isArray(t) || t.length < 6 || t.length > 7) return null
  const brick: Loose = {
    id: `b${i}`,
    p: isIndex(t[0], parts.length) ? parts[t[0]] : undefined,
    x: t[1], y: t[2], z: t[3], r: t[4], c: t[5],
  }
  if (t.length === 7) brick.fig = isIndex(t[6], figs.length) ? figs[t[6]] : null
  return brick
}

function unpackBlueprint(raw: unknown, i: number, time: unknown, parts: unknown[], figs: unknown[]): unknown {
  if (!isLoose(raw)) return null
  const p = Array.isArray(raw.p) ? raw.p : []
  const baseplate: Loose = { w: p[0], d: p[1] }
  if (p.length > 2) baseplate.c = p[2]
  const bricks = capped(raw.b, SHARE_LIMITS.bricks)
  return {
    id: `bp${i}`,
    name: raw.n,
    kind: raw.k,
    tags: capped(raw.g, SHARE_LIMITS.tagList) ?? [],
    baseplate,
    bricks: Array.isArray(bricks) ? bricks.map((t, j) => unpackBrick(t, j, parts, figs)) : null,
    createdAt: time,
    updatedAt: time,
  } satisfies Partial<Record<keyof Blueprint, unknown>>
}

/** Steps from run lengths, or null unless they are whole positive numbers adding up to the bricks. */
function stepsFromRuns(runs: unknown, brickCount: number): number[][] | null {
  if (!Array.isArray(capped(runs, SHARE_LIMITS.bricks))) return null
  let sum = 0
  for (const n of runs as unknown[]) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null
    sum += n
    if (sum > brickCount) return null
  }
  if (sum !== brickCount) return null
  let next = 0
  return (runs as number[]).map((n) => Array.from({ length: n }, () => next++))
}

/** Full steps as sent, once neither the list nor any step is longer than the brick limit. */
function cappedSteps(steps: unknown): unknown {
  const list = capped(steps, SHARE_LIMITS.bricks)
  if (Array.isArray(list)) for (const s of list) capped(s, SHARE_LIMITS.bricks)
  return list
}

function unpackCell(v: unknown): Cell | null | undefined {
  if (v === undefined) return null
  return Array.isArray(v) && v.length === 2 ? { cx: v[0], cz: v[1] } : undefined
}

const isMazeSize = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= MAZE_MAX_SIZE

function unpackMaze(raw: unknown, time: unknown): unknown {
  if (!isLoose(raw)) return null
  const { w, h, g } = raw
  let walls: string[] | null = null
  let coins: string[] | null = null
  // The size is checked before the grid is walked: the grid is at most 21 x 21 cells.
  if (isMazeSize(w) && isMazeSize(h) && typeof g === 'string' && g.length === w * h && /^[#.o]*$/.test(g)) {
    walls = []
    coins = []
    for (let i = 0; i < g.length; i++) {
      const key = cellKey({ cx: i % w, cz: Math.floor(i / w) })
      if (g[i] === '#') walls.push(key)
      else if (g[i] === 'o') coins.push(key)
    }
  }
  const maze: Loose = {
    id: 'maze0', name: raw.n, w, h, walls, entry: unpackCell(raw.e), exit: unpackCell(raw.x), coins,
    wallColor: raw.c, createdAt: time, updatedAt: time,
  }
  if (raw.f !== undefined) maze.floorColor = raw.f
  return maze
}

function unpackPlacement(raw: unknown, i: number): unknown {
  if (!Array.isArray(raw) || (raw.length !== 4 && raw.length !== 5)) return null
  const [src, cx, cz, rot, s] = raw
  // `s` is checked with everything else by the import (absent = x1).
  return {
    id: `pl${i}`,
    source: typeof src === 'number' ? `bp${src}` : src,
    cx, cz, rot,
    s: raw.length === 5 ? s : undefined,
  } satisfies Record<keyof CityPlacement, unknown>
}

function unpackRoads(flat: unknown): unknown {
  capped(flat, 2 * MAX_CITY_CELLS)
  if (!Array.isArray(flat) || flat.length % 2 !== 0) return null
  const roads: unknown[] = []
  for (let i = 0; i < flat.length; i += 2) {
    const [cx, cz] = [flat[i], flat[i + 1]]
    roads.push(typeof cx === 'number' && typeof cz === 'number' ? cellKey({ cx, cz }) : null)
  }
  return roads
}

/** Terrain `[water, pavement, sand]` flat lists back as key lists (null for anything else). */
function unpackTerrain(t: unknown): unknown {
  capped(t, 3)
  if (!Array.isArray(t) || t.length !== 3) return null
  const [water, pavement, sand] = t.map(unpackRoads)
  return { water, pavement, sand }
}

function unpackCity(c: unknown, time: unknown, parts: unknown[], figs: unknown[]): unknown {
  if (!isLoose(c)) return null
  const placements = capped(c.p, MAX_CITY_CELLS)
  const blueprints = capped(c.b, SHARE_LIMITS.cityBlueprints)
  const city: Loose = {
    size: c.s,
    roads: unpackRoads(c.r),
    placements: Array.isArray(placements) ? placements.map(unpackPlacement) : null,
  }
  if (c.T !== undefined) city.terrain = unpackTerrain(c.T)
  if (c.R !== undefined) city.rails = unpackRoads(c.R)
  return {
    city,
    blueprints: Array.isArray(blueprints) ? blueprints.map((b, i) => unpackBlueprint(b, i, time, parts, figs)) : null,
  }
}

function unpackModel(m: unknown, time: unknown, parts: unknown[], figs: unknown[]): unknown {
  if (!isLoose(m)) return null
  const blueprint = unpackBlueprint(m.b, 0, time, parts, figs)
  const model: Loose = { blueprint }
  const count = isLoose(blueprint) && Array.isArray(blueprint.bricks) ? blueprint.bricks.length : 0
  if (m.s !== undefined) model.steps = stepsFromRuns(m.s, count)
  else if (m.S !== undefined) model.steps = cappedSteps(m.S)
  return model
}

function unpackMazeSection(z: unknown, time: unknown): unknown {
  if (!isLoose(z)) return null
  const maze: Loose = { maze: unpackMaze(z.m, time) }
  if (z.b !== undefined) maze.best = Array.isArray(z.b) ? ({ timeMs: z.b[0], stars: z.b[1] } satisfies Record<keyof MazeBest, unknown>) : null
  return maze
}

/**
 * Compact JSON back in the canonical package shape (unvalidated), or `too_big` as soon as a list is
 * longer than any valid share allows: every list is measured before anything is built from it.
 */
export function unpackShare(raw: unknown): { value: unknown } | { error: 'too_big' } {
  try {
    if (!isLoose(raw)) return { value: raw }
    const parts = capped(raw.P, SHARE_LIMITS.partTable)
    const figs = capped(raw.F, SHARE_LIMITS.bricks)
    const P = Array.isArray(parts) ? parts : []
    const F = Array.isArray(figs) ? figs : []
    const time = raw.t
    const out: Loose = { app: raw.a, v: raw.v, kind: raw.k, name: raw.n, createdAt: time }
    if (raw.m !== undefined) out.model = unpackModel(raw.m, time, P, F)
    if (raw.z !== undefined) out.maze = unpackMazeSection(raw.z, time)
    if (raw.c !== undefined) out.city = unpackCity(raw.c, time, P, F)
    return { value: out }
  } catch (e) {
    if (e instanceof TooBig) return { error: 'too_big' }
    throw e
  }
}
