import { getTemplate } from '../content/templates'
import { bakeBricks, type BakedModel } from '../core/bake'
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

/** Footprint lookup for the core city functions; unknown sources count as one cell. */
export function makeSizeOf(data: Pick<SaveData, 'blueprints'>): (source: string) => Baseplate {
  const byId = new Map(data.blueprints.map((b) => [b.id, b.baseplate]))
  return (source) =>
    (isTemplateSource(source) ? templateOf(source)?.baseplate : byId.get(source)) ?? UNKNOWN_SIZE
}
