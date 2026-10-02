import { PLATE_MAX } from './baseplate'
import { CELL, MAX_SCALE, MIN_SCALE, canPlaceInCity, placementCells, sourceSize, type SourceSize } from './city'
import { COLORS } from './colors'
import { DEFAULT_FIG, FIG_ACCESSORIES, FIG_FACES, FIG_HATS, FIG_PRESETS, FIG_PRINTS, MINIFIG_PART, figPreset, parseFig } from './figures'
import { MAZE_MAX_SIZE, MAZE_MIN_SIZE, cellKey, isBorder, isCorner, solve, type Cell, type Maze } from './maze'
import { MAX_BRICKS, MAX_HEIGHT_PLATES, canPlace } from './model'
import { Occupancy } from './occupancy'
import { PARTS, PART_BY_ID } from './parts/catalog'
import { invalidCrossings } from './rails'
import { roadKey } from './roads'
import { footprint, rotEquivalent } from './rotation'
import type { SharePackage } from './share'
import { MAX_DECOMPRESSED_BYTES } from './shareCodec'
import { SHARE_LIMITS, sanitizeName, validatePackage, type ShareImportOptions } from './shareImport'
import { autoSteps, validateTemplate } from './template'
import type { Baseplate, Blueprint, BlueprintKind, Brick, CityPlacement, CityState, CityTerrain, FigStyle, Rot } from './types'

/**
 * The authoring format: a human-readable JSON description of a model, city or maze that a person
 * or an AI agent writes by hand (e.g. from a photo of a LEGO build). `authoringToPackage` checks it
 * with the game's own rules (canPlace, the share import validation, the limits), explains every
 * problem per brick, optionally applies safe repairs, and turns it into a `SharePackage` that the
 * game imports like a share link. Used by `npm run bt:pack` and by the 📥 import (pasted text or a
 * picked `.json` file carrying the `format` marker).
 *
 * Model:  { format, version, kind: 'model', name, blueprintKind, baseplate {w, d, c?}, withSteps?,
 *           stepSize?, steps?, tags?, bricks: [{ p, x, y, z, r?, c, fig? }] }
 * City:   { format, version, kind: 'city', name, size, roads?, rails?, terrain?, blueprints?,
 *           placements: [{ source, cx, cz, rot?, s? }] }
 * Maze:   { format, version, kind: 'maze', name, grid: string[], wallColor?, floorColor? }
 */

export const AUTHORING_FORMAT = 'bricktown-authoring'
export const AUTHORING_VERSION = 1
/** Authoring text longer than this is refused before parsing (the share decompression cap). */
export const MAX_AUTHORING_CHARS = MAX_DECOMPRESSED_BYTES
/** Bricks per build step at most (Guided mode shows a step's bricks together). */
export const MAX_STEP_SIZE = 6
/** How far (plates) `fix` may move a brick up or down to find a free, supported spot. */
export const FIX_MAX_SHIFT = 6
/** How many studs a brick may stick out of the baseplate for `fix` to nudge it back inside. */
export const FIX_MAX_NUDGE = 3

export type IssueCode =
  | 'json' | 'format' | 'version' | 'kind' | 'field' | 'too_big'
  | 'baseplate' | 'part_unknown' | 'color_unknown' | 'coord' | 'rot' | 'fig' | 'fig_not_minifig'
  | 'out_of_bounds' | 'too_high' | 'limit' | 'collision' | 'unsupported' | 'steps'
  | 'city_size' | 'cell' | 'terrain' | 'crossing' | 'blueprint' | 'source_unknown' | 'template_unknown' | 'scale' | 'placement'
  | 'maze' | 'rejected'

export interface Pos { x: number; y: number; z: number }

export interface AuthoringIssue {
  code: IssueCode
  /** Where in the input: `bricks[12]`, `blueprints[0] "house" bricks[3]`, `placements[2]`, `roads`... */
  where: string
  /** English, detailed, with a hint on how to fix it. */
  message: string
  /** For brick problems: the brick's index in its `bricks` array, part id and position. */
  brick?: number
  part?: string
  at?: Pos
  /** The other brick involved (a collision). */
  other?: number
  /** The city blueprint the brick belongs to. */
  blueprint?: string
}

export interface AuthoringFix {
  where: string
  /** The city blueprint the brick belongs to (absent for a model). */
  blueprint?: string
  brick: number
  part: string
  from: Pos
  /** Absent: the brick was dropped. */
  to?: Pos
  message: string
}

export interface AuthoringOptions extends ShareImportOptions {
  /** Apply safe repairs: drop colliding bricks, move a brick up/down onto the nearest support when unambiguous. */
  fix?: boolean
  /** Timestamp of the package (default Date.now()). */
  now?: number
  /** Built-in template ids, for did-you-mean suggestions on `tpl:` sources. */
  templateIds?: readonly string[]
}

export type AuthoringResult =
  | { ok: true; pkg: SharePackage; warnings: AuthoringIssue[]; fixes: AuthoringFix[] }
  | { ok: false; errors: AuthoringIssue[]; warnings: AuthoringIssue[]; fixes: AuthoringFix[] }

type Loose = Record<string, unknown>
const isRecord = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const show = (v: unknown): string => {
  const s = JSON.stringify(v)
  return s === undefined ? String(v) : s.length > 40 ? `${s.slice(0, 37)}...` : s
}

/** True for a parsed value that carries the authoring marker. */
export const isAuthoring = (v: unknown): boolean => isRecord(v) && v.format === AUTHORING_FORMAT

/** Cheap check before parsing: pasted text or a file that mentions the authoring marker. */
export const looksLikeAuthoring = (text: string): boolean => text.includes(AUTHORING_FORMAT) && text.includes('{')

class Report {
  errors: AuthoringIssue[] = []
  warnings: AuthoringIssue[] = []
  fixes: AuthoringFix[] = []
  error(issue: AuthoringIssue): void {
    this.errors.push(issue)
  }
  warn(issue: AuthoringIssue): void {
    this.warnings.push(issue)
  }
}

// ---------------------------------------------------------------------------------------------
// suggestions

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]
}

/** Up to `n` of `options` closest to `wanted` (case-insensitive edit distance, then prefix/substring matches). */
export function closest(wanted: string, options: readonly string[], n = 3): string[] {
  const w = wanted.toLowerCase().trim()
  const limit = Math.max(2, Math.ceil(w.length / 3))
  return options
    .map((o) => {
      const l = o.toLowerCase()
      const contains = l.includes(w) || (w.length >= 4 && w.includes(l))
      return { o, d: contains ? Math.min(1, editDistance(w, l)) : editDistance(w, l) }
    })
    .filter((s) => s.d <= limit)
    .sort((a, b) => a.d - b.d || a.o.localeCompare(b.o))
    .slice(0, n)
    .map((s) => s.o)
}

/** Did-you-mean text for an unknown part id. */
export function suggestParts(id: string): string {
  const ids = PARTS.map((p) => p.id)
  const hints: string[] = []
  const lower = id.toLowerCase().trim()
  if (PART_BY_ID[lower]) hints.push(`"${lower}" (ids are lower case)`)
  // brick_4x2 -> brick_2x4 turned a quarter (r=1).
  const swapped = lower.replace(/(\d+)x(\d+)/, (_, a: string, b: string) => `${b}x${a}`)
  if (swapped !== lower && PART_BY_ID[swapped]) hints.push(`"${swapped}" with r=1 (the catalog lists each size once; rotate it)`)
  for (const c of closest(lower, ids)) if (!hints.some((h) => h.startsWith(`"${c}"`))) hints.push(`"${c}"`)
  return hints.length ? ` Did you mean ${hints.join(', ')}?` : ' See reference/parts.md for every part id.'
}

const COLOR_ALIASES: Record<string, number> = { grey: 7, gray: 7, 'light grey': 7, 'dark grey': 8, beige: 10, clear: 15, transparent: 15, 'trans clear': 15 }

/** Did-you-mean text for a colour given as a name or an out-of-range number. */
export function suggestColor(v: unknown): string {
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim()
    const byName = COLORS.find((c) => c.name.en.toLowerCase() === s || c.name.vi.toLowerCase() === s) ?? COLORS[COLOR_ALIASES[s] ?? -1]
    if (byName) return ` Colours are number ids: use ${byName.id} (${byName.name.en}).`
    if (/^#?[0-9a-f]{6}$/.test(s)) {
      const hex = s.replace('#', '')
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
      let best = COLORS[0]
      let bestD = Infinity
      for (const c of COLORS) {
        const o = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16))
        const d = o.reduce((sum, x, i) => sum + (x - rgb[i]) ** 2, 0)
        if (d < bestD) {
          best = c
          bestD = d
        }
      }
      return ` Colours are number ids: the closest to ${v} is ${best.id} (${best.name.en}, ${best.hex}).`
    }
    const names = closest(s, COLORS.map((c) => c.name.en))
    const ids = names.map((n) => COLORS.find((c) => c.name.en === n)!).map((c) => `${c.id} (${c.name.en})`)
    return ` Colours are number ids 0..${COLORS.length - 1}${ids.length ? `: did you mean ${ids.join(', ')}?` : ' (see reference/colors.md).'}`
  }
  return ` Colours are integer ids 0..${COLORS.length - 1} (see reference/colors.md).`
}

const isColorId = (v: unknown): v is number => isInt(v) && v >= 0 && v < COLORS.length
const posOf = (b: Pos): Pos => ({ x: b.x, y: b.y, z: b.z })
const label = (i: number, b: Pick<Brick, 'p' | 'x' | 'y' | 'z'>) => `brick #${i} (${b.p} at x=${b.x} y=${b.y} z=${b.z})`

// ---------------------------------------------------------------------------------------------
// bricks

const BRICK_KEYS = new Set(['p', 'x', 'y', 'z', 'r', 'c', 'fig', 'id', 'note'])
const BRICK_ALIASES: Record<string, string> = { part: 'p', partId: 'p', id_part: 'p', color: 'c', colour: 'c', rot: 'r', rotation: 'r' }

function parseFigField(v: unknown, where: string, i: number, p: string, rep: Report): FigStyle | null {
  if (typeof v === 'string') {
    if (FIG_PRESETS.some((f) => f.id === v)) return figPreset(v)
    rep.error({
      code: 'fig', where, brick: i, part: p,
      message: `brick #${i}: unknown figure preset "${v}". Presets: ${FIG_PRESETS.map((f) => f.id).join(', ')}; or give a style object (see reference/figures.md).`,
    })
    return null
  }
  const fig = parseFig(v)
  if (fig && isRecord(v) && Object.keys(fig).length === Object.keys(v).length) return fig
  const o = isRecord(v) ? v : {}
  const bad: string[] = []
  const color = (k: string, need: boolean) => {
    if (o[k] === undefined ? need : !isColorId(o[k])) bad.push(`${k} must be a colour id 0..${COLORS.length - 1}`)
  }
  const pick = (k: string, list: readonly string[], need: boolean) => {
    if (o[k] === undefined ? need : !list.includes(o[k] as string)) bad.push(`${k} must be one of ${list.join('|')}`)
  }
  color('torso', true)
  color('legs', true)
  color('arms', false)
  color('hatColor', false)
  pick('face', FIG_FACES, true)
  pick('hat', FIG_HATS, true)
  pick('print', FIG_PRINTS, true)
  pick('accessory', FIG_ACCESSORIES, false)
  const known = new Set(['torso', 'legs', 'arms', 'face', 'hat', 'hatColor', 'print', 'accessory'])
  for (const k of Object.keys(o)) if (!known.has(k)) bad.push(`unknown field "${k}"`)
  rep.error({
    code: 'fig', where, brick: i, part: p,
    message: `brick #${i}: invalid figure style ${show(v)}: ${bad.join('; ') || 'not an object'}. Or use a preset name such as "chef".`,
  })
  return null
}

/** A brick from its authoring form (fields checked), or null with errors reported. */
function parseBrick(v: unknown, i: number, where: string, rep: Report): Brick | null {
  const at = `${where}[${i}]`
  if (!isRecord(v)) {
    rep.error({ code: 'field', where: at, brick: i, message: `brick #${i} must be an object like {"p":"brick_2x4","x":0,"y":0,"z":0,"r":0,"c":2}` })
    return null
  }
  let ok = true
  for (const [alias, key] of Object.entries(BRICK_ALIASES)) {
    if (alias in v && !(key in v)) {
      rep.error({ code: 'field', where: at, brick: i, message: `brick #${i}: use "${key}" instead of "${alias}"` })
      ok = false
    }
  }
  for (const k of Object.keys(v)) {
    if (!BRICK_KEYS.has(k) && !(k in BRICK_ALIASES)) rep.warn({ code: 'field', where: at, brick: i, message: `brick #${i}: field "${k}" is ignored` })
  }
  if (!ok) return null
  const { p, x, y, z } = v
  if (typeof p !== 'string' || !Object.hasOwn(PART_BY_ID, p)) {
    rep.error({
      code: 'part_unknown', where: at, brick: i, part: typeof p === 'string' ? p : undefined,
      message: `brick #${i}: unknown part id ${show(p)}.${typeof p === 'string' ? suggestParts(p) : ' "p" must be a part id string.'}`,
    })
    ok = false
  }
  const part = typeof p === 'string' ? p : '?'
  for (const [k, val] of [['x', x], ['y', y], ['z', z]] as const) {
    if (!isInt(val)) {
      rep.error({
        code: 'coord', where: at, brick: i, part,
        message: `brick #${i} (${part}): ${k} must be an integer${k === 'y' ? ' (plates: a brick is 3 plates tall)' : ' (studs)'}, got ${show(val)}`,
      })
      ok = false
    }
  }
  const r = v.r === undefined ? 0 : v.r
  if (r !== 0 && r !== 1 && r !== 2 && r !== 3) {
    rep.error({ code: 'rot', where: at, brick: i, part, message: `brick #${i} (${part}): r must be 0, 1, 2 or 3 (quarter turns), got ${show(v.r)}` })
    ok = false
  }
  let fig: FigStyle | undefined
  if (v.fig !== undefined) {
    if (p !== MINIFIG_PART) {
      rep.error({ code: 'fig_not_minifig', where: at, brick: i, part, message: `brick #${i} (${part}): "fig" is only for the "${MINIFIG_PART}" part` })
      ok = false
    } else {
      fig = parseFigField(v.fig, at, i, part, rep) ?? undefined
      if (!fig) ok = false
    }
  }
  let c: number
  if (p === MINIFIG_PART) {
    // A figure's brick colour is its torso colour (the game keeps them equal).
    c = (fig ?? DEFAULT_FIG).torso
    if (v.c !== undefined && v.c !== c) rep.warn({ code: 'field', where: at, brick: i, part, message: `brick #${i}: a minifig's c is its torso colour (${c}); c=${show(v.c)} ignored` })
  } else if (isColorId(v.c)) {
    c = v.c
  } else {
    rep.error({
      code: 'color_unknown', where: at, brick: i, part,
      message: `brick #${i} (${part}): ${v.c === undefined ? 'missing colour "c".' : `unknown colour ${show(v.c)}.`}${suggestColor(v.c)}`,
    })
    ok = false
    c = 0
  }
  if (!ok) return null
  const brick: Brick = { id: `#${i}`, p: p as string, x: x as number, y: y as number, z: z as number, r: r as Rot, c }
  if (fig) brick.fig = fig
  return brick
}

const indexOf = (b: Brick) => Number(b.id.slice(1))

function outOfBoundsMessage(i: number, b: Brick, plate: Baseplate): { code: IssueCode; message: string } {
  const part = PART_BY_ID[b.p]
  const { fx, fz } = footprint(part, b.r)
  if (b.y < 0) return { code: 'out_of_bounds', message: `${label(i, b)} is below the baseplate: y must be 0 or more` }
  if (b.y + part.h > MAX_HEIGHT_PLATES) {
    return { code: 'too_high', message: `${label(i, b)} is too high: it reaches plate ${b.y + part.h}, the limit is ${MAX_HEIGHT_PLATES} plates (48 bricks)` }
  }
  const sides: string[] = []
  if (b.x < 0) sides.push(`x=${b.x} is left of the plate (x starts at 0)`)
  if (b.z < 0) sides.push(`z=${b.z} is behind the plate (z starts at 0)`)
  if (b.x + fx > plate.w) sides.push(`it covers x ${b.x}..${b.x + fx - 1} but the plate is ${plate.w} studs wide (x 0..${plate.w - 1}), so x must be at most ${plate.w - fx}`)
  if (b.z + fz > plate.d) sides.push(`it covers z ${b.z}..${b.z + fz - 1} but the plate is ${plate.d} studs deep (z 0..${plate.d - 1}), so z must be at most ${plate.d - fz}`)
  const turned = part.w !== part.d ? ` Footprint at r=${b.r} is ${fx}x${fz} (odd r swaps the part's ${part.w}x${part.d}).` : ''
  return { code: 'out_of_bounds', message: `${label(i, b)} is out of the ${plate.w}x${plate.d} baseplate: ${sides.join('; ')}.${turned}` }
}

/** The occupied voxel of `occ` that `b` overlaps first, as the other brick's index. */
function collidingWith(occ: Occupancy, b: Brick): number | null {
  const part = PART_BY_ID[b.p]
  const { fx, fz } = footprint(part, b.r)
  for (let dy = 0; dy < part.h; dy++) {
    for (let dx = 0; dx < fx; dx++) {
      for (let dz = 0; dz < fz; dz++) {
        const id = occ.get(b.x + dx, b.y + dy, b.z + dz)
        if (id !== undefined) return Number(id.slice(1))
      }
    }
  }
  return null
}

/** The brick right under `b`'s footprint (in the plate level below it), as its index. */
function brickUnder(occ: Occupancy, b: Brick): number | null {
  if (b.y === 0) return null
  const { fx, fz } = footprint(PART_BY_ID[b.p], b.r)
  for (let dx = 0; dx < fx; dx++) {
    for (let dz = 0; dz < fz; dz++) {
      const id = occ.get(b.x + dx, b.y - 1, b.z + dz)
      if (id !== undefined && id !== b.id) return Number(id.slice(1))
    }
  }
  return null
}

/** The highest plate level a brick top reaches under `b`'s footprint, below `b` (null: nothing there). */
function topBelow(occ: Occupancy, b: Brick): number | null {
  const { fx, fz } = footprint(PART_BY_ID[b.p], b.r)
  for (let y = b.y - 1; y >= 0; y--) {
    for (let dx = 0; dx < fx; dx++) for (let dz = 0; dz < fz; dz++) if (occ.get(b.x + dx, y, b.z + dz) !== undefined) return y + 1
  }
  return null
}

/**
 * `b` shifted along x and / or z so that it lies inside the plate, when it sticks out by at most
 * FIX_MAX_NUDGE studs on each axis it sticks out on (and the height is fine); null otherwise.
 */
function nudgeInside(b: Brick, plate: Baseplate): Brick | null {
  const part = PART_BY_ID[b.p]
  const { fx, fz } = footprint(part, b.r)
  if (b.y < 0 || b.y + part.h > MAX_HEIGHT_PLATES) return null
  const pull = (at: number, size: number, limit: number) => (at < 0 ? -at : at + size > limit ? limit - size - at : 0)
  const dx = pull(b.x, fx, plate.w)
  const dz = pull(b.z, fz, plate.d)
  if (dx === 0 && dz === 0) return null
  if (Math.abs(dx) > FIX_MAX_NUDGE || Math.abs(dz) > FIX_MAX_NUDGE) return null
  const moved = { ...b, x: b.x + dx, z: b.z + dz }
  return moved.x >= 0 && moved.z >= 0 && moved.x + fx <= plate.w && moved.z + fz <= plate.d ? moved : null
}

/** The free, supported level nearest to `b.y` within FIX_MAX_SHIFT plates; null when there is none or two tie. */
function nearestLevel(placed: Brick[], occ: Occupancy, b: Brick, plate: Baseplate): number | null {
  for (let d = 1; d <= FIX_MAX_SHIFT; d++) {
    const fits = [b.y - d, b.y + d].filter((y) => y >= 0 && canPlace(placed, { ...b, y }, plate, undefined, occ) === null)
    if (fits.length === 1) return fits[0]
    if (fits.length === 2) return null // as near up as down: ambiguous
  }
  return null
}

const sameBrick = (a: Brick, b: Brick) =>
  a.p === b.p && a.x === b.x && a.y === b.y && a.z === b.z && rotEquivalent(PART_BY_ID[a.p], a.r, b.r)

/**
 * The bricks of one model checked like the game builds them: bottom-up, each brick must fit the
 * plate and the height limit, not overlap a brick placed before it and rest on the plate or on a
 * brick (the game's `canPlace`). With `fix`, colliding bricks are dropped (or moved up/down onto
 * the nearest free support when that is unambiguous), floating ones moved onto the nearest
 * support when unambiguous and bricks sticking out of the plate by a few studs nudged inside; every change is reported. Returns the kept bricks, in input order.
 */
function checkPlacement(bricks: Brick[], plate: Baseplate, where: string, fix: boolean, rep: Report, bp?: string): Brick[] {
  const errorsBefore = rep.errors.length
  if (bricks.length > MAX_BRICKS) {
    rep.error({ code: 'limit', where, message: `${bricks.length} bricks: the game allows at most ${MAX_BRICKS} per model. Use bigger bricks or hollow interiors.`, blueprint: bp })
    return []
  }
  const all = Occupancy.from(bricks) // every brick, for hints about what lies underneath
  const order = [...bricks].sort((a, b) => a.y - b.y || indexOf(a) - indexOf(b))
  const placed: Brick[] = []
  const occ = new Occupancy()
  const brickWhere = (i: number) => `${where}[${i}]`
  const place = (b: Brick) => {
    placed.push(b)
    occ.add(b)
  }
  const moveTo = (b: Brick, i: number, y: number, why: string): Brick => {
    const moved = { ...b, y }
    rep.fixes.push({ blueprint: bp, where: brickWhere(i), brick: i, part: b.p, from: posOf(b), to: posOf(moved), message: `${label(i, b)} ${why}: moved to y=${y}` })
    return moved
  }
  for (const b of order) {
    const i = indexOf(b)
    const base = { where: brickWhere(i), brick: i, part: b.p, at: posOf(b), blueprint: bp }
    const error = canPlace(placed, b, plate, undefined, occ)
    if (error === 'out_of_bounds') {
      if (fix) {
        const moved = nudgeInside(b, plate)
        if (moved && canPlace(placed, moved, plate, undefined, occ) === null) {
          place(moved)
          rep.fixes.push({
            blueprint: bp, where: brickWhere(i), brick: i, part: b.p, from: posOf(b), to: posOf(moved),
            message: `${label(i, b)} stuck out of the ${plate.w}x${plate.d} baseplate: moved to x=${moved.x}, z=${moved.z}`,
          })
          continue
        }
      }
      rep.error({ ...base, ...outOfBoundsMessage(i, b, plate) })
      continue
    }
    if (error === 'collision') {
      const j = collidingWith(occ, b)!
      const other = bricks.find((o) => indexOf(o) === j)!
      if (fix) {
        if (sameBrick(b, other)) {
          rep.fixes.push({ blueprint: bp, where: brickWhere(i), brick: i, part: b.p, from: posOf(b), message: `${label(i, b)} is a duplicate of brick #${j}: dropped` })
          continue
        }
        // Sunk into the brick below (y counted wrong): lift it onto the nearest free support.
        // Overlapping a brick at its own level is not a height mistake: that brick is dropped.
        const y = other.y < b.y ? nearestLevel(placed, occ, b, plate) : null
        if (y !== null) {
          place(moveTo(b, i, y, `overlapped brick #${j}`))
          continue
        }
        rep.fixes.push({ blueprint: bp, where: brickWhere(i), brick: i, part: b.p, from: posOf(b), message: `${label(i, b)} overlapped brick #${j} (${other.p}): dropped` })
        continue
      }
      const otherTop = other.y + PART_BY_ID[other.p].h
      const hint = b.y > other.y && b.y < otherTop
        ? ` y counts plates: brick #${j} fills plates ${other.y}..${otherTop - 1}, so a brick on top of it starts at y=${otherTop}.`
        : sameBrick(b, other) ? ' It is an exact duplicate: delete one (or run with --fix).' : ' Check x/z, the rotated footprint (odd r swaps w and d) and y (plates).'
      rep.error({ ...base, code: 'collision', other: j, message: `${label(i, b)} collides with ${label(j, other)}.${hint}` })
      continue
    }
    if (error === 'unsupported') {
      if (fix) {
        const y = nearestLevel(placed, occ, b, plate)
        if (y !== null) {
          place(moveTo(b, i, y, 'was floating'))
          continue
        }
      }
      const top = topBelow(occ, b)
      const restsOn = brickUnder(all, b)
      const hint = restsOn !== null && !placed.some((o) => indexOf(o) === restsOn)
        ? ` It rests on brick #${restsOn}, which has a problem of its own: fix that one first.`
        : top !== null
          ? ` The highest brick under its footprint ends at y=${top}: set y=${top}, or add a brick under it.`
          : ' Nothing is under it: set y=0, or add a brick under it.'
      rep.error({ ...base, code: 'unsupported', message: `${label(i, b)} is floating: nothing under it at plate y=${b.y - 1}.${hint}` })
      continue
    }
    place(b)
  }
  if (rep.errors.length > errorsBefore) return []
  // The game's own check of the result, bottom-up (a guard: the pass above already did this).
  const final = [...placed].sort((a, b) => a.y - b.y || indexOf(a) - indexOf(b))
  const check = new Occupancy()
  const done: Brick[] = []
  for (const b of final) {
    const err = canPlace(done, b, plate, undefined, check)
    if (err) {
      rep.error({ code: err === 'limit' ? 'limit' : err, where: brickWhere(indexOf(b)), brick: indexOf(b), part: b.p, at: posOf(b), blueprint: bp, message: `${label(indexOf(b), b)}: ${err}` })
      return []
    }
    done.push(b)
    check.add(b)
  }
  return [...placed].sort((a, b) => indexOf(a) - indexOf(b))
}

const BLUEPRINT_KINDS: readonly BlueprintKind[] = ['building', 'vehicle', 'prop']
const TAG = /^[a-z0-9_-]{1,24}$/

function parseBaseplate(v: unknown, where: string, rep: Report): Baseplate | null {
  if (!isRecord(v)) {
    rep.error({ code: 'baseplate', where, message: `${where}: missing baseplate, e.g. {"w":16,"d":16,"c":5} (studs; 8, 16, 24... up to ${PLATE_MAX})` })
    return null
  }
  const { w, d, c } = v
  const okSize = (n: unknown) => isInt(n) && n >= 1 && n <= PLATE_MAX
  if (!okSize(w) || !okSize(d)) {
    rep.error({ code: 'baseplate', where, message: `${where}: baseplate w and d must be integers 1..${PLATE_MAX} studs (got w=${show(w)}, d=${show(d)})` })
    return null
  }
  if (c !== undefined && !isColorId(c)) {
    rep.error({ code: 'color_unknown', where, message: `${where}: unknown baseplate colour ${show(c)}.${suggestColor(c)}` })
    return null
  }
  return c === undefined ? { w: w as number, d: d as number } : { w: w as number, d: d as number, c }
}

function parseName(v: unknown, where: string, rep: Report): string {
  if (v === undefined) return ''
  if (typeof v !== 'string') {
    rep.error({ code: 'field', where, message: `${where}: name must be a string` })
    return ''
  }
  const clean = sanitizeName(v)
  if (clean !== v.trim()) rep.warn({ code: 'field', where, message: `${where}: the name is shortened/cleaned to "${clean}" (at most ${SHARE_LIMITS.nameLength} characters)` })
  return clean
}

function parseTags(v: unknown, where: string, rep: Report): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) {
    rep.error({ code: 'field', where, message: `${where}: tags must be a list of strings` })
    return []
  }
  const ok = v.filter((t): t is string => typeof t === 'string' && TAG.test(t))
  if (ok.length !== v.length) rep.warn({ code: 'field', where, message: `${where}: tags must match ${TAG} (lower case); others are dropped` })
  if (ok.length > SHARE_LIMITS.tags) rep.warn({ code: 'field', where, message: `${where}: only the first ${SHARE_LIMITS.tags} tags are kept` })
  return ok.slice(0, SHARE_LIMITS.tags)
}

interface ParsedBlueprint {
  blueprint: Blueprint
  /** Index of each kept brick in the input `bricks` list. */
  inputIndex: number[]
}

/** A blueprint from its authoring form; null when any error was reported. */
function parseBlueprint(v: Loose, where: string, opts: { fix: boolean; now: number; id: string; name: string }, rep: Report, bp?: string): ParsedBlueprint | null {
  const before = rep.errors.length
  const at = where || 'model'
  const kind = v.blueprintKind ?? 'building'
  if (typeof kind !== 'string' || !(BLUEPRINT_KINDS as readonly string[]).includes(kind)) {
    rep.error({ code: 'field', where: at, message: `${at}: blueprintKind must be one of ${BLUEPRINT_KINDS.join(', ')} (got ${show(kind)})` })
  }
  if (v.kind !== undefined && (BLUEPRINT_KINDS as readonly string[]).includes(v.kind as string)) {
    rep.error({ code: 'field', where: at, message: `${at}: put "${String(v.kind)}" in "blueprintKind" ("kind" is model/city/maze at the top level)` })
  }
  const baseplate = parseBaseplate(v.baseplate, `${where ? `${where} ` : ''}baseplate`, rep)
  const tags = parseTags(v.tags, `${where ? `${where} ` : ''}tags`, rep)
  const rawBricks = v.bricks
  if (!Array.isArray(rawBricks) || rawBricks.length === 0) {
    rep.error({ code: 'field', where: at, message: `${at}: "bricks" must be a non-empty list` })
    return null
  }
  if (rawBricks.length > MAX_BRICKS) {
    rep.error({ code: 'limit', where: at, blueprint: bp, message: `${at}: ${rawBricks.length} bricks; the game allows at most ${MAX_BRICKS} per model. Use bigger bricks or hollow interiors.` })
    return null
  }
  const bricksWhere = `${where === '' ? '' : `${where} `}bricks`
  const parsed = rawBricks.map((b, i) => parseBrick(b, i, bricksWhere, rep))
  if (!baseplate) return null
  // The bricks that parsed are placed anyway, so one run reports field and placement problems together.
  const kept = checkPlacement(parsed.filter((b): b is Brick => b !== null), baseplate, bricksWhere, opts.fix, rep, bp)
  if (rep.errors.length > before) return null
  if (kept.length === 0) {
    rep.error({ code: 'field', where: at, message: `${at}: no bricks left` })
    return null
  }
  const now = opts.now
  return {
    blueprint: {
      id: opts.id, name: opts.name, kind: kind as BlueprintKind, tags, baseplate,
      bricks: kept.map((b) => ({ ...b })), createdAt: now, updatedAt: now,
    },
    inputIndex: kept.map(indexOf),
  }
}

// ---------------------------------------------------------------------------------------------
// model

const pkgHeader = (kind: SharePackage['kind'], name: string, createdAt: number) => ({ app: 'bricktown', v: 1, kind, name, createdAt }) as const

function stepProblems(blueprint: Blueprint, steps: number[][]): string[] {
  // Bricks are named by id, `#<input index>`, in the problems.
  return validateTemplate({
    id: 'authoring', name: { vi: '', en: '' }, difficulty: 1, kind: blueprint.kind, tags: [],
    baseplate: blueprint.baseplate, bricks: blueprint.bricks, steps,
  })
}

function checkModel(raw: Loose, opts: AuthoringOptions, rep: Report, now: number): SharePackage | null {
  const name = parseName(raw.name, 'name', rep)
  const parsed = parseBlueprint(raw, '', { fix: opts.fix === true, now, id: 'model', name }, rep)
  const { withSteps, stepSize, steps: rawSteps } = raw
  if (withSteps !== undefined && typeof withSteps !== 'boolean') rep.error({ code: 'field', where: 'withSteps', message: 'withSteps must be true or false' })
  if (stepSize !== undefined && (!isInt(stepSize) || stepSize < 1 || stepSize > MAX_STEP_SIZE)) {
    rep.error({ code: 'steps', where: 'stepSize', message: `stepSize must be an integer 1..${MAX_STEP_SIZE} (bricks per step), got ${show(stepSize)}` })
  }
  if (!parsed || rep.errors.length > 0) return null
  const { blueprint, inputIndex } = parsed
  const model: NonNullable<SharePackage['model']> = { blueprint }
  if (rawSteps !== undefined) {
    // Explicit steps: indices into the input `bricks`; bricks dropped by a fix leave their step.
    if (!Array.isArray(rawSteps) || !rawSteps.every((s) => Array.isArray(s) && s.every(isInt))) {
      rep.error({ code: 'steps', where: 'steps', message: 'steps must be a list of lists of brick indices, e.g. [[0,1],[2,3]]' })
      return null
    }
    const toOut = new Map(inputIndex.map((input, out) => [input, out]))
    const dropped = new Set(rep.fixes.filter((f) => !f.to).map((f) => f.brick))
    const steps: number[][] = []
    for (const s of rawSteps as number[][]) {
      const mapped: number[] = []
      for (const i of s) {
        const out = toOut.get(i)
        if (out !== undefined) mapped.push(out)
        else if (!dropped.has(i)) rep.error({ code: 'steps', where: 'steps', message: `steps: ${i} is not a brick index (0..${inputIndex.length - 1})` })
      }
      if (mapped.length > 0) steps.push(mapped)
    }
    if (rep.errors.length > 0) return null
    const problems = stepProblems(blueprint, steps)
    for (const p of problems) rep.error({ code: 'steps', where: 'steps', message: `steps: ${p}` })
    steps.forEach((s, k) => {
      if (s.length > MAX_STEP_SIZE) rep.warn({ code: 'steps', where: `steps[${k}]`, message: `step ${k} has ${s.length} bricks; keep steps at ${MAX_STEP_SIZE} or fewer for kids` })
    })
    if (problems.length > 0) return null
    model.steps = steps
    return { ...pkgHeader('model', name, now), model }
  }
  // Bottom-up order, layer by layer (build order, like the game's own share; it compresses better).
  blueprint.bricks.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)
  if (withSteps === true) {
    const steps = autoSteps(blueprint.bricks, isInt(stepSize) ? stepSize : 4)
    const problems = stepProblems(blueprint, steps)
    for (const p of problems) rep.error({ code: 'steps', where: 'withSteps', message: `build steps: ${p}` })
    if (problems.length > 0) return null
    model.steps = steps
  }
  return { ...pkgHeader('model', name, now), model }
}

// ---------------------------------------------------------------------------------------------
// city

const KEY = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/

/** "cx,cz" keys (also accepted: [cx, cz] pairs, spaces), deduplicated; bad ones reported. */
function parseKeys(v: unknown, size: number, where: string, rep: Report): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) {
    rep.error({ code: 'cell', where, message: `${where} must be a list of "cx,cz" cell keys` })
    return []
  }
  const out = new Set<string>()
  const bad: string[] = []
  for (const k of v) {
    let cell: [number, number] | null = null
    if (typeof k === 'string') {
      const m = KEY.exec(k)
      if (m) cell = [Number(m[1]), Number(m[2])]
    } else if (Array.isArray(k) && k.length === 2 && isInt(k[0]) && isInt(k[1])) {
      cell = [k[0], k[1]]
    }
    if (!cell || cell[0] < 0 || cell[1] < 0 || cell[0] >= size || cell[1] >= size) bad.push(show(k))
    else out.add(roadKey(cell[0], cell[1]))
  }
  if (bad.length) {
    rep.error({ code: 'cell', where, message: `${where}: ${bad.length} bad cell(s) ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '...' : ''}: keys are "cx,cz" with 0 <= cx, cz < size (${size})` })
  }
  return [...out]
}

const ID = /^[A-Za-z0-9_-]{1,40}$/

function checkCity(raw: Loose, opts: AuthoringOptions, rep: Report, now: number): SharePackage | null {
  const name = parseName(raw.name, 'name', rep)
  const size = raw.size
  if (!isInt(size) || size < 1 || size > SHARE_LIMITS.citySize) {
    rep.error({ code: 'city_size', where: 'size', message: `size must be an integer 1..${SHARE_LIMITS.citySize} (cells per side; a cell is ${CELL} studs), got ${show(size)}` })
    return null
  }
  const roads = parseKeys(raw.roads, size, 'roads', rep)
  const rails = parseKeys(raw.rails, size, 'rails', rep)
  let terrain: CityTerrain | undefined
  if (raw.terrain !== undefined) {
    const t = isRecord(raw.terrain) ? raw.terrain : {}
    if (!isRecord(raw.terrain)) rep.error({ code: 'terrain', where: 'terrain', message: 'terrain must be {"water":[...],"pavement":[...],"sand":[...]}' })
    for (const k of Object.keys(t)) if (!['water', 'pavement', 'sand'].includes(k)) rep.error({ code: 'terrain', where: 'terrain', message: `terrain: unknown layer "${k}" (water, pavement, sand; grass is the default)` })
    terrain = { water: parseKeys(t.water, size, 'terrain.water', rep), pavement: parseKeys(t.pavement, size, 'terrain.pavement', rep), sand: parseKeys(t.sand, size, 'terrain.sand', rep) }
    const seen = new Map<string, string>()
    for (const layer of ['water', 'pavement', 'sand'] as const) {
      for (const k of terrain[layer]) {
        const prev = seen.get(k)
        if (prev) rep.error({ code: 'terrain', where: `terrain.${layer}`, message: `cell ${k} is both ${prev} and ${layer}: a cell has one ground` })
        seen.set(k, layer)
      }
    }
    const dry = new Set([...roads, ...rails])
    for (const k of terrain.water) if (dry.has(k)) rep.error({ code: 'terrain', where: 'terrain.water', message: `cell ${k} is water under a road or rail: not allowed (use a bridge model tagged "water", or move the road)` })
    if (terrain.water.length + terrain.pavement.length + terrain.sand.length === 0) terrain = undefined
  }
  const bad = invalidCrossings({ roads, rails })
  if (bad.length) {
    rep.error({ code: 'crossing', where: 'rails', message: `road and rail meet at ${bad.join(' ')}: allowed only as a level crossing where both are straight and perpendicular` })
  }

  // Blueprints.
  const blueprints: Blueprint[] = []
  const rawBps = raw.blueprints ?? []
  if (!Array.isArray(rawBps)) rep.error({ code: 'blueprint', where: 'blueprints', message: 'blueprints must be a list of models' })
  else if (rawBps.length > SHARE_LIMITS.cityBlueprints) rep.error({ code: 'limit', where: 'blueprints', message: `at most ${SHARE_LIMITS.cityBlueprints} blueprints in a city` })
  else {
    rawBps.forEach((v, k) => {
      const where = `blueprints[${k}]`
      if (!isRecord(v)) {
        rep.error({ code: 'blueprint', where, message: `${where} must be a model object` })
        return
      }
      const id = v.id
      if (typeof id !== 'string' || !ID.test(id)) {
        rep.error({ code: 'blueprint', where, message: `${where}: id must be 1..40 letters, digits, _ or - (placements refer to it), got ${show(id)}` })
        return
      }
      if (blueprints.some((b) => b.id === id)) {
        rep.error({ code: 'blueprint', where, message: `${where}: duplicate blueprint id "${id}"` })
        return
      }
      const parsed = parseBlueprint(v, `${where} "${id}"`, { fix: opts.fix === true, now, id, name: parseName(v.name ?? id, `${where}.name`, rep) }, rep, id)
      if (parsed) blueprints.push(parsed.blueprint)
    })
  }

  // Placements.
  const byId = new Map(blueprints.map((b) => [b.id, b]))
  const templateIds = opts.templateIds ?? []
  const sizeOf = (source: string): SourceSize => {
    if (source.startsWith('tpl:')) return opts.templateSize?.(source.slice(4)) ?? { w: CELL, d: CELL }
    const bp = byId.get(source)
    return bp ? sourceSize(bp.baseplate, bp.tags, bp.kind, bp.bricks) : { w: CELL, d: CELL }
  }
  const city: CityState = { size, roads, placements: [] }
  if (rails.length) city.rails = rails
  if (terrain) city.terrain = terrain
  const rawPl = raw.placements ?? []
  if (!Array.isArray(rawPl)) {
    rep.error({ code: 'placement', where: 'placements', message: 'placements must be a list' })
    return null
  }
  const roadSet = new Set(roads)
  const railSet = new Set(rails)
  const water = new Set(terrain?.water ?? [])
  rawPl.forEach((v, k) => {
    const where = `placements[${k}]`
    if (!isRecord(v)) {
      rep.error({ code: 'placement', where, message: `${where} must be {"source":..., "cx":..., "cz":..., "rot":0}` })
      return
    }
    const { source, cx, cz } = v
    const rot = v.rot ?? 0
    const s = v.s ?? 1
    if (typeof source !== 'string') {
      rep.error({ code: 'source_unknown', where, message: `${where}: source must be a blueprint id or "tpl:<template id>"` })
      return
    }
    if (source.startsWith('tpl:')) {
      const id = source.slice(4)
      const known = opts.templateSize ? opts.templateSize(id) !== undefined : templateIds.includes(id)
      if (!/^[a-z0-9_]{1,40}$/.test(id) || (!known && (opts.templateSize || templateIds.length))) {
        const near = closest(id, templateIds)
        rep.error({ code: 'template_unknown', where, message: `${where}: unknown template "${source}".${near.length ? ` Did you mean ${near.map((n) => `"tpl:${n}"`).join(', ')}?` : ' See reference/templates.md.'}` })
        return
      }
      if (!known) rep.warn({ code: 'template_unknown', where, message: `${where}: template "${source}" could not be checked (no template list); it counts as one cell` })
    } else if (!byId.has(source)) {
      const near = closest(source, [...byId.keys()])
      rep.error({ code: 'source_unknown', where, message: `${where}: no blueprint with id "${source}".${near.length ? ` Did you mean ${near.map((n) => `"${n}"`).join(', ')}?` : ''} Built-in templates are written "tpl:<id>".` })
      return
    }
    if (!isInt(cx) || !isInt(cz)) {
      rep.error({ code: 'placement', where, message: `${where}: cx and cz must be integer cells (min corner), got ${show(cx)}, ${show(cz)}` })
      return
    }
    if (rot !== 0 && rot !== 1 && rot !== 2 && rot !== 3) {
      rep.error({ code: 'placement', where, message: `${where}: rot must be 0..3, got ${show(rot)}` })
      return
    }
    if (!isInt(s) || s < MIN_SCALE || s > MAX_SCALE) {
      rep.error({ code: 'scale', where, message: `${where}: s (size multiplier) must be an integer ${MIN_SCALE}..${MAX_SCALE}, got ${show(s)}` })
      return
    }
    const placement: CityPlacement = s === 1 ? { id: `p${k}`, source, cx, cz, rot } : { id: `p${k}`, source, cx, cz, rot, s }
    const err = canPlaceInCity(city, placement, sizeOf)
    if (err) {
      const { cw, cd } = placementCells(placement, sizeOf(source))
      const span = `cells x ${cx}..${cx + cw - 1}, z ${cz}..${cz + cd - 1} (${cw}x${cd} cells at rot=${rot}, s=${s})`
      const cells: string[] = []
      for (let x = cx; x < cx + cw; x++) for (let z = cz; z < cz + cd; z++) cells.push(roadKey(x, z))
      const detail = (() => {
        switch (err) {
          case 'out_of_bounds': return `it covers ${span}, outside the ${size}x${size} city`
          case 'overlap': {
            const o = city.placements.find((q) => {
              const c = placementCells(q, sizeOf(q.source))
              return cx < q.cx + c.cw && q.cx < cx + cw && cz < q.cz + c.cd && q.cz < cz + cd
            })
            // Placement ids are `p<input index>`.
            return `it covers ${span} and overlaps placements[${o?.id.slice(1)}] (${o?.source})`
          }
          case 'road': return `it covers ${span}, which includes road cell(s) ${cells.filter((c) => roadSet.has(c)).join(' ')}`
          case 'rail': return `it covers ${span}, which includes rail cell(s) ${cells.filter((c) => railSet.has(c)).join(' ')}`
          case 'water': return sizeOf(source).water
            ? `it is a water model but no cell under it (${span}) is water`
            : `it covers ${span}, which includes water cell(s) ${cells.filter((c) => water.has(c)).join(' ')}`
          default: return err
        }
      })()
      rep.error({ code: 'placement', where, message: `${where} (${source}): ${detail}` })
      return
    }
    city.placements.push(placement)
  })
  if (city.placements.length > size * size) rep.error({ code: 'limit', where: 'placements', message: 'too many placements' })
  const used = new Set(city.placements.map((p) => p.source))
  for (const b of blueprints) if (!used.has(b.id)) rep.warn({ code: 'blueprint', where: 'blueprints', message: `blueprint "${b.id}" is not placed anywhere: it is left out of the city` })
  if (rep.errors.length > 0) return null
  return { ...pkgHeader('city', name, now), city: { city, blueprints: blueprints.filter((b) => used.has(b.id)) } }
}

// ---------------------------------------------------------------------------------------------
// maze

function checkMazeAuthoring(raw: Loose, rep: Report, now: number): SharePackage | null {
  const name = parseName(raw.name, 'name', rep)
  const grid = raw.grid
  if (!Array.isArray(grid) || !grid.every((r) => typeof r === 'string')) {
    rep.error({ code: 'maze', where: 'grid', message: 'grid must be a list of row strings: "#" wall, "." floor, "o" coin, "E" entry, "X" exit' })
    return null
  }
  const rows = grid as string[]
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const okSize = (n: number) => n % 2 === 1 && n >= MAZE_MIN_SIZE && n <= MAZE_MAX_SIZE
  if (!okSize(w) || !okSize(h)) rep.error({ code: 'maze', where: 'grid', message: `the maze must be odd sizes ${MAZE_MIN_SIZE}..${MAZE_MAX_SIZE} wide and tall, got ${w}x${h}` })
  rows.forEach((r, z) => {
    if (r.length !== w) rep.error({ code: 'maze', where: `grid[${z}]`, message: `row ${z} has ${r.length} cells, row 0 has ${w}` })
    const badChar = [...r].find((ch) => !'#.oEX'.includes(ch))
    if (badChar) rep.error({ code: 'maze', where: `grid[${z}]`, message: `row ${z}: unknown cell "${badChar}" (use # . o E X)` })
  })
  const wallColor = raw.wallColor ?? 6
  const floorColor = raw.floorColor
  if (!isColorId(wallColor)) rep.error({ code: 'color_unknown', where: 'wallColor', message: `wallColor: unknown colour ${show(wallColor)}.${suggestColor(wallColor)}` })
  if (floorColor !== undefined && !isColorId(floorColor)) rep.error({ code: 'color_unknown', where: 'floorColor', message: `floorColor: unknown colour ${show(floorColor)}.${suggestColor(floorColor)}` })
  if (rep.errors.length > 0) return null
  const walls: string[] = []
  const coins: string[] = []
  const doors: Record<'E' | 'X', Cell[]> = { E: [], X: [] }
  rows.forEach((r, cz) => [...r].forEach((ch, cx) => {
    const k = cellKey({ cx, cz })
    if (ch === '#') walls.push(k)
    else if (ch === 'o') coins.push(k)
    else if (ch === 'E' || ch === 'X') doors[ch].push({ cx, cz })
  }))
  const dims = { w, h }
  for (const d of ['E', 'X'] as const) {
    const what = d === 'E' ? 'entry' : 'exit'
    if (doors[d].length !== 1) rep.error({ code: 'maze', where: 'grid', message: `the maze needs exactly one ${what} "${d}", found ${doors[d].length}` })
    else if (!isBorder(dims, doors[d][0]) || isCorner(dims, doors[d][0])) rep.error({ code: 'maze', where: 'grid', message: `the ${what} "${d}" must be on the outer ring, not in a corner` })
  }
  const wallSet = new Set(walls)
  const gaps: string[] = []
  for (let cz = 0; cz < h; cz++) for (let cx = 0; cx < w; cx++) {
    const ch = rows[cz][cx]
    if (isBorder(dims, { cx, cz }) && !wallSet.has(cellKey({ cx, cz })) && ch !== 'E' && ch !== 'X') gaps.push(cellKey({ cx, cz }))
  }
  if (gaps.length) rep.error({ code: 'maze', where: 'grid', message: `the outer ring must be wall except the two doors; open: ${gaps.join(' ')}` })
  if (rep.errors.length > 0) return null
  const maze: Maze = { id: 'maze', name, w, h, walls, entry: doors.E[0], exit: doors.X[0], coins, wallColor: wallColor as number, createdAt: now, updatedAt: now }
  if (floorColor !== undefined) maze.floorColor = floorColor as number
  if (!solve(maze)) {
    rep.error({ code: 'maze', where: 'grid', message: 'there is no path from the entry "E" to the exit "X"' })
    return null
  }
  return { ...pkgHeader('maze', name, now), maze: { maze } }
}

// ---------------------------------------------------------------------------------------------
// entry points

const KINDS = ['model', 'city', 'maze'] as const

/**
 * Authoring JSON (already parsed) to a validated share package, or every problem found. The
 * `format` marker is optional here (the CLI warns when it is missing); the result went through the
 * same `validatePackage` as a share link, so it imports exactly like one.
 */
export function authoringToPackage(raw: unknown, opts: AuthoringOptions = {}): AuthoringResult {
  const rep = new Report()
  const now = opts.now ?? Date.now()
  const result = (): AuthoringResult => ({ ok: false, errors: rep.errors, warnings: rep.warnings, fixes: rep.fixes })
  if (!isRecord(raw)) {
    rep.error({ code: 'format', where: '', message: 'the authoring file must be a JSON object' })
    return result()
  }
  if (raw.format === undefined) {
    rep.warn({ code: 'format', where: 'format', message: `add "format": "${AUTHORING_FORMAT}" and "version": ${AUTHORING_VERSION} so the game's 📥 import recognises the plain JSON` })
  } else if (raw.format !== AUTHORING_FORMAT) {
    rep.error({ code: 'format', where: 'format', message: `format must be "${AUTHORING_FORMAT}", got ${show(raw.format)}` })
  }
  if (raw.version !== undefined && raw.version !== AUTHORING_VERSION) {
    rep.error({ code: 'version', where: 'version', message: `version ${show(raw.version)} is not supported (this game reads version ${AUTHORING_VERSION})` })
  }
  const kind = raw.kind
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) {
    rep.error({ code: 'kind', where: 'kind', message: `kind must be "model", "city" or "maze", got ${show(kind)}${(BLUEPRINT_KINDS as readonly unknown[]).includes(kind) ? ` (put "${String(kind)}" in "blueprintKind")` : ''}` })
  }
  if (rep.errors.length > 0) return result()
  const pkg = kind === 'model' ? checkModel(raw, opts, rep, now) : kind === 'city' ? checkCity(raw, opts, rep, now) : checkMazeAuthoring(raw, rep, now)
  if (!pkg || rep.errors.length > 0) return result()
  const checked = validatePackage(pkg, opts)
  if ('error' in checked) {
    rep.error({ code: checked.error === 'too_big' ? 'too_big' : 'rejected', where: '', message: `the game's import validation refused the result (${checked.error})` })
    return result()
  }
  return { ok: true, pkg: checked, warnings: rep.warnings, fixes: rep.fixes }
}

/** The JSON object inside pasted text: a reply may wrap it in a ```json fence or add lines around it. */
function extractObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

/**
 * Pasted text or a file in the authoring format (it must carry the `format` marker), converted with
 * `authoringToPackage`; null when the text is not authoring JSON (then it is a share link or file).
 * Text over MAX_AUTHORING_CHARS is refused before parsing.
 */
export function parseAuthoringText(text: string, opts: AuthoringOptions = {}): AuthoringResult | null {
  if (!looksLikeAuthoring(text)) return null
  const fail = (code: IssueCode, message: string): AuthoringResult => ({ ok: false, errors: [{ code, where: '', message }], warnings: [], fixes: [] })
  if (text.length > MAX_AUTHORING_CHARS) return fail('too_big', `the text is longer than ${MAX_AUTHORING_CHARS} characters`)
  let raw: unknown
  try {
    raw = JSON.parse(extractObject(text))
  } catch (e) {
    return fail('json', `not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  return isAuthoring(raw) ? authoringToPackage(raw, opts) : null
}
