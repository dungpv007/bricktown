import { getTemplate } from '../content/templates'
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

const UNKNOWN_SIZE: Baseplate = { w: 8, d: 8 }

/** Footprint lookup for the core city functions; unknown sources count as one cell. */
export function makeSizeOf(data: Pick<SaveData, 'blueprints'>): (source: string) => Baseplate {
  const byId = new Map(data.blueprints.map((b) => [b.id, b.baseplate]))
  return (source) =>
    (isTemplateSource(source) ? templateOf(source)?.baseplate : byId.get(source)) ?? UNKNOWN_SIZE
}
