import * as THREE from 'three'
import { bakedMaterials } from './materials'

/**
 * The City at night, kept cheap: no real lights, only additive glow sprites (street lamp halos and the
 * pools of light under them, car headlights) and lit windows (the see-through material gets a warm
 * emissive). The time of day (scenes/city/CitySky) sets one night factor here each frame it draws;
 * every material is hidden in daylight, so daytime costs no draw call for any of it.
 * App-wide singletons: never dispose them.
 */

let texture: THREE.Texture | null = null

/** A soft round glow: a bright core fading to nothing (made once, on first use). */
export function glowTexture(): THREE.Texture {
  if (texture) return texture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.18, 'rgba(255,255,255,0.85)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.28)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const glow = (color: string, size: number): THREE.PointsMaterial =>
  new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    map: glowTexture(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    visible: false,
  })

let mats: {
  lampHalo: THREE.PointsMaterial
  lampPool: THREE.MeshBasicMaterial
  headlight: THREE.PointsMaterial
  windows: THREE.MeshStandardMaterial
} | null = null

/** The night materials (made on first use). */
export function nightMaterials() {
  if (mats) return mats
  mats = {
    // Halo around each lamp head (world-size sprites: smaller with distance).
    lampHalo: glow('#ffd27a', 16),
    // Warm pool on the pavement under each lamp.
    lampPool: new THREE.MeshBasicMaterial({
      color: '#ffc463',
      map: glowTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false,
      visible: false,
    }),
    headlight: glow('#fff2c4', 3.2),
    // The City's copy of the see-through material (glass windows, trans bricks): same shader as
    // bakedMaterials.trans (one program), but it may glow at night without touching other scenes.
    windows: bakedMaterials.trans.clone(),
  }
  return mats
}

/** Warm window light (linear RGB) at full night. */
const WINDOW_GLOW = new THREE.Color('#ffc870')

/** The current night factor (0 day … 1 night), for code that reads it each frame (headlights). */
export const nightState = { night: 0 }

/** Applies a night factor to every night material (cheap: a few uniforms). */
export function setNight(night: number): void {
  const m = nightMaterials()
  const n = Math.min(1, Math.max(0, night))
  nightState.night = n
  const on = n > 0.02
  m.lampHalo.visible = on
  m.lampHalo.opacity = 0.95 * n
  m.lampPool.visible = on
  m.lampPool.opacity = 0.8 * n
  m.headlight.visible = on
  m.headlight.opacity = n
  m.windows.emissive.copy(WINDOW_GLOW).multiplyScalar(0.85 * n)
}
