import { getTemplate, TEMPLATES } from '../content/templates'
import { bakeBricks, bakeKey, type BakedModel } from '../core/bake'
import { sourceSize, type SourceSize } from '../core/city'
import type { Baseplate, BlueprintKind, Brick, SaveData } from '../core/types'
import type { Lang } from '../state/useApp'

/** What a city placement shows: a ready-made template (`tpl:<id>`) or one of the kid's blueprints. */
export interface ResolvedSource {
  name: string
  kind: BlueprintKind
  baseplate: Baseplate
  bricks: Brick[]
}

export const TEMPLATE_PREFIX = 'tpl:'

export const templateSource = (templateId: string): string => `${TEMPLATE_PREFIX}${templateId}`

export const isTemplateSource = (source: string): boolean => source.startsWith(TEMPLATE_PREFIX)

const templateOf = (source: string) => getTemplate(source.slice(TEMPLATE_PREFIX.length))

/** Null when the template or blueprint does not exist (e.g. the blueprint was deleted). */
export function resolveSource(
  source: string,
  data: Pick<SaveData, 'blueprints'>,
  lang: Lang = 'vi',
): ResolvedSource | null {
  if (isTemplateSource(source)) {
    const tpl = templateOf(source)
    return tpl ? { name: tpl.name[lang], kind: tpl.kind, baseplate: tpl.baseplate, bricks: tpl.bricks } : null
  }
  const bp = data.blueprints.find((b) => b.id === source)
  return bp ? { name: bp.name, kind: bp.kind, baseplate: bp.baseplate, bricks: bp.bricks } : null
}

/** A source the city can actually draw: resolved and baked. */
export interface RenderableSource extends ResolvedSource {
  /** Shared bake-cache geometry: never dispose or mutate. */
  baked: BakedModel
}

/**
 * Like `resolveSource`, plus the baked model. Null when the source is missing or cannot be baked
 * (e.g. a blueprint using a part id this version does not know): such placements get a placeholder
 * instead of crashing the scene, and such sources cannot be placed.
 */
export function resolveRenderable(
  source: string,
  data: Pick<SaveData, 'blueprints'>,
  lang: Lang = 'vi',
): RenderableSource | null {
  const resolved = resolveSource(source, data, lang)
  if (!resolved) return null
  try {
    return { ...resolved, baked: bakeBricks(resolved.bricks) }
  } catch {
    return null
  }
}

const UNKNOWN_SIZE: Baseplate = { w: 8, d: 8 }

/**
 * Footprint lookup for the core city functions (plate, flagged `water` for water models, see
 * `sourceSize`); unknown sources count as one dry-land cell.
 */
export function makeSizeOf(data: Pick<SaveData, 'blueprints'>): (source: string) => SourceSize {
  const byId = new Map(data.blueprints.map((b) => [b.id, sourceSize(b.baseplate, b.tags, b.kind, b.bricks)]))
  return (source) => {
    if (!isTemplateSource(source)) return byId.get(source) ?? UNKNOWN_SIZE
    const tpl = templateOf(source)
    return tpl ? sourceSize(tpl.baseplate, tpl.tags, tpl.kind, tpl.bricks) : UNKNOWN_SIZE
  }
}

/**
 * Bake-cache keys of every model a city placement can show right now: all templates and the current
 * version of every saved blueprint. Anything else in the cache is stale (see `evictBakes`).
 */
export function liveBakeKeys(data: Pick<SaveData, 'blueprints'>): Set<string> {
  return new Set([...TEMPLATES.map((t) => bakeKey(t.bricks)), ...data.blueprints.map((b) => bakeKey(b.bricks))])
}
