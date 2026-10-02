import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakedGeometries } from '../../core/bake'
import { scaleOf } from '../../core/city'
import type { Baseplate, Blueprint, CityPlacement } from '../../core/types'
import { selectionGlowMaterial, selectionRimMaterial } from '../../render/materials'
import { bakedModelBox, placementMatrix } from '../../render/placementTransform'
import { resolveRenderable } from '../../render/sources'
import { useHighlightPulse } from '../../render/useHighlightPulse'
import { footprintBox, PLACEHOLDER_GAP, PLACEHOLDER_HEIGHT, placeholderGeometry } from './Placements'

interface Props {
  /** The selected placement; null hides the highlight. */
  placement: CityPlacement | null
  blueprints: Blueprint[]
  sizeOf: (source: string) => Baseplate
  /** Changes whenever an action is rejected; each change shakes the highlight. */
  shakeKey: number
}

/** Rim thickness (studs) on every side: a city model is seen from much further away than a brick. */
const THICKNESS = 0.5
/** Drawn after everything else (the rim ignores depth, so it must come last). */
const RIM_ORDER = 10
const SHAKE_AMPLITUDE = 0.6
const noRaycast = () => null
const tmpMatrix = new THREE.Matrix4()

/** Scale that adds `thickness` on both sides of a span `v`. */
const grow = (v: number, thickness: number) => (v > 0 ? (v + 2 * thickness) / v : 1)

/**
 * The selected placement glows yellow inside a see-through rim, the same way the Workshop's
 * SelectionHighlight marks a brick: its shared baked geometries drawn again with the additive
 * `selectionGlowMaterial`, and a slightly bigger copy drawn last with the depth-test-free
 * `selectionRimMaterial`, so it stays visible behind taller buildings. Both pulse; the shared
 * materials and the bake cache are never copied or disposed. A grey placeholder block glows the same.
 */
export default function PlacementHighlight({ placement, blueprints, sizeOf, shakeKey }: Props) {
  const shakeRef = useHighlightPulse(shakeKey, SHAKE_AMPLITUDE)
  const modelRef = useRef<THREE.Group>(null)

  const source = placement?.source ?? null
  // The rim is drawn in model space and then scaled with the model: keep it as thick on screen.
  const k = placement ? scaleOf(placement) : 1
  const resolved = useMemo(() => (source === null ? null : resolveRenderable(source, { blueprints })), [source, blueprints])
  const model = useMemo(() => {
    if (!resolved) return null
    const box = bakedModelBox(resolved.baked)
    if (!box) return null
    const center = box.min.map((v, i) => (v + box.max[i]) / 2) as [number, number, number]
    const scale = box.min.map((v, i) => grow(box.max[i] - v, THICKNESS / k)) as [number, number, number]
    return { geometries: bakedGeometries(resolved.baked).map(([, g]) => g), center, scale }
  }, [resolved, k])

  useLayoutEffect(() => {
    const group = modelRef.current
    if (!group || !placement || !resolved) return
    placementMatrix(tmpMatrix, placement, resolved.baseplate).decompose(group.position, group.quaternion, group.scale)
  }, [placement, resolved, model])

  if (!placement) return null
  if (model) {
    const [cx, cy, cz] = model.center
    return (
      <group ref={shakeRef}>
        <group ref={modelRef}>
          {model.geometries.map((g) => (
            <mesh key={g.uuid} geometry={g} material={selectionGlowMaterial} raycast={noRaycast} dispose={null} renderOrder={RIM_ORDER - 1} />
          ))}
          <group position={model.center} scale={model.scale}>
            <group position={[-cx, -cy, -cz]}>
              {model.geometries.map((g) => (
                <mesh key={g.uuid} geometry={g} material={selectionRimMaterial} raycast={noRaycast} dispose={null} renderOrder={RIM_ORDER} />
              ))}
            </group>
          </group>
        </group>
      </group>
    )
  }
  // Nothing can draw this placement: highlight its grey placeholder block instead.
  const b = footprintBox(placement, sizeOf(placement.source))
  const w = b.x1 - b.x0 - PLACEHOLDER_GAP
  const d = b.z1 - b.z0 - PLACEHOLDER_GAP
  const h = PLACEHOLDER_HEIGHT * k
  const position: [number, number, number] = [(b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2]
  const rimPosition: [number, number, number] = [position[0], -THICKNESS, position[2]]
  return (
    <group ref={shakeRef}>
      <mesh geometry={placeholderGeometry} material={selectionGlowMaterial} position={position} scale={[w, h, d]} raycast={noRaycast} dispose={null} renderOrder={RIM_ORDER - 1} />
      <mesh
        geometry={placeholderGeometry}
        material={selectionRimMaterial}
        position={rimPosition}
        scale={[w + 2 * THICKNESS, h + 2 * THICKNESS, d + 2 * THICKNESS]}
        raycast={noRaycast}
        dispose={null}
        renderOrder={RIM_ORDER}
      />
    </group>
  )
}
