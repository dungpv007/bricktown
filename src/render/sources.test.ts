import { describe, expect, it } from 'vitest'
import { getTemplate } from '../content/templates'
import { bakeKey } from '../core/bake'
import type { Blueprint } from '../core/types'
import { isTemplateSource, liveBakeKeys, makeSizeOf, resolveRenderable, resolveSource, templateSource } from './sources'

const bp: Blueprint = {
  id: 'bp1',
  name: 'Nhà của Bin',
  kind: 'building',
  tags: [],
  baseplate: { w: 32, d: 16 },
  bricks: [{ id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 1 }],
  createdAt: 1,
  updatedAt: 2,
}
const data = { blueprints: [bp] }

describe('resolveSource', () => {
  it('resolves tpl:<id> to the ready-made template, named in the given language', () => {
    const house = getTemplate('house_small')!
    const r = resolveSource('tpl:house_small', data, 'en')
    expect(r).toEqual({ name: house.name.en, kind: house.kind, baseplate: house.baseplate, bricks: house.bricks })
    expect(resolveSource('tpl:house_small', data)?.name).toBe(house.name.vi)
  })
  it('resolves anything else to a blueprint by id', () => {
    expect(resolveSource('bp1', data)).toEqual({
      name: bp.name,
      kind: 'building',
      baseplate: bp.baseplate,
      bricks: bp.bricks,
    })
  })
  it('returns null for unknown templates and deleted blueprints', () => {
    expect(resolveSource('tpl:nope', data)).toBeNull()
    expect(resolveSource('gone', data)).toBeNull()
  })
})

describe('template source ids', () => {
  it('round-trips the tpl: prefix', () => {
    expect(templateSource('car')).toBe('tpl:car')
    expect(isTemplateSource('tpl:car')).toBe(true)
    expect(isTemplateSource('bp1')).toBe(false)
  })
})

describe('makeSizeOf', () => {
  it('looks up template and blueprint baseplates, one cell for unknown sources', () => {
    const sizeOf = makeSizeOf(data)
    expect(sizeOf('tpl:restaurant')).toEqual({ w: 32, d: 32 })
    expect(sizeOf('bp1')).toEqual({ w: 32, d: 16 })
    expect(sizeOf('gone')).toEqual({ w: 8, d: 8 })
    expect(sizeOf('tpl:nope')).toEqual({ w: 8, d: 8 })
  })
})

describe('resolveRenderable', () => {
  it('resolves and bakes templates and blueprints', () => {
    const r = resolveRenderable('bp1', data)
    expect(r?.name).toBe(bp.name)
    expect(r?.baked.opaque.getAttribute('position').count).toBeGreaterThan(0)
    expect(resolveRenderable('tpl:tree', data)?.kind).toBe('prop')
  })
  it('returns null for missing sources and for blueprints that cannot be baked', () => {
    expect(resolveRenderable('gone', data)).toBeNull()
    const broken: Blueprint = { ...bp, id: 'bp2', bricks: [{ id: 'x', p: 'no_such_part', x: 0, y: 0, z: 0, r: 0, c: 1 }] }
    expect(resolveSource('bp2', { blueprints: [broken] })).not.toBeNull()
    expect(resolveRenderable('bp2', { blueprints: [broken] })).toBeNull()
  })
})

describe('liveBakeKeys', () => {
  it('holds the bake key of every template and every saved blueprint (current version only)', () => {
    const keys = liveBakeKeys(data)
    expect(keys.has(bakeKey(bp.bricks))).toBe(true)
    expect(keys.has(bakeKey(getTemplate('house_small')!.bricks))).toBe(true)
    const older = [{ id: 'a', p: 'brick_2x4', x: 4, y: 0, z: 0, r: 0 as const, c: 1 }]
    expect(keys.has(bakeKey(older))).toBe(false)
  })
})
