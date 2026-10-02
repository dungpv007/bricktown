import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CELL } from '../../core/city'
import { parseKey } from '../../core/cellGraph'
import type { TerrainKind } from '../../core/terrain'
import type { CityTerrain } from '../../core/types'
import { useFrameRequest } from '../../render/frameDriver'
import { useInstanceCapacity } from '../../render/instanceCapacity'
import { useGraphics } from '../../state/useGraphics'
import { floorStudTexture } from '../maze/mazeGeometry'

/**
 * Painted ground (grass is the city plate itself): one InstancedMesh per terrain kind, one flat
 * cell-sized plate per cell. Pavement and sand are studded plates (the maze floor's stud texture);
 * water is a smooth blue tile set a little lower, over a deep blue bed, with a slow shimmer from one
 * shared material whose time uniform one `useFrame` advances. Everything here is built once and
 * shared app-wide (the drive scene draws terrain too): never disposed.
 */

const PAVEMENT = '#d9d6cf'
const SAND = '#ecd391'
const WATER = '#3d8fd9'
const WATER_BED = '#1d4f86'
/** Top heights (studs): land plates sit just above the grass, water a little below them, roads above both. */
const LAND_Y = 0.06
const WATER_Y = 0.045
const BED_Y = 0.025

let cellPlane: THREE.PlaneGeometry | null = null
/** One cell, flat (facing up), centred on the origin; UVs 0..1 (the stud texture repeats 8 times). */
function cellGeometry(): THREE.PlaneGeometry {
  if (!cellPlane) {
    cellPlane = new THREE.PlaneGeometry(CELL, CELL)
    cellPlane.rotateX(-Math.PI / 2)
  }
  return cellPlane
}

const landMaterials = new Map<'pavement' | 'sand', THREE.MeshStandardMaterial>()
function landMaterial(kind: 'pavement' | 'sand'): THREE.MeshStandardMaterial {
  let m = landMaterials.get(kind)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: kind === 'pavement' ? PAVEMENT : SAND, map: floorStudTexture(CELL, CELL), roughness: 0.75 })
    landMaterials.set(kind, m)
  }
  return m
}

let bedMaterial: THREE.MeshStandardMaterial | null = null
const waterBedMaterial = () => (bedMaterial ??= new THREE.MeshStandardMaterial({ color: WATER_BED, roughness: 1 }))

/** Seconds, shared by every water surface (one material). */
const waterTime = { value: 0 }
let surfaceMaterial: THREE.MeshStandardMaterial | null = null

/**
 * Translucent water with a cheap shimmer: two crossing sine ripples over world X/Z brighten and
 * darken the colour a little (a few multiply-adds per pixel, no textures).
 */
function waterMaterial(): THREE.MeshStandardMaterial {
  if (surfaceMaterial) return surfaceMaterial
  const m = new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.82, depthWrite: false })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWaterXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
        #else
          vWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;\nuniform float uWaterTime;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ripple = sin(vWaterXZ.x * 0.55 + uWaterTime * 1.3) * sin(vWaterXZ.y * 0.45 - uWaterTime * 0.9);
        float glint = smoothstep(0.9, 1.0, sin((vWaterXZ.x + vWaterXZ.y) * 0.35 + uWaterTime * 0.7));
        diffuseColor.rgb += 0.05 * ripple + 0.06 * glint;`,
      )
  }
  m.customProgramCacheKey = () => 'bt-water'
  surfaceMaterial = m
  return m
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const MIN_CAPACITY = 16
const tmpMatrix = new THREE.Matrix4()

function CellPlates({ keys, y, material, shadow }: { keys: string[]; y: number; material: THREE.Material; shadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = useInstanceCapacity(keys.length, MIN_CAPACITY)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    keys.forEach((key, i) => {
      const { cx, cz } = parseKey(key)
      tmpMatrix.makeTranslation((cx + 0.5) * CELL, y, (cz + 0.5) * CELL)
      mesh.setMatrixAt(i, tmpMatrix)
    })
    mesh.count = keys.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [keys, y, capacity])
  // Shared geometry/material go in through `args`: R3F's unmount dispose only frees the instance buffers.
  return <instancedMesh key={capacity} ref={ref} args={[cellGeometry(), material, capacity]} receiveShadow={shadow} />
}

/**
 * Advances the shared water shimmer (one per scene that draws water), unless motion is unwelcome or
 * the graphics settings keep the water still; while it shimmers it keeps frames coming (render on demand).
 */
function WaterClock() {
  const [reduced] = useState(reducedMotion)
  const animated = useGraphics().water
  const still = reduced || !animated
  useFrameRequest(!still, 'motion')
  useFrame((_, dt) => {
    if (!still) waterTime.value = (waterTime.value + Math.min(dt, 0.1)) % 10_000
  })
  return null
}

const EMPTY: string[] = []

/** The painted cells of a city's terrain (absent = all grass). */
export default function Terrain({ terrain }: { terrain: CityTerrain | undefined }) {
  const lists = useMemo<Record<TerrainKind, string[]>>(
    () => ({ water: terrain?.water ?? EMPTY, pavement: terrain?.pavement ?? EMPTY, sand: terrain?.sand ?? EMPTY }),
    [terrain],
  )
  return (
    <group>
      {lists.pavement.length > 0 && <CellPlates keys={lists.pavement} y={LAND_Y} material={landMaterial('pavement')} shadow />}
      {lists.sand.length > 0 && <CellPlates keys={lists.sand} y={LAND_Y} material={landMaterial('sand')} shadow />}
      {lists.water.length > 0 && (
        <>
          <CellPlates keys={lists.water} y={BED_Y} material={waterBedMaterial()} shadow={false} />
          <CellPlates keys={lists.water} y={WATER_Y} material={waterMaterial()} shadow />
          <WaterClock />
        </>
      )}
    </group>
  )
}
