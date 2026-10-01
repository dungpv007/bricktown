import * as THREE from 'three'
import type { MaterialKind } from '../core/colors'

const OPAQUE = { roughness: 0.35, metalness: 0 }
/** See-through colours (glass, trans red...): the instance colour tints a translucent brick. */
const TRANS = { roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false }
/**
 * A tiny studio "sky" for metal to reflect: bright overhead, a white horizon band, a darker floor.
 * Without something to reflect, metal under plain lights reads as dull dark gray / brown. Plain
 * pixel data (no canvas / renderer), so every renderer (scenes, thumbnails) converts it itself.
 */
function createStudioEnvironment(): THREE.DataTexture {
  const W = 128 // PMREM needs a width of at least 64 (cube size width / 4 >= 16)
  const H = 64
  const data = new Uint8Array(W * H * 4)
  const stops: Array<[number, number]> = [
    [0, 255], // straight up
    [0.42, 205],
    [0.5, 255], // horizon band
    [0.58, 150],
    [1, 70], // straight down
  ]
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H
    const i = stops.findIndex(([at]) => at >= v)
    const [a0, b0] = stops[Math.max(0, i - 1)]
    const [a1, b1] = stops[i]
    const level = Math.round(a1 === a0 ? b1 : b0 + ((v - a0) / (a1 - a0)) * (b1 - b0))
    for (let x = 0; x < W; x++) data.set([level, level, level, 255], (y * W + x) * 4)
  }
  const texture = new THREE.DataTexture(data, W, H)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** Silver / gold. */
const METAL = { roughness: 0.3, metalness: 0.7, envMap: createStudioEnvironment(), envMapIntensity: 1 }

/**
 * Shared brick materials, one per material kind (see `colorMaterialKind`), for instanced bricks
 * (Workshop, Guided). Colours come from per-instance colours (`setColorAt`), so one material
 * serves every brick of a kind. App-wide singletons: never dispose or mutate them.
 */
export const brickMaterials: Record<MaterialKind, THREE.MeshStandardMaterial> = {
  opaque: new THREE.MeshStandardMaterial(OPAQUE),
  trans: new THREE.MeshStandardMaterial(TRANS),
  metal: new THREE.MeshStandardMaterial(METAL),
}

/** Whether bricks of a material kind cast shadows (see-through ones do not). */
export const castsShadow = (kind: MaterialKind): boolean => kind !== 'trans'

export const GHOST_OPACITY = 0.5

/**
 * The placement preview material, shared like the others (compiled once, never disposed).
 * Only one ghost is shown at a time; GhostBrick sets its tint and emissive pulse each frame.
 */
export const ghostMaterial = new THREE.MeshStandardMaterial({
  roughness: 0.4,
  metalness: 0,
  transparent: true,
  opacity: GHOST_OPACITY,
  depthWrite: false,
})

/**
 * A copy of `ghostMaterial` for callers that need several differently tinted previews at once
 * (same shader settings, so three reuses the compiled program). The caller disposes it.
 */
export function createGhostMaterial(): THREE.MeshStandardMaterial {
  return ghostMaterial.clone()
}

/**
 * For baked models (`bakeBricks`), per material kind: colours live in the geometry's `color`
 * attribute. Same look as `brickMaterials`. Never dispose.
 */
export const bakedMaterials: Record<MaterialKind, THREE.MeshStandardMaterial> = {
  opaque: new THREE.MeshStandardMaterial({ ...OPAQUE, vertexColors: true }),
  trans: new THREE.MeshStandardMaterial({ ...TRANS, vertexColors: true }),
  metal: new THREE.MeshStandardMaterial({ ...METAL, vertexColors: true }),
}
