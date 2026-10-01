import { getTemplate } from '../content/templates'
import type { SaveData } from '../core/types'
import { isTemplateSource, TEMPLATE_PREFIX } from '../render/sources'

/** Which horn a vehicle honks: a car beep, a truck air horn, or a police / fire siren burst. */
export type HornKind = 'car' | 'truck' | 'police' | 'fire'

const TRUCK_WORDS = ['truck', 'bus']

/** The horn for a vehicle with these tags (and the ready-made template it came from, if any). */
export function hornKind(tags: readonly string[], templateId?: string): HornKind {
  const words = new Set([...tags, ...(templateId ? [templateId] : [])])
  const has = (...ids: string[]) => ids.some((id) => words.has(id))
  if (has('police', 'police_car')) return 'police'
  if (has('fire', 'fire_truck')) return 'fire'
  if (has(...TRUCK_WORDS)) return 'truck'
  return 'car'
}

/**
 * The horn for a drive source (`tpl:<id>` or a blueprint id). A blueprint finished from a guided
 * template honks like that template; anything the kid built from scratch gets the car horn.
 */
export function hornKindForSource(source: string, data: Pick<SaveData, 'blueprints'>): HornKind {
  if (isTemplateSource(source)) {
    const tpl = getTemplate(source.slice(TEMPLATE_PREFIX.length))
    return tpl ? hornKind(tpl.tags, tpl.id) : 'car'
  }
  const bp = data.blueprints.find((b) => b.id === source)
  if (!bp) return 'car'
  const tpl = bp.templateId ? getTemplate(bp.templateId) : undefined
  return hornKind([...bp.tags, ...(tpl?.tags ?? [])], bp.templateId)
}
