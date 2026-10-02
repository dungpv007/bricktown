import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { bakeBricks, bakeBricksUncached, bakeCacheSize, bakeKey, bakedGeometries, bakeShadowBricks, disposeBaked, evictBakes } from './bake'
import { COLORS } from './colors'
import { figKey, figPreset } from './figures'
import { figureCacheSize, getFigureGeometry, peekFigureGeometry } from './parts/figureGeometry'
import { bounds } from './model'
import { bakedStudGeometry, getPartGeometry, partStuds, studVertexCount } from './parts/geometry'
import { getPrintGeometry } from './parts/printGeometry'
import { brickCenter } from './rotation'
import { platesToWorld } from './units'
import type { Brick } from './types'

const GLASS = 15
const TRANS_RED = 16
const SILVER = 28
const GOLD = 29
const STUD_HEIGHT = 0.17
const EPS = 0.02 // body inset (0.01 per side) plus float noise

const b = (id: string, p: string, x: number, y: number, z: number, r: 0 | 1 | 2 | 3 = 0, c = 2): Brick => ({
  id, p, x, y, z, r, c,
})

const vertexCount = (g: THREE.BufferGeometry) => g.getAttribute('position').count
/** Vertices of one baked (low-poly) stud. */
const bakedStud = () => vertexCount(bakedStudGeometry())
/** A part's vertices as baked: its Workshop geometry with every stud swapped for the low-poly one. */
const partVertices = (p: string) => vertexCount(getPartGeometry(p)) - partStuds(p).length * (studVertexCount() - bakedStud())

describe('bakeBricks', () => {
  it('merges all opaque bricks into one geometry with the summed vertex count', () => {
    const bricks = [b('a', 'brick_2x4', 0, 0, 0), b('b', 'plate_2x2', 0, 3, 0, 1), b('c', 'slope_2x2', 4, 0, 0, 2)]
    const { opaque, trans, metal } = bakeBricks(bricks)
    expect(trans).toBeNull()
    expect(metal).toBeNull()
    // The plate sits on 4 of the brick's studs: those are buried in it and left out.
    expect(vertexCount(opaque)).toBe(
      partVertices('brick_2x4') + partVertices('plate_2x2') + partVertices('slope_2x2') - 4 * bakedStud(),
    )
  })

  it('leaves out studs buried under a solid opaque brick, and keeps those under glass or beside it', () => {
    const studs = (bricks: Brick[]) => {
      const { opaque, trans } = bakeBricks(bricks)
      return vertexCount(opaque) + (trans ? vertexCount(trans) : 0)
    }
    const base = partVertices('brick_2x4') + partVertices('brick_1x1')
    // A 1x1 on a 2x4: one of eight studs hidden, whatever the 2x4's rotation.
    for (const r of [0, 1, 2, 3] as const) {
      expect(studs([b('a', 'brick_2x4', 0, 0, 0, r), b('t', 'brick_1x1', 1, 3, 1)])).toBe(base - bakedStud())
    }
    // Not touching (one plate higher), off to the side, or a glass brick on top: every stud stays.
    expect(studs([b('a', 'brick_2x4', 0, 0, 0), b('t', 'brick_1x1', 1, 4, 1)])).toBe(base)
    expect(studs([b('a', 'brick_2x4', 0, 0, 0), b('t', 'brick_1x1', 5, 3, 0)])).toBe(base)
    expect(studs([b('a', 'brick_2x4', 0, 0, 0), b('t', 'brick_1x1', 1, 3, 1, 0, GLASS)])).toBe(base)
    // A figure standing on a brick does not hide its stud.
    const fig: Brick = { ...b('f', 'minifig', 1, 3, 1), fig: figPreset('police') }
    const { opaque } = bakeBricks([b('a', 'brick_2x4', 0, 0, 0), fig])
    expect(vertexCount(opaque)).toBe(partVertices('brick_2x4') + vertexCount(getFigureGeometry(figPreset('police')).body))
  })

  it('casts shadows with a stud-less copy of the opaque and metallic bricks (cached like the bake)', () => {
    const bricks = [b('a', 'brick_2x4', 0, 0, 0), b('w', 'brick_1x1', 10, 0, 0, 0, GLASS), b('m', 'brick_1x1', 12, 0, 0, 0, SILVER)]
    const shadow = bakeShadowBricks(bricks)
    expect(vertexCount(shadow)).toBe(partVertices('brick_2x4') - 8 * bakedStud() + partVertices('brick_1x1') - bakedStud())
    expect(shadow.getAttribute('color')).toBeUndefined()
    expect(bakeShadowBricks(bricks.map((x) => ({ ...x, id: `${x.id}2` })))).toBe(shadow)
  })

  it('has position, normal and linear colour attributes', () => {
    const { opaque } = bakeBricks([b('a', 'brick_1x1', 0, 0, 0, 0, 2)])
    expect(opaque.getAttribute('normal').count).toBe(vertexCount(opaque))
    const color = opaque.getAttribute('color')
    expect(color.itemSize).toBe(3)
    const expected = new THREE.Color(COLORS[2].hex)
    expect(color.getX(0)).toBeCloseTo(expected.r, 5)
    expect(color.getY(0)).toBeCloseTo(expected.g, 5)
    expect(color.getZ(0)).toBeCloseTo(expected.b, 5)
  })

  it('puts transparent-colour bricks (glass and the trans colours) in a separate geometry', () => {
    const bricks = [
      b('a', 'brick_2x4', 0, 0, 0),
      b('w', 'window_1x2x2', 0, 3, 0, 0, GLASS),
      b('x', 'brick_1x1', 3, 0, 0, 0, TRANS_RED),
    ]
    const { opaque, trans, metal } = bakeBricks(bricks)
    expect(vertexCount(opaque)).toBe(partVertices('brick_2x4'))
    expect(trans).not.toBeNull()
    expect(vertexCount(trans!)).toBe(partVertices('window_1x2x2') + partVertices('brick_1x1'))
    expect(metal).toBeNull()
    // The tint is the colour's own hex, like any other brick.
    const expected = new THREE.Color(COLORS[TRANS_RED].hex)
    const color = trans!.getAttribute('color')
    expect(color.getX(color.count - 1)).toBeCloseTo(expected.r, 5)
    expect(color.getY(color.count - 1)).toBeCloseTo(expected.g, 5)
    expect(color.getZ(color.count - 1)).toBeCloseTo(expected.b, 5)
  })

  it('puts metallic-colour bricks in their own geometry', () => {
    const bricks = [b('a', 'brick_2x4', 0, 0, 0), b('s', 'brick_1x1', 3, 0, 0, 0, SILVER), b('g', 'plate_2x2', 0, 3, 0, 0, GOLD)]
    const { opaque, trans, metal } = bakeBricks(bricks)
    expect(vertexCount(opaque)).toBe(partVertices('brick_2x4') - 4 * bakedStud()) // under the gold plate
    expect(trans).toBeNull()
    expect(vertexCount(metal!)).toBe(partVertices('brick_1x1') + partVertices('plate_2x2'))
  })

  it('returns an empty opaque geometry and no other groups for an empty model', () => {
    const { opaque, trans, metal, print } = bakeBricks([])
    expect(vertexCount(opaque)).toBe(0)
    expect(trans).toBeNull()
    expect(metal).toBeNull()
    expect(print).toBeNull()
  })

  it('has no print geometry when no brick carries a print', () => {
    expect(bakeBricks([b('a', 'tile_2x2', 0, 0, 0), b('b', 'brick_2x4', 2, 0, 0)]).print).toBeNull()
  })

  it('bakes the prints of printed parts into their own textured geometry (any body colour)', () => {
    const bricks = [
      b('a', 'brick_2x4', 0, 0, 0),
      b('c', 'print_clock_2x2', 0, 3, 0, 0, 2),
      b('h', 'print_heart_1x1', 3, 0, 0, 0, TRANS_RED),
      b('m', 'computer_1x2', 4, 0, 0, 0, GOLD),
    ]
    const { opaque, trans, metal, print } = bakeBricks(bricks)
    // Bodies stay with their colour's material kind.
    expect(vertexCount(opaque)).toBe(partVertices('brick_2x4') + partVertices('print_clock_2x2') - 4 * bakedStud())
    expect(vertexCount(trans!)).toBe(partVertices('print_heart_1x1'))
    expect(vertexCount(metal!)).toBe(partVertices('computer_1x2'))
    // The prints keep their own colours: texture coordinates, no vertex colour.
    expect(print).not.toBeNull()
    const printVerts = (p: string) => vertexCount(getPrintGeometry(p)!)
    expect(vertexCount(print!)).toBe(printVerts('print_clock_2x2') + printVerts('print_heart_1x1') + printVerts('computer_1x2'))
    expect(print!.getAttribute('uv').count).toBe(vertexCount(print!))
    expect(print!.getAttribute('normal').count).toBe(vertexCount(print!))
    expect(print!.getAttribute('color')).toBeUndefined()
  })

  it.each([0, 1, 2, 3] as const)('places a print like the Workshop instance transform at rotation %i', (r) => {
    const brick = b('a', 'print_menu_1x2', 3, 2, 5, r)
    const [cx, cy, cz] = brickCenter(brick)
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(cx, cy, cz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r * Math.PI) / 2),
      new THREE.Vector3(1, 1, 1),
    )
    const expected = getPrintGeometry('print_menu_1x2')!.clone().applyMatrix4(matrix)
    const { print } = bakeBricks([brick])
    for (const name of ['position', 'normal', 'uv']) {
      const got = print!.getAttribute(name).array
      const want = expected.getAttribute(name).array
      expect(got.length).toBe(want.length)
      for (let i = 0; i < got.length; i++) expect(got[i]).toBeCloseTo(want[i], 4)
    }
  })

  it('bounding box matches bounds() in world units (studs poke above the top)', () => {
    const bricks = [
      b('a', 'brick_2x4', 1, 0, 2, 0),
      b('b', 'brick_2x4', 1, 3, 2, 1), // rotated a quarter turn: 2 along Z, 4 along X
      b('c', 'plate_2x2', 0, 6, 0, 3),
    ]
    const bb = bounds(bricks)!
    const { opaque } = bakeBricks(bricks)
    opaque.computeBoundingBox()
    const box = opaque.boundingBox!
    expect(Math.abs(box.min.x - bb.minX)).toBeLessThanOrEqual(EPS)
    expect(Math.abs(box.max.x - bb.maxX)).toBeLessThanOrEqual(EPS)
    expect(Math.abs(box.min.z - bb.minZ)).toBeLessThanOrEqual(EPS)
    expect(Math.abs(box.max.z - bb.maxZ)).toBeLessThanOrEqual(EPS)
    expect(box.min.y).toBeCloseTo(platesToWorld(bb.minY), 5)
    expect(box.max.y).toBeCloseTo(platesToWorld(bb.maxY) + STUD_HEIGHT, 5)
  })

  it.each([0, 1, 2, 3] as const)('matches the Workshop instance transform at rotation %i', (r) => {
    const brick = b('a', 'slope_2x4', 3, 3, 5, r)
    const [cx, cy, cz] = brickCenter(brick)
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(cx, cy, cz),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r * Math.PI) / 2),
      new THREE.Vector3(1, 1, 1),
    )
    const expected = getPartGeometry('slope_2x4').clone().applyMatrix4(matrix)
    const { opaque } = bakeBricks([brick])
    expect(vertexCount(opaque)).toBe(partVertices('slope_2x4'))
    // The body (everything but the studs, which close the part geometry) lands exactly where the Workshop draws it.
    const body = (vertexCount(expected) - partStuds('slope_2x4').length * studVertexCount()) * 3
    for (const name of ['position', 'normal']) {
      const got = opaque.getAttribute(name).array
      const want = expected.getAttribute(name).array
      for (let i = 0; i < body; i++) expect(got[i]).toBeCloseTo(want[i], 4)
    }
  })

  it('does not mutate the shared part geometry', () => {
    const source = getPartGeometry('brick_2x4')
    const before = Array.from(source.getAttribute('position').array.slice(0, 12))
    bakeBricks([b('a', 'brick_2x4', 5, 3, 7, 1)])
    expect(Array.from(source.getAttribute('position').array.slice(0, 12))).toEqual(before)
    expect(source.getAttribute('color')).toBeUndefined()
  })

  it('returns the same cached object for equal content, ignoring brick ids', () => {
    const one = bakeBricks([b('a', 'brick_2x4', 0, 0, 0), b('b', 'brick_1x1', 4, 0, 0)])
    const two = bakeBricks([b('x', 'brick_2x4', 0, 0, 0), b('y', 'brick_1x1', 4, 0, 0)])
    expect(two).toBe(one)
    const other = bakeBricks([b('a', 'brick_2x4', 0, 0, 0), b('b', 'brick_1x1', 4, 0, 1)])
    expect(other).not.toBe(one)
  })
})

describe('evictBakes', () => {
  const disposed = (g: THREE.BufferGeometry) => {
    const seen = { value: false }
    g.addEventListener('dispose', () => (seen.value = true))
    return seen
  }

  it('drops and disposes the bakes whose key is not kept; kept ones stay shared', () => {
    evictBakes(new Set()) // start from an empty cache
    const live = [b('a', 'brick_2x4', 0, 0, 0)]
    const stale = [b('a', 'brick_2x4', 0, 0, 0), b('w', 'window_1x2x2', 0, 3, 0, 0, GLASS)]
    const keep = bakeBricks(live)
    const old = bakeBricks(stale)
    const opaqueGone = disposed(old.opaque)
    const transGone = disposed(old.trans!)
    const keptGone = disposed(keep.opaque)
    expect(bakeCacheSize()).toBe(2)

    expect(evictBakes(new Set([bakeKey(live)]))).toBe(1)
    expect(bakeCacheSize()).toBe(1)
    expect(opaqueGone.value).toBe(true)
    expect(transGone.value).toBe(true)
    expect(keptGone.value).toBe(false)
    expect(bakeBricks(live)).toBe(keep)
    // The evicted model is baked afresh next time it is needed.
    expect(bakeBricks(stale)).not.toBe(old)
  })

  it('empties the cache when nothing is kept', () => {
    bakeBricks([b('a', 'brick_1x1', 0, 0, 0)])
    evictBakes(new Set())
    expect(bakeCacheSize()).toBe(0)
  })
})

describe('bakedGeometries', () => {
  it('lists the non-empty geometries with their material kind, opaque first', () => {
    const all = bakeBricks([
      b('m', 'brick_1x1', 0, 0, 0, 0, GOLD),
      b('t', 'brick_1x1', 1, 0, 0, 0, GLASS),
      b('o', 'brick_1x1', 2, 0, 0, 0, 2),
    ])
    expect(bakedGeometries(all)).toEqual([
      ['opaque', all.opaque],
      ['trans', all.trans],
      ['metal', all.metal],
    ])
    const onlyMetal = bakeBricks([b('m', 'brick_1x1', 0, 0, 0, 0, SILVER)])
    expect(bakedGeometries(onlyMetal)).toEqual([['metal', onlyMetal.metal]])
    const printed = bakeBricks([b('s', 'print_star_1x1', 0, 0, 0, 0, 4)])
    expect(bakedGeometries(printed)).toEqual([
      ['opaque', printed.opaque],
      ['print', printed.print],
    ])
    expect(bakedGeometries(bakeBricks([]))).toEqual([])
  })
})

describe('evictBakes metal and prints', () => {
  it('disposes metal and print geometries too', () => {
    evictBakes(new Set())
    const baked = bakeBricks([b('m', 'brick_1x1', 0, 0, 0, 0, SILVER), b('p', 'print_star_1x1', 1, 0, 0)])
    const seen = { metal: false, print: false }
    baked.metal!.addEventListener('dispose', () => (seen.metal = true))
    baked.print!.addEventListener('dispose', () => (seen.print = true))
    evictBakes(new Set())
    expect(seen).toEqual({ metal: true, print: true })
  })
})

describe('bakeKey', () => {
  it('joins p,x,y,z,r,c per brick', () => {
    expect(bakeKey([b('a', 'brick_2x4', 1, 2, 3, 1, 4), b('b', 'brick_1x1', 0, 0, 0)])).toBe(
      'brick_2x4,1,2,3,1,4;brick_1x1,0,0,0,0,2',
    )
  })

  it("adds a figure's look, so restyling a figure re-bakes", () => {
    const chef = { ...b('f', 'minifig', 0, 0, 0, 0, 0), fig: figPreset('chef') }
    const robber = { ...chef, fig: figPreset('robber') }
    expect(bakeKey([chef])).toBe(`minifig,0,0,0,0,0,${figKey(figPreset('chef'))}`)
    expect(bakeKey([robber])).not.toBe(bakeKey([chef]))
    expect(bakeKey([{ ...chef, fig: figPreset('chef') }])).toBe(bakeKey([chef]))
  })
})

describe('baking figures', () => {
  const fig = (id: string, preset: string, x: number, c = 2): Brick => ({ ...b(id, 'minifig', x, 0, 0, 0, c), fig: figPreset(preset) })

  it("bakes a figure's body opaque in its own vertex colours, whatever the brick colour", () => {
    const { opaque, trans, metal } = bakeBricks([fig('f', 'robber', 0, TRANS_RED)])
    expect(trans).toBeNull()
    expect(metal).toBeNull()
    const body = getFigureGeometry(figPreset('robber')).body
    expect(vertexCount(opaque)).toBe(vertexCount(body))
    const src = body.getAttribute('color')
    const out = opaque.getAttribute('color')
    for (const i of [0, Math.floor(src.count / 2), src.count - 1]) {
      expect(out.getX(i)).toBeCloseTo(src.getX(i), 5)
      expect(out.getY(i)).toBeCloseTo(src.getY(i), 5)
      expect(out.getZ(i)).toBeCloseTo(src.getZ(i), 5)
    }
  })

  it('bakes figure faces and torso prints into the print geometry, next to printed tiles', () => {
    const bricks = [fig('f', 'police', 0), b('t', 'print_star_1x1', 4, 0, 0)]
    const { print } = bakeBricks(bricks)
    expect(print).not.toBeNull()
    expect(vertexCount(print!)).toBe(vertexCount(getFigureGeometry(figPreset('police')).print) + vertexCount(getPrintGeometry('print_star_1x1')!))
  })

  it('places a figure like any brick: inside its rotated footprint, standing on its plate', () => {
    const f: Brick = { ...fig('f', 'chef', 3), z: 2, y: 3, r: 1 }
    const { opaque } = bakeBricks([f])
    opaque.computeBoundingBox()
    const bb = opaque.boundingBox!
    const [cx, , cz] = brickCenter(f)
    expect(bb.min.x).toBeGreaterThanOrEqual(cx - 0.5 - 1e-6) // rotated: 1 stud along X
    expect(bb.max.x).toBeLessThanOrEqual(cx + 0.5 + 1e-6)
    expect(bb.min.z).toBeGreaterThanOrEqual(cz - 1 - 1e-6)
    expect(bb.max.z).toBeLessThanOrEqual(cz + 1 + 1e-6)
    expect(bb.min.y).toBeCloseTo(platesToWorld(3), 2)
  })

  it('with transientFigures, bakes looks the figure cache lacks without adding them, the same as cached', () => {
    const style = { ...figPreset('chef'), legs: 9, hat: 'crown' as const }
    const brick: Brick = { ...b('f', 'minifig', 0, 0, 0), fig: style }
    expect(peekFigureGeometry(style)).toBeUndefined()
    const before = figureCacheSize()
    const transient = bakeBricksUncached([brick], { transientFigures: true })
    expect(figureCacheSize()).toBe(before)
    expect(peekFigureGeometry(style)).toBeUndefined()
    const cached = bakeBricksUncached([brick])
    expect(peekFigureGeometry(style)).toBeDefined()
    expect(vertexCount(transient.opaque)).toBe(vertexCount(cached.opaque))
    expect(vertexCount(transient.print!)).toBe(vertexCount(cached.print!))
    expect(Array.from(transient.opaque.getAttribute('color').array)).toEqual(Array.from(cached.opaque.getAttribute('color').array))
    disposeBaked(transient)
    disposeBaked(cached)
  })

  it('with transientFigures, reuses a look already cached (no rebuild)', () => {
    const style = figPreset('robber')
    const shared = getFigureGeometry(style)
    let disposedShared = false
    shared.body.addEventListener('dispose', () => (disposedShared = true))
    const baked = bakeBricksUncached([{ ...b('f', 'minifig', 0, 0, 0), fig: style }], { transientFigures: true })
    expect(disposedShared).toBe(false)
    expect(peekFigureGeometry(style)).toBe(shared)
    disposeBaked(baked)
  })
})
