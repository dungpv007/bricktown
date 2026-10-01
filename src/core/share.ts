import type { Maze } from './maze'
import { compress, decompress, packShare, unpackShare } from './shareCodec'
import { validatePackage, type ShareImportOptions } from './shareImport'
import { autoSteps, validateTemplate } from './template'
import type { Blueprint, CityState } from './types'

/**
 * Sharing a creation without a server: the whole package travels inside a link
 * (`<base>/#s=<payload>`, also shown as a QR code) or a `.bricktown` file holding the same payload.
 * See core/shareCodec for the wire format and core/shareImport for validating and importing.
 */

export type ShareKind = 'model' | 'maze' | 'city'

export interface MazeBest {
  timeMs: number
  stars: 1 | 2 | 3
}

export interface SharePackage {
  app: 'bricktown'
  v: 1
  kind: ShareKind
  name: string
  createdAt: number
  /** Steps present = shared "with build instructions" (indices into `blueprint.bricks`). */
  model?: { blueprint: Blueprint; steps?: number[][] }
  maze?: { maze: Maze; best?: MazeBest }
  /** Placements refer to `blueprints` by id; `tpl:<id>` sources stay references to built-in templates. */
  city?: { city: CityState; blueprints: Blueprint[] }
}

export type ShareErrorCode = 'corrupt' | 'too_big' | 'unsupported' | 'invalid'
export interface ShareError {
  error: ShareErrorCode
}

export const isShareError = (v: SharePackage | ShareError): v is ShareError => 'error' in v

/** Longer links do not fit a scannable QR code (offer the link or the file instead). */
export const QR_MAX_LINK_CHARS = 2300

/** A payload longer than this cannot be a share (the decompressed cap is far smaller): not decoded. */
const MAX_PAYLOAD_CHARS = 3_000_000
/** Room around the payload in pasted text or a file (`{"bricktown":"..."}`, a link's base). */
const MAX_TEXT_CHARS = MAX_PAYLOAD_CHARS + 64

const pkgHeader = (kind: ShareKind, name: string, createdAt: number) =>
  ({ app: 'bricktown', v: 1, kind, name, createdAt }) as const

/** `bricks` sorted bottom-up (y, then z, then x): build order, and it compresses better. */
function buildOrder<T extends { x: number; y: number; z: number }>(bricks: T[]): T[] {
  return [...bricks].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)
}

/**
 * A blueprint to share, bricks in build order. With `withSteps`, layer-by-layer build steps are
 * added when the model can be built in them (checked like a template). A model that cannot (a brick
 * floating in the air, possible after removing the bricks under it) is shared without steps: every
 * bottom-up order fails the same check then, since support only ever comes from lower layers.
 */
export function buildModelPackage(bp: Blueprint, opts: { withSteps: boolean }, now = Date.now()): SharePackage {
  const { templateId: _templateId, ...rest } = bp
  void _templateId
  const blueprint: Blueprint = { ...rest, tags: [...bp.tags], baseplate: { ...bp.baseplate }, bricks: buildOrder(bp.bricks) }
  const model: NonNullable<SharePackage['model']> = { blueprint }
  if (opts.withSteps && blueprint.bricks.length > 0) {
    const steps = autoSteps(blueprint.bricks)
    const problems = validateTemplate({
      id: 'share', name: { vi: bp.name, en: bp.name }, difficulty: 1, kind: bp.kind, tags: [],
      baseplate: blueprint.baseplate, bricks: blueprint.bricks, steps,
    })
    if (problems.length === 0) model.steps = steps
  }
  return { ...pkgHeader('model', bp.name, now), model }
}

export function buildMazePackage(maze: Maze, record?: MazeBest, now = Date.now()): SharePackage {
  const best = record ? { best: { timeMs: record.timeMs, stars: record.stars } } : {}
  return { ...pkgHeader('maze', maze.name, now), maze: { maze, ...best } }
}

/** The city with only the blueprints its placements use; placements of missing blueprints are dropped. */
export function buildCityPackage(
  city: CityState,
  blueprints: Blueprint[],
  opts: { name?: string; now?: number } = {},
): SharePackage {
  const byId = new Map(blueprints.map((b) => [b.id, b]))
  const used = new Map<string, Blueprint>()
  const placements = city.placements.filter((p) => {
    if (p.source.startsWith('tpl:')) return true
    const bp = byId.get(p.source)
    if (bp) used.set(bp.id, bp)
    return bp !== undefined
  })
  return {
    ...pkgHeader('city', opts.name ?? '', opts.now ?? Date.now()),
    city: { city: { size: city.size, roads: [...city.roads], placements }, blueprints: [...used.values()] },
  }
}

/** The package as a url-safe payload. */
export function encodeShare(pkg: SharePackage): string {
  return compress(JSON.stringify(packShare(pkg)))
}

/**
 * A validated package from an untrusted payload, or why it was refused. Never throws. `opts` gives
 * built-in template sizes (city placements) and fallback names in the kid's language.
 */
export function decodeShare(payload: string, opts?: ShareImportOptions): SharePackage | ShareError {
  if (payload.length > MAX_PAYLOAD_CHARS) return { error: 'too_big' }
  const inflated = decompress(payload)
  if ('error' in inflated) return inflated
  let json: unknown
  try {
    json = JSON.parse(inflated.text)
  } catch {
    return { error: 'corrupt' }
  }
  try {
    const unpacked = unpackShare(json)
    return 'error' in unpacked ? unpacked : validatePackage(unpacked.value, opts)
  } catch {
    return { error: 'invalid' } // a safety net: validation is written not to throw
  }
}

/** `<base>/#s=<payload>`. */
export function shareLink(pkg: SharePackage, base: string): string {
  return `${base.replace(/\/+$/, '')}/#s=${encodeShare(pkg)}`
}

/** The package in a location hash (`#s=...`), an error for a broken one, null when there is none. */
export function parseShareHash(hash: string, opts?: ShareImportOptions): SharePackage | ShareError | null {
  if (hash.length > MAX_TEXT_CHARS) return { error: 'too_big' }
  const payload = new URLSearchParams(hash.replace(/^#/, '')).get('s')
  return payload === null ? null : decodeShare(payload, opts)
}

/** Contents of a `.bricktown` file. */
export function shareFileText(pkg: SharePackage): string {
  return JSON.stringify({ bricktown: encodeShare(pkg) })
}

export function parseShareFile(text: string, opts?: ShareImportOptions): SharePackage | ShareError {
  if (text.length > MAX_TEXT_CHARS) return { error: 'too_big' } // refused before parsing
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'corrupt' }
  }
  const payload = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).bricktown : undefined
  return typeof payload === 'string' ? decodeShare(payload, opts) : { error: 'corrupt' }
}

/**
 * Whatever was pasted or opened: file text, a link, a hash or a bare payload. Whitespace inside a
 * link or payload is ignored (chat apps and e-mail wrap long links).
 */
export function parseShareText(text: string, opts?: ShareImportOptions): SharePackage | ShareError {
  if (text.length > MAX_TEXT_CHARS) return { error: 'too_big' }
  const t = text.trim()
  if (t.startsWith('{')) return parseShareFile(t, opts)
  const compact = t.replace(/\s+/g, '')
  const hashAt = compact.indexOf('#')
  if (hashAt >= 0) return parseShareHash(compact.slice(hashAt), opts) ?? { error: 'corrupt' }
  return decodeShare(compact, opts)
}

/** A file name safe on every system: letters (any script), digits, spaces, `-` and `_`. */
export function shareFileName(pkg: SharePackage): string {
  const safe = pkg.name.replace(/[^\p{L}\p{M}\p{N} _-]/gu, '').trim()
  return `${safe || pkg.kind}.bricktown`
}

export const fitsQr = (link: string): boolean => link.length <= QR_MAX_LINK_CHARS
