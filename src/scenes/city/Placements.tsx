import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bakedGeometries, bakeShadowBricks, type BakedKind, type BakedModel } from '../../core/bake'
import { CELL, drawScale, placementCells } from '../../core/city'
import type { Baseplate, Blueprint, CityPlacement } from '../../core/types'
import { useInstanceCapacity } from '../../render/instanceCapacity'
import { bakedMaterials, castsShadow } from '../../render/materials'
import { placementMatrix } from '../../render/placementTransform'
import { registerShadowProxy } from '../../render/shadowProxies'
import { makeSizeOf, resolveRenderable, type RenderableSource } from '../../render/sources'

/** Height (studs) of a baked model, at least 1. */
export function bakedHeight(baked: BakedModel): number {
  let top = 0
  for (const [, g] of bakedGeometries(baked)) {
    if (!g.boundingBox) g.computeBoundingBox()
    top = Math.max(top, g.boundingBox?.max.y ?? 0)
  }
  return Math.max(1, top)
}

/** Height (studs) of the grey block shown for a placement whose model cannot be drawn (x its size). */
export const PLACEHOLDER_HEIGHT = 2

/** World-space footprint (studs) of a placement: its rotated (and scaled) footprint cells. */
export function footprintBox(
  p: Pick<CityPlacement, 'cx' | 'cz' | 'rot' | 's' | 'fit'>,
  baseplate: Baseplate,
): { x0: number; z0: number; x1: number; z1: number } {
  const { cw, cd } = placementCells(p, baseplate)
  return { x0: p.cx * CELL, z0: p.cz * CELL, x1: (p.cx + cw) * CELL, z1: (p.cz + cd) * CELL }
}

const MIN_CAPACITY = 8
/** With shadow stand-ins, models lower than this (studs, at x1) cast no shadow. */
const MIN_SHADOW_HEIGHT = 3.5

const tmpMatrix = new THREE.Matrix4()

function BakedInstances({
  geometry,
  kind,
  baseplate,
  placements,
  shadow = castsShadow(kind),
  proxy = false,
  material = bakedMaterials[kind],
}: {
  geometry: THREE.BufferGeometry
  kind: BakedKind
  baseplate: Baseplate
  placements: CityPlacement[]
  /** Casts a shadow (by default: when its material kind does). */
  shadow?: boolean
  /** A shadow stand-in: drawn into the shadow map only (see render/shadowProxies). */
  proxy?: boolean
  /** The kind's shared material, or a scene's own copy of it (the City's night windows). */
  material?: THREE.Material
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = useInstanceCapacity(placements.length, MIN_CAPACITY)
  // A new geometry (the blueprint was edited) recreates the mesh, so it needs its matrices again.
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    placements.forEach((p, i) => mesh.setMatrixAt(i, placementMatrix(tmpMatrix, p, baseplate)))
    mesh.count = placements.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.boundingBox = null
  }, [placements, baseplate, capacity, geometry])
  useLayoutEffect(() => (proxy && ref.current ? registerShadowProxy(ref.current) : undefined), [proxy, capacity])

  // Geometry (bake cache) and materials are shared app-wide. Passed through `args`, R3F's unmount
  // dispose only frees this mesh's own instance buffers, never them.
  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[geometry, material, capacity]}
      castShadow={shadow}
      receiveShadow={!proxy}
    />
  )
}

function SourceGroup({
  source,
  placements,
  shadowProxies,
  transMaterial,
}: {
  source: RenderableSource
  placements: CityPlacement[]
  shadowProxies: boolean
  transMaterial?: THREE.Material
}) {
  const { baked, baseplate, bricks } = source
  // Low models (flower beds, bushes) cast none: their shadow would be a smudge nobody misses.
  const proxy = useMemo(
    () => (shadowProxies && bakedHeight(baked) >= MIN_SHADOW_HEIGHT ? bakeShadowBricks(bricks) : null),
    [shadowProxies, baked, bricks],
  )
  return (
    <>
      {bakedGeometries(baked).map(([kind, geometry]) => (
        <BakedInstances
          key={kind}
          geometry={geometry}
          kind={kind}
          baseplate={baseplate}
          placements={placements}
          shadow={!shadowProxies && castsShadow(kind)}
          material={kind === 'trans' && transMaterial ? transMaterial : bakedMaterials[kind]}
        />
      ))}
      {proxy && proxy.getAttribute('position').count > 0 && (
        <BakedInstances key="shadow" geometry={proxy} kind="opaque" baseplate={baseplate} placements={placements} shadow proxy />
      )}
    </>
  )
}

// Shared app-wide (also used by the drive scene): never disposed.
export const placeholderGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const placeholderMaterial = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.8, metalness: 0 })
const NO_ROTATION = new THREE.Quaternion()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
/** Inset so neighbouring placeholders read as separate blocks. */
export const PLACEHOLDER_GAP = 0.5

/** Grey blocks for placements whose blueprint is gone or broken, so they stay visible and erasable. */
function Placeholders({ placements, sizeOf }: { placements: CityPlacement[]; sizeOf: (source: string) => Baseplate }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = useInstanceCapacity(placements.length, MIN_CAPACITY)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    placements.forEach((p, i) => {
      const b = footprintBox(p, sizeOf(p.source))
      tmpPos.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2)
      tmpScale.set(b.x1 - b.x0 - PLACEHOLDER_GAP, PLACEHOLDER_HEIGHT * drawScale(p), b.z1 - b.z0 - PLACEHOLDER_GAP)
      mesh.setMatrixAt(i, tmpMatrix.compose(tmpPos, NO_ROTATION, tmpScale))
    })
    mesh.count = placements.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [placements, sizeOf, capacity])
  return (
    <instancedMesh key={capacity} ref={ref} args={[placeholderGeometry, placeholderMaterial, capacity]} castShadow receiveShadow />
  )
}

/**
 * Every city placement, drawn with its baked model: one InstancedMesh per source and material kind.
 * A scaled placement is the same shared geometry with a bigger instance matrix (see `placementMatrix`).
 * Placements whose source is missing or cannot be baked show as grey placeholder blocks.
 */
/**
 * With `shadowProxies`, models cast their shadows through stud-less stand-ins (see
 * render/shadowProxies): the scene must call `installShadowProxies` on its renderer.
 */
export default function Placements({
  placements,
  blueprints,
  shadowProxies = false,
  transMaterial,
}: {
  placements: CityPlacement[]
  blueprints: Blueprint[]
  shadowProxies?: boolean
  /** Replaces the shared see-through material (the City's, which glows at night). */
  transMaterial?: THREE.Material
}) {
  const { drawable, missing } = useMemo(() => {
    const bySource = new Map<string, CityPlacement[]>()
    for (const p of placements) {
      let list = bySource.get(p.source)
      if (!list) bySource.set(p.source, (list = []))
      list.push(p)
    }
    const drawable: Array<[string, RenderableSource, CityPlacement[]]> = []
    const missing: CityPlacement[] = []
    for (const [source, list] of bySource) {
      const r = resolveRenderable(source, { blueprints })
      if (r) drawable.push([source, r, list])
      else missing.push(...list)
    }
    return { drawable, missing }
  }, [placements, blueprints])
  const sizeOf = useMemo(() => makeSizeOf({ blueprints }), [blueprints])

  return (
    <group>
      {drawable.map(([source, r, list]) => (
        <SourceGroup key={source} source={r} placements={list} shadowProxies={shadowProxies} transMaterial={transMaterial} />
      ))}
      {missing.length > 0 && <Placeholders placements={missing} sizeOf={sizeOf} />}
    </group>
  )
}
