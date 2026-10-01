import * as THREE from 'three'

/**
 * Shared brick materials. Colours come from per-instance colours (`setColorAt`), so one material
 * serves every opaque brick. These are app-wide singletons: never dispose or mutate them.
 */
export const brickMaterial = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 })

/** Glass colour bricks (see `COLORS[].glass`) render with this in their own instanced group. */
export const glassMaterial = new THREE.MeshStandardMaterial({
  roughness: 0.1,
  metalness: 0,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
})

export const GHOST_OPACITY = 0.5

/**
 * The placement preview material. Each ghost owns one (its tint and emissive pulse are animated
 * per frame), so the caller disposes it on unmount.
 */
export function createGhostMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
  })
}
