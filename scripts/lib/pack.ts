import { TEMPLATES, getTemplate } from '../../src/content/templates'
import {
  authoringToPackage, type AuthoringFix, type AuthoringIssue, type AuthoringOptions, type AuthoringResult,
} from '../../src/core/authoring'
import { sourceSize } from '../../src/core/city'
import { COLORS } from '../../src/core/colors'
import { DEFAULT_FIG, FIG_PRESETS, figPreset, parseFig } from '../../src/core/figures'
import { bounds } from '../../src/core/model'
import { PART_BY_ID } from '../../src/core/parts/catalog'
import { footprint } from '../../src/core/rotation'
import { fitsQr, parseShareFile, parseShareText, shareFileText, shareLink, type SharePackage } from '../../src/core/share'
import type { Baseplate, Blueprint, Rot } from '../../src/core/types'

/**
 * The core of `npm run bt:pack` (scripts/bt-pack.ts does the file I/O): authoring JSON in, the
 * `.bricktown` file text, the share link and a readable report out. Everything is checked by the
 * game's own code (core/authoring, which ends in the share import validation), and the result is
 * decoded again with the game's decoder to prove it imports as written.
 */

export const DEFAULT_BASE = 'http://localhost:5173'

/** What the game itself passes to an import: built-in template sizes (city `tpl:` placements). */
export function gameOptions(): AuthoringOptions {
  return {
    templateSize: (id) => {
      const t = getTemplate(id)
      return t && sourceSize(t.baseplate, t.tags)
    },
    templateIds: TEMPLATES.map((t) => t.id),
  }
}

export interface PackOptions {
  fix?: boolean
  base?: string
  layers?: boolean
  now?: number
}

export interface PackResult {
  ok: boolean
  result: AuthoringResult
  /** Contents of the `.bricktown` file (what 📥 Import → choose file accepts). */
  fileText?: string
  link?: string
  /** Differences found decoding the output again (empty: identical). */
  roundTrip?: string[]
  /** The input with the `--fix` repairs applied (when any were made), to keep editing from. */
  fixedInput?: unknown
  /** Everything to print. */
  report: string
}

// ---------------------------------------------------------------------------------------------
// colours and layers

/** One character per colour id: 0-9 then a-t. */
export const colorChar = (c: number): string => c.toString(36)

interface LayerBrick { i: number; p: string; x: number; y: number; z: number; r: Rot; c: number }

/** Bricks of a raw authoring list that can be drawn (known part, integer position), with their input index. */
function drawable(raw: unknown): LayerBrick[] {
  if (!Array.isArray(raw)) return []
  const out: LayerBrick[] = []
  raw.forEach((b: unknown, i) => {
    if (typeof b !== 'object' || b === null) return
    const o = b as Record<string, unknown>
    const ints = [o.x, o.y, o.z].every((v) => typeof v === 'number' && Number.isInteger(v))
    if (typeof o.p !== 'string' || !Object.hasOwn(PART_BY_ID, o.p) || !ints) return
    const r = o.r === 1 || o.r === 2 || o.r === 3 ? o.r : 0
    const fig = o.p === 'minifig' ? (typeof o.fig === 'string' && FIG_PRESETS.some((f) => f.id === o.fig) ? figPreset(o.fig) : parseFig(o.fig) ?? DEFAULT_FIG) : null
    const c = fig ? fig.torso : typeof o.c === 'number' && Number.isInteger(o.c) && COLORS[o.c] ? o.c : 0
    out.push({ i, p: o.p, x: o.x as number, y: o.y as number, z: o.z as number, r, c })
  })
  return out
}

/**
 * ASCII top-down maps, one per level where bricks start (y in plates), x to the right and z down
 * (row z=0 is the back, the last row the front). A cell shows the colour character of a brick that
 * starts at this level, `:` where a taller brick from below passes through, `!` where two bricks
 * starting here overlap, `.` when empty.
 */
export function renderLayers(bricks: LayerBrick[], plate: Pick<Baseplate, 'w' | 'd'>, title = ''): string {
  const lines: string[] = []
  if (title) lines.push(title)
  const levels = [...new Set(bricks.map((b) => b.y))].sort((a, b) => a - b)
  const w = Math.min(plate.w, 64)
  const d = Math.min(plate.d, 64)
  const ruler = (k: number) => Array.from({ length: w }, (_, x) => (k === 0 ? String(Math.floor(x / 10) % 10) : String(x % 10))).join('')
  for (const y of levels) {
    const starting = bricks.filter((b) => b.y === y)
    const grid = Array.from({ length: d }, () => Array.from({ length: w }, () => '.'))
    const set = (x: number, z: number, ch: string) => {
      if (x >= 0 && z >= 0 && x < w && z < d) grid[z][x] = ch
    }
    for (const b of bricks) {
      const part = PART_BY_ID[b.p]
      if (b.y < y && b.y + part.h > y) {
        const { fx, fz } = footprint(part, b.r)
        for (let dx = 0; dx < fx; dx++) for (let dz = 0; dz < fz; dz++) set(b.x + dx, b.z + dz, ':')
      }
    }
    for (const b of starting) {
      const { fx, fz } = footprint(PART_BY_ID[b.p], b.r)
      for (let dx = 0; dx < fx; dx++) {
        for (let dz = 0; dz < fz; dz++) {
          const x = b.x + dx
          const z = b.z + dz
          const cur = grid[z]?.[x]
          set(x, z, cur !== undefined && cur !== '.' ? '!' : colorChar(b.c))
        }
      }
    }
    const course = Number.isInteger(y / 3) ? ` = brick course ${y / 3}` : ' (between brick courses)'
    lines.push(`y=${y}${course}: ${starting.length} brick(s) start here`)
    lines.push(`       x ${ruler(0)}`)
    lines.push(`         ${ruler(1)}`)
    grid.forEach((row, z) => lines.push(`  z=${String(z).padStart(2)}   ${row.join('')}`))
    const list = starting.map((b) => `#${b.i} ${b.p}${b.r ? ` r${b.r}` : ''} c${b.c} @${b.x},${b.z}`)
    for (let k = 0; k < list.length; k += 6) lines.push(`    ${list.slice(k, k + 6).join('  ')}`)
  }
  const used = [...new Set(bricks.map((b) => b.c))].sort((a, b) => a - b)
  lines.push(`  colours: ${used.map((c) => `${colorChar(c)}=${COLORS[c].name.en}`).join('  ')}   (: taller brick from below, ! overlap, . empty)`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------
// summary

function blueprintSummary(bp: Pick<Blueprint, 'bricks' | 'baseplate'>): string[] {
  const b = bounds(bp.bricks)
  const colors = new Map<number, number>()
  const parts = new Map<string, number>()
  for (const brick of bp.bricks) {
    colors.set(brick.c, (colors.get(brick.c) ?? 0) + 1)
    parts.set(brick.p, (parts.get(brick.p) ?? 0) + 1)
  }
  const out = [`bricks: ${bp.bricks.length} on a ${bp.baseplate.w}x${bp.baseplate.d} baseplate${bp.baseplate.c !== undefined ? ` (colour ${bp.baseplate.c} ${COLORS[bp.baseplate.c].name.en})` : ''}`]
  if (b) {
    const h = b.maxY - b.minY
    out.push(`bounding box: x ${b.minX}..${b.maxX - 1} (${b.maxX - b.minX} studs), z ${b.minZ}..${b.maxZ - 1} (${b.maxZ - b.minZ} studs), y ${b.minY}..${b.maxY - 1} (${h} plates = ${(h / 3).toFixed(1).replace(/\.0$/, '')} bricks tall)`)
  }
  out.push(`colours: ${[...colors].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${COLORS[c].name.en} x${n}`).join(', ')}`)
  out.push(`parts: ${[...parts].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} x${n}`).join(', ')}`)
  return out
}

export function summarize(pkg: SharePackage): string {
  const lines = [`${pkg.kind} "${pkg.name}"`]
  if (pkg.model) {
    lines.push(`kind: ${pkg.model.blueprint.kind}`, ...blueprintSummary(pkg.model.blueprint))
    lines.push(pkg.model.steps ? `build steps: ${pkg.model.steps.length} (imports into 📋 Guided mode too)` : 'build steps: none')
  }
  if (pkg.city) {
    const { city, blueprints } = pkg.city
    const t = city.terrain
    lines.push(`city: ${city.size}x${city.size} cells (${city.size * 8}x${city.size * 8} studs), ${city.roads.length} road cells, ${city.rails?.length ?? 0} rail cells`)
    if (t) lines.push(`terrain: ${t.water.length} water, ${t.pavement.length} pavement, ${t.sand.length} sand`)
    lines.push(`placements: ${city.placements.length} (${city.placements.filter((p) => p.source.startsWith('tpl:')).length} built-in templates)`)
    for (const bp of blueprints) lines.push(`blueprint "${bp.id}" ${bp.name}: ${bp.bricks.length} bricks, ${bp.baseplate.w}x${bp.baseplate.d}`)
  }
  if (pkg.maze) {
    const m = pkg.maze.maze
    lines.push(`maze: ${m.w}x${m.h}, ${m.walls.length} walls, ${m.coins.length} coins`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------
// round trip

/** The package without ids and timestamps, city sources as blueprint positions: what must survive. */
function canonical(pkg: SharePackage): unknown {
  const bp = (b: Blueprint) => ({
    name: b.name, kind: b.kind, tags: b.tags, baseplate: b.baseplate,
    bricks: b.bricks.map(({ p, x, y, z, r, c, fig }) => ({ p, x, y, z, r, c, fig: fig ?? null })),
  })
  const sorted = (a: string[] | undefined) => [...(a ?? [])].sort()
  return {
    kind: pkg.kind,
    name: pkg.name,
    model: pkg.model ? { blueprint: bp(pkg.model.blueprint), steps: pkg.model.steps ?? null } : null,
    city: pkg.city
      ? {
          size: pkg.city.city.size,
          roads: sorted(pkg.city.city.roads),
          rails: sorted(pkg.city.city.rails),
          terrain: pkg.city.city.terrain ? { water: sorted(pkg.city.city.terrain.water), pavement: sorted(pkg.city.city.terrain.pavement), sand: sorted(pkg.city.city.terrain.sand) } : null,
          placements: pkg.city.city.placements.map((p) => ({
            source: p.source.startsWith('tpl:') ? p.source : `#${pkg.city!.blueprints.findIndex((b) => b.id === p.source)}`,
            cx: p.cx, cz: p.cz, rot: p.rot, s: p.s ?? 1,
          })),
          blueprints: pkg.city.blueprints.map(bp),
        }
      : null,
    maze: pkg.maze ? { ...pkg.maze.maze, id: null, createdAt: null, updatedAt: null } : null,
  }
}

/** Paths where `a` and `b` differ (at most `max`). */
export function diff(a: unknown, b: unknown, path = '', out: string[] = [], max = 8): string[] {
  if (out.length >= max) return out
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) {
    out.push(`${path || '.'}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`)
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: ${a.length} items != ${b.length} items`)
    else a.forEach((v, i) => diff(v, b[i], `${path}[${i}]`, out, max))
  } else if (typeof a === 'object' && a !== null) {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) diff(ao[k], bo[k], `${path}.${k}`, out, max)
  } else if (a !== b) {
    out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`)
  }
  return out
}

/** Decodes the file text and the link with the game's decoder; the differences from `pkg`. */
export function roundTrip(pkg: SharePackage, fileText: string, link: string, opts: AuthoringOptions): string[] {
  const fromFile = parseShareFile(fileText, opts)
  if ('error' in fromFile) return [`the game cannot read the .bricktown file: ${fromFile.error}`]
  const fromLink = parseShareText(link, opts)
  if ('error' in fromLink) return [`the game cannot read the link: ${fromLink.error}`]
  const want = canonical(pkg)
  return [...diff(want, canonical(fromFile)), ...diff(want, canonical(fromLink)).map((d) => `link ${d}`)]
}

// ---------------------------------------------------------------------------------------------
// fixes back into the input

/** The authoring input with the repairs applied (dropped bricks removed, moved ones at their new y). */
export function applyFixes(raw: unknown, fixes: AuthoringFix[]): unknown {
  if (fixes.length === 0 || typeof raw !== 'object' || raw === null) return raw
  const copy = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
  const patch = (list: unknown, mine: AuthoringFix[]) => {
    if (!Array.isArray(list)) return list
    const byIndex = new Map(mine.map((f) => [f.brick, f]))
    return list.flatMap((b: unknown, i) => {
      const f = byIndex.get(i)
      if (!f) return [b]
      if (!f.to) return []
      return [{ ...(b as Record<string, unknown>), y: f.to.y }]
    })
  }
  if (Array.isArray(copy.blueprints)) {
    copy.blueprints = copy.blueprints.map((bp: unknown) => {
      const o = bp as Record<string, unknown>
      return { ...o, bricks: patch(o.bricks, fixes.filter((f) => f.blueprint === o.id)) }
    })
  } else {
    copy.bricks = patch(copy.bricks, fixes.filter((f) => f.blueprint === undefined))
    if (Array.isArray(copy.steps)) {
      // Explicit steps refer to input indices: renumber them past the dropped bricks.
      const dropped = new Set(fixes.filter((f) => !f.to && f.blueprint === undefined).map((f) => f.brick))
      const shift = (i: number) => i - [...dropped].filter((d) => d < i).length
      copy.steps = (copy.steps as number[][]).map((s) => s.filter((i) => !dropped.has(i)).map(shift)).filter((s) => s.length > 0)
    }
  }
  return copy
}

// ---------------------------------------------------------------------------------------------
// report

const issueLine = (mark: string, i: AuthoringIssue) => `  ${mark} ${i.where ? `${i.where}: ` : ''}${i.message.replace(new RegExp(`^${i.where.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`), '')}`

/** Layer maps of the input (after repairs, when there were any): `#n` is the index in its `bricks`. */
function layersFor(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) return ''
  const r = raw as Record<string, unknown>
  if (r.kind === 'model') {
    const plate = (r.baseplate ?? {}) as Partial<Baseplate>
    return renderLayers(drawable(r.bricks), { w: plate.w ?? 16, d: plate.d ?? 16 }, 'LAYERS (#n = index in "bricks"; after --fix, in the .fixed.json)')
  }
  if (r.kind === 'city' && Array.isArray(r.blueprints)) {
    return r.blueprints
      .map((bp: unknown) => {
        const o = bp as Record<string, unknown>
        const plate = (o.baseplate ?? {}) as Partial<Baseplate>
        return renderLayers(drawable(o.bricks), { w: plate.w ?? 16, d: plate.d ?? 16 }, `LAYERS of blueprint "${String(o.id)}" (#n = index in its "bricks")`)
      })
      .join('\n\n')
  }
  return ''
}

/** Checks, converts and reports one authoring document. */
export function pack(raw: unknown, opts: PackOptions = {}): PackResult {
  const gopts = { ...gameOptions(), fix: opts.fix === true, now: opts.now }
  const result = authoringToPackage(raw, gopts)
  const lines: string[] = []
  if (result.fixes.length) {
    lines.push(`FIXED (${result.fixes.length}):`)
    for (const f of result.fixes) lines.push(`  ~ ${f.blueprint ? `blueprint "${f.blueprint}" ` : ''}${f.message}`)
  }
  if (result.warnings.length) {
    lines.push(`WARNINGS (${result.warnings.length}):`)
    for (const w of result.warnings) lines.push(issueLine('!', w))
  }
  const fixedInput = result.fixes.length ? applyFixes(raw, result.fixes) : undefined
  if (!result.ok) {
    lines.push(`ERRORS (${result.errors.length}): nothing was written. Fix these and run again${result.errors.some((e) => e.code === 'collision' || e.code === 'unsupported') && !opts.fix ? ' (or try --fix for safe repairs)' : ''}.`)
    for (const e of result.errors.slice(0, 60)) lines.push(issueLine('✗', e))
    if (result.errors.length > 60) lines.push(`  ... and ${result.errors.length - 60} more`)
    if (opts.layers) lines.push('', layersFor(fixedInput ?? raw))
    return { ok: false, result, fixedInput, report: lines.join('\n') }
  }
  const fileText = shareFileText(result.pkg)
  const link = shareLink(result.pkg, opts.base ?? DEFAULT_BASE)
  const rt = roundTrip(result.pkg, fileText, link, gopts)
  lines.push('OK', summarize(result.pkg))
  lines.push(`link: ${link.length} characters${fitsQr(link) ? ' (fits a QR code)' : ' (too long for a QR code: share the file)'}`)
  lines.push(rt.length ? `ROUND TRIP FAILED:\n  ${rt.join('\n  ')}` : 'round trip: the game decodes exactly this model ✓')
  if (opts.layers) lines.push('', layersFor(fixedInput ?? raw))
  return { ok: rt.length === 0, result, fileText, link, roundTrip: rt, fixedInput, report: lines.join('\n') }
}
