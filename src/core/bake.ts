import * as THREE from 'three'
import { COLORS } from './colors'
import { getPartGeometry } from './parts/geometry'
import { brickCenter, QUARTER_COS, QUARTER_SIN } from './rotation'
import type { Brick, Rot } from './types'

/**
 * Baking merges a whole brick model into one geometry per material (opaque / glass), so the City
 * can draw hundreds of buildings with a handful of draw calls. Each baked vertex carries its
 * brick's colour in a linear-space `color` attribute (render with `vertexColors` materials).
 */
export interface BakedModel {
  opaque: THREE.BufferGeometry
  /** Bricks painted with a glass colour; null when the model has none. */
  glass: THREE.BufferGeometry | null
}

const FALLBACK_HEX = '#ffffff'
const tmpColor = new THREE.Color()

/** Content key: part, position, rotation and colour of every brick (ids do not affect the geometry). */
export function bakeKey(bricks: Brick[]): string {
  return bricks.map((b) => `${b.p},${b.x},${b.y},${b.z},${b.r},${b.c}`).join(';')
}

function mergeBricks(bricks: Brick[]): THREE.BufferGeometry {
  const sources = bricks.map((b) => {
    const g = getPartGeometry(b.p)
    return g.index ? g.toNonIndexed() : g
  })
  const total = sources.reduce((n, g) => n + g.getAttribute('position').count, 0)
  const positions = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)

  let offset = 0
  bricks.forEach((b, i) => {
    const src = sources[i]
    const pos = src.getAttribute('position')
    const nor = src.getAttribute('normal')
    const [cx, cy, cz] = brickCenter(b)
    const cos = QUARTER_COS[b.r as Rot]
    const sin = QUARTER_SIN[b.r as Rot]
    tmpColor.set(COLORS[b.c]?.hex ?? FALLBACK_HEX)
    for (let v = 0; v < pos.count; v++, offset += 3) {
      const px = pos.getX(v)
      const pz = pos.getZ(v)
      positions[offset] = px * cos + pz * sin + cx
      positions[offset + 1] = pos.getY(v) + cy
      positions[offset + 2] = -px * sin + pz * cos + cz
      const nx = nor.getX(v)
      const nz = nor.getZ(v)
      normals[offset] = nx * cos + nz * sin
      normals[offset + 1] = nor.getY(v)
      normals[offset + 2] = -nx * sin + nz * cos
      colors[offset] = tmpColor.r
      colors[offset + 1] = tmpColor.g
      colors[offset + 2] = tmpColor.b
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Bakes without touching the cache. The caller owns the returned geometries and must dispose them.
 * Prefer `bakeBricks` unless the result is short-lived (e.g. thumbnails).
 */
export function bakeBricksUncached(bricks: Brick[]): BakedModel {
  const isGlass = (b: Brick) => COLORS[b.c]?.glass === true
  const glassBricks = bricks.filter(isGlass)
  return {
    opaque: mergeBricks(bricks.filter((b) => !isGlass(b))),
    glass: glassBricks.length > 0 ? mergeBricks(glassBricks) : null,
  }
}

const cache = new Map<string, BakedModel>()

/**
 * Cached by content (see `bakeKey`): equal models share one result. The geometries are shared
 * app-wide, so callers must never dispose or mutate them. Only bake what a template or saved
 * blueprint shows: `evictBakes` drops everything else (bake one-off models with `bakeBricksUncached`).
 */
export function bakeBricks(bricks: Brick[]): BakedModel {
  const key = bakeKey(bricks)
  let baked = cache.get(key)
  if (!baked) {
    baked = bakeBricksUncached(bricks)
    cache.set(key, baked)
  }
  return baked
}

/** Number of models in the bake cache. */
export function bakeCacheSize(): number {
  return cache.size
}

/**
 * Drops and disposes every cached bake whose key is not in `keep` (e.g. older versions of a
 * blueprint, deleted blueprints); returns how many were dropped. Call it only when no mounted
 * scene can still draw a dropped bake: when a scene that used the cache unmounts, keeping the keys
 * any scene may still show.
 */
export function evictBakes(keep: ReadonlySet<string>): number {
  let dropped = 0
  for (const [key, baked] of cache) {
    if (keep.has(key)) continue
    cache.delete(key)
    baked.opaque.dispose()
    baked.glass?.dispose()
    dropped++
  }
  return dropped
}
