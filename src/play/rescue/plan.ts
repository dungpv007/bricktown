import { sampleCity } from '../../content/cities/sample'
import { getTemplate } from '../../content/templates'
import type { CityState, SaveData } from '../../core/types'
import { makeSizeOf, isTemplateSource, resolveSource } from '../../render/sources'
import {
  freeRoads,
  hasCandidate,
  missionSpawn,
  pickTarget,
  roadField,
  roadPath,
  type MissionKind,
  type MissionTarget,
  type SourceInfoOf,
  type Spawn,
} from './mission'

/** Everything one mission is played on: the map, the target, the start and the way there. */
export interface MissionPlan {
  kind: MissionKind
  city: CityState
  /** The kid's city had nothing for this mission: the built-in town is used. */
  builtIn: boolean
  target: MissionTarget
  spawn: Spawn
  /** Road distance to the target, per road cell (the guide arrow follows it downhill). */
  field: Map<string, number>
  /** The road cells from the start to the target (the mini map's dotted way). */
  path: string[]
}

/** Source lookups for `data`'s blueprints (and every template). */
export function sourceInfoOf(data: Pick<SaveData, 'blueprints'>): SourceInfoOf {
  const sizeOf = makeSizeOf(data)
  const cache = new Map<string, ReturnType<SourceInfoOf>>()
  return (source) => {
    if (cache.has(source)) return cache.get(source) ?? null
    const r = resolveSource(source, data)
    const templateId = isTemplateSource(source) ? source.slice(4) : undefined
    const info = r ? { kind: r.kind, templateId: templateId && getTemplate(templateId) ? templateId : undefined, size: sizeOf(source) } : null
    cache.set(source, info)
    return info
  }
}

/**
 * Plans a `kind` mission in `city` (the current one), or in the built-in town when the city has no
 * building that fits. `avoid`: the last target, not picked twice in a row when there is a choice.
 */
export function planMission(city: CityState, data: Pick<SaveData, 'blueprints'>, kind: MissionKind, avoid: string | null = null, rng: () => number = Math.random): MissionPlan {
  const infoOf = sourceInfoOf(data)
  const builtIn = !hasCandidate(city, kind, infoOf)
  const map = builtIn ? sampleCity() : city
  const roads = freeRoads(map, infoOf)
  // First a rough start (the station's road, ignoring the way) to pick a target away from it...
  const rough = missionSpawn(map, kind, infoOf, roads, new Map(), { x: (map.size * 8) / 2, z: (map.size * 8) / 2 })
  const target = pickTarget(map, kind, infoOf, { rng, from: rough, avoid })
  if (!target) throw new Error('rescue: no target in the mission map') // the built-in town always has one
  // ...then the real start, on the road network that leads there, facing the way.
  const field = roadField(roads, target.road)
  const spawn = missionSpawn(map, kind, infoOf, roads, field, target.ring)
  const path = spawn.road ? roadPath(field, spawn.road) : []
  return { kind, city: map, builtIn, target, spawn, field, path }
}
