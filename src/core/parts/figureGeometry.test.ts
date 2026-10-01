import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { COLORS } from '../colors'
import { DEFAULT_FIG, FIG_ACCESSORIES, FIG_HATS, FIG_PRESETS, SKIN_HEX, figPreset } from '../figures'
import { printUv } from '../prints'
import type { Brick, FigStyle } from '../types'
import { platesToWorld } from '../units'
import { brickBodyGeometry, brickPrintGeometry } from './brickGeometry'
import { getPart } from './catalog'
import { FIG_FACE_BAND, getFigureGeometry } from './figureGeometry'
import { getPartGeometry } from './geometry'

const part = getPart('minifig')
const H = platesToWorld(part.h)

function box(g: THREE.BufferGeometry): THREE.Box3 {
  return new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute)
}

/** Signed volume via the divergence theorem; positive when faces wind outward. */
function signedVolume(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position')
  let vol = 0
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i)
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1)
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2)
    vol += a.dot(b.cross(c)) / 6
  }
  return vol
}

/** Distinct vertex colours, as rounded linear rgb strings. */
function colorsOf(g: THREE.BufferGeometry): Set<string> {
  const c = g.getAttribute('color')
  const out = new Set<string>()
  for (let i = 0; i < c.count; i++) out.add(key(c.getX(i), c.getY(i), c.getZ(i)))
  return out
}
const key = (r: number, g: number, b: number) => [r, g, b].map((v) => v.toFixed(3)).join(',')
const linear = (hex: string) => {
  const c = new THREE.Color(hex)
  return key(c.r, c.g, c.b)
}
const colorOf = (id: number) => linear(COLORS[id].hex)

/** Every style worth checking: the presets plus each hat and accessory on the default figure. */
const STYLES: Array<[string, FigStyle]> = [
  ...FIG_PRESETS.map((p): [string, FigStyle] => [p.id, p.style]),
  ...FIG_HATS.map((hat): [string, FigStyle] => [`hat ${hat}`, { ...DEFAULT_FIG, hat }]),
  ...FIG_ACCESSORIES.map((accessory): [string, FigStyle] => [`accessory ${accessory}`, { ...DEFAULT_FIG, accessory }]),
]

describe('getFigureGeometry', () => {
  it('builds a vertex-coloured body: position, normal and color for every vertex', () => {
    const { body } = getFigureGeometry(DEFAULT_FIG)
    const n = body.getAttribute('position').count
    expect(n).toBeGreaterThan(0)
    expect(body.getAttribute('normal').count).toBe(n)
    expect(body.getAttribute('color').count).toBe(n)
    for (const v of body.getAttribute('position').array) expect(Number.isFinite(v)).toBe(true)
  })

  it('is cached by look: equal styles share one geometry, different ones do not', () => {
    const a = getFigureGeometry(figPreset('chef'))
    expect(getFigureGeometry(figPreset('chef'))).toBe(a)
    expect(getFigureGeometry({ ...figPreset('chef'), arms: figPreset('chef').torso })).toBe(a)
    expect(getFigureGeometry(figPreset('robber'))).not.toBe(a)
  })

  it('fits the 2x1 footprint and 12 plate height, standing on the bottom, for every style', () => {
    for (const [name, style] of STYLES) {
      const { body, print } = getFigureGeometry(style)
      const bb = box(body).union(box(print))
      expect(bb.min.x, name).toBeGreaterThanOrEqual(-part.w / 2 - 1e-6)
      expect(bb.max.x, name).toBeLessThanOrEqual(part.w / 2 + 1e-6)
      expect(bb.min.z, name).toBeGreaterThanOrEqual(-part.d / 2 - 1e-6)
      expect(bb.max.z, name).toBeLessThanOrEqual(part.d / 2 + 1e-6)
      expect(bb.max.y, name).toBeLessThanOrEqual(H / 2 + 1e-6)
      expect(Math.abs(box(body).min.y + H / 2), name).toBeLessThan(0.01)
    }
  })

  it('winds its faces outward for every style', () => {
    for (const [name, style] of STYLES) expect(signedVolume(getFigureGeometry(style).body), name).toBeGreaterThan(0)
  })

  it('colours the head and hands yellow, and the torso, legs and hat in the style colours', () => {
    const style: FigStyle = { torso: 2, legs: 3, arms: 5, face: 'smile', hat: 'cap', hatColor: 13, print: 'plain' }
    const colors = colorsOf(getFigureGeometry(style).body)
    for (const c of [linear(SKIN_HEX), colorOf(2), colorOf(3), colorOf(5), colorOf(13)]) expect(colors).toContain(c)
    // A bare head shows no hat colour.
    expect(colorsOf(getFigureGeometry({ ...style, hat: 'none' }).body)).not.toContain(colorOf(13))
  })

  it('wraps the face print round the front of the head, at head height', () => {
    const style = figPreset('robber')
    const { print } = getFigureGeometry(style)
    const face = printUv('fig_face_grin')
    const pos = print.getAttribute('position')
    const nor = print.getAttribute('normal')
    const uv = print.getAttribute('uv')
    let faceVerts = 0
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      if (u < face.u0 - 1e-6 || u > face.u1 + 1e-6 || v < face.v0 - 1e-6 || v > face.v1 + 1e-6) continue
      faceVerts++
      const y = pos.getY(i) + H / 2
      expect(y).toBeGreaterThanOrEqual(FIG_FACE_BAND.y0 - 1e-6)
      expect(y).toBeLessThanOrEqual(FIG_FACE_BAND.y1 + 1e-6)
      expect(nor.getZ(i)).toBeGreaterThanOrEqual(-1e-6) // front half only
    }
    expect(faceVerts).toBeGreaterThan(0)
  })

  it('puts the torso print on the chest, facing front; a plain torso has none', () => {
    const torsoUv = printUv('fig_torso_stripes')
    const inTorso = (g: THREE.BufferGeometry) => {
      const uv = g.getAttribute('uv')
      const nor = g.getAttribute('normal')
      let n = 0
      for (let i = 0; i < uv.count; i++) {
        if (uv.getX(i) >= torsoUv.u0 - 1e-6 && uv.getX(i) <= torsoUv.u1 + 1e-6 && uv.getY(i) >= torsoUv.v0 - 1e-6 && uv.getY(i) <= torsoUv.v1 + 1e-6) {
          expect(nor.getZ(i)).toBeCloseTo(1)
          n++
        }
      }
      return n
    }
    expect(inTorso(getFigureGeometry(figPreset('robber')).print)).toBeGreaterThan(0)
    expect(inTorso(getFigureGeometry({ ...figPreset('robber'), print: 'plain' }).print)).toBe(0)
  })

  it('the minifig part geometry is the default figure', () => {
    expect(getPartGeometry('minifig')).toBe(getFigureGeometry(DEFAULT_FIG).body)
  })
})

describe('brick geometry', () => {
  const fig = (style?: FigStyle): Brick => ({ id: 'f', p: 'minifig', x: 0, y: 0, z: 0, r: 0, c: 0, ...(style ? { fig: style } : {}) })

  it('a figure brick draws its own style; other bricks their part', () => {
    expect(brickBodyGeometry(fig(figPreset('chef')))).toBe(getFigureGeometry(figPreset('chef')).body)
    expect(brickPrintGeometry(fig(figPreset('chef')))).toBe(getFigureGeometry(figPreset('chef')).print)
    expect(brickBodyGeometry(fig())).toBe(getFigureGeometry(DEFAULT_FIG).body)
    const plain: Brick = { id: 'b', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }
    expect(brickBodyGeometry(plain)).toBe(getPartGeometry('brick_2x4'))
    expect(brickPrintGeometry(plain)).toBeNull()
  })
})
