import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { CELL } from '../../core/city'
import { isSolidBox, placementWorldBox, type Box } from '../../core/drive'
import type { Blueprint, CityState } from '../../core/types'
import { bakedModelBox } from '../../render/placementTransform'
import { resolveRenderable } from '../../render/sources'

/** How far the ground reaches past the city plate (matches the land drawn by CityGround). */
const GROUND_BORDER = 200
const GROUND_HALF_HEIGHT = 1
const WALL_HEIGHT = 6
const WALL_THICKNESS = 2
/** Low friction on buildings so a car scrapes along a wall instead of climbing it. */
const BUILDING_FRICTION = 0.2

interface Solid {
  id: string
  center: [number, number, number]
  half: [number, number, number]
}

/**
 * Static physics for the city: a ground slab under the plate and the land around it, invisible
 * walls at the plate edge, and one fixed box per placed model taller than `MIN_SOLID_HEIGHT` (its baked
 * bounding box, turned and moved like the drawn model).
 */
export default function CityColliders({ city, blueprints }: { city: CityState; blueprints: Blueprint[] }) {
  const solids = useMemo<Solid[]>(() => {
    const boxes = new Map<string, { box: Box; baseplate: { w: number; d: number } } | null>()
    const boxOf = (source: string) => {
      if (!boxes.has(source)) {
        // Safe resolver: a model with a part this version does not know gets no collider (the city shows a placeholder).
        const r = resolveRenderable(source, { blueprints })
        const box = r ? bakedModelBox(r.baked) : null
        boxes.set(source, r && box ? { box, baseplate: r.baseplate } : null)
      }
      return boxes.get(source) ?? null
    }
    const out: Solid[] = []
    for (const p of city.placements) {
      const m = boxOf(p.source)
      if (!m) continue // deleted blueprint / unknown template or part: nothing drawn, nothing to hit
      // Flat decorations (a one-plate garden) are driven over, not bumped into.
      if (!isSolidBox(m.box)) continue
      const { min, max } = placementWorldBox(p, m.baseplate, m.box)
      out.push({
        id: p.id,
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
        half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
      })
    }
    return out
  }, [city.placements, blueprints])

  const span = city.size * CELL
  const mid = span / 2
  const groundHalf = mid + GROUND_BORDER
  const wallHalfLen = mid + WALL_THICKNESS
  const wallY = WALL_HEIGHT / 2
  const t = WALL_THICKNESS / 2

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[groundHalf, GROUND_HALF_HEIGHT, groundHalf]} position={[mid, -GROUND_HALF_HEIGHT, mid]} friction={1} />
      <CuboidCollider args={[t, wallY, wallHalfLen]} position={[-t, wallY, mid]} friction={BUILDING_FRICTION} />
      <CuboidCollider args={[t, wallY, wallHalfLen]} position={[span + t, wallY, mid]} friction={BUILDING_FRICTION} />
      <CuboidCollider args={[wallHalfLen, wallY, t]} position={[mid, wallY, -t]} friction={BUILDING_FRICTION} />
      <CuboidCollider args={[wallHalfLen, wallY, t]} position={[mid, wallY, span + t]} friction={BUILDING_FRICTION} />
      {solids.map((s) => (
        <CuboidCollider key={s.id} args={s.half} position={s.center} friction={BUILDING_FRICTION} />
      ))}
    </RigidBody>
  )
}
