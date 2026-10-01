import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { bakedMaterials, brickMaterials, castsShadow, printMaterial } from './materials'

/** Mean grey level of one row of an RGBA8 DataTexture. */
function rowLevel(tex: THREE.DataTexture, row: number): number {
  const { data, width } = tex.image as { data: Uint8Array; width: number }
  let sum = 0
  for (let x = 0; x < width; x++) sum += data[(row * width + x) * 4]
  return sum / width
}

describe('metal environment map', () => {
  it('is one shared equirect texture for instanced and baked metal, wide enough for PMREM', () => {
    const env = brickMaterials.metal.envMap
    expect(env).toBeInstanceOf(THREE.DataTexture)
    expect(bakedMaterials.metal.envMap).toBe(env)
    expect(env!.mapping).toBe(THREE.EquirectangularReflectionMapping)
    expect((env!.image as { width: number }).width).toBeGreaterThanOrEqual(64)
  })

  it('is bright overhead and dark underfoot (equirect v = 1 is straight up; DataTexture rows are not flipped)', () => {
    const env = brickMaterials.metal.envMap as THREE.DataTexture
    expect(env.flipY).toBe(false)
    const { height } = env.image as { height: number }
    const top = rowLevel(env, height - 1) // last row = v near 1 = up
    const bottom = rowLevel(env, 0) // first row = v near 0 = down
    expect(top).toBeGreaterThan(bottom + 100)
  })
})

describe('print material', () => {
  it('is one material for instanced and baked prints, cut out where the atlas is transparent', () => {
    expect(bakedMaterials.print).toBe(printMaterial)
    expect(printMaterial.alphaTest).toBeGreaterThan(0)
    expect(printMaterial.transparent).toBe(false)
    expect(printMaterial.vertexColors).toBe(false)
    expect(printMaterial.polygonOffset).toBe(true)
  })

  it('casts no shadow (the body under it does)', () => {
    expect(castsShadow('print')).toBe(false)
    expect(castsShadow('opaque')).toBe(true)
    expect(castsShadow('metal')).toBe(true)
    expect(castsShadow('trans')).toBe(false)
  })
})
