import { deflateSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { figPreset } from './figures'
import type { SharePackage } from './share'
import {
  MAX_DECOMPRESSED_BYTES,
  compress,
  decompress,
  fromBase64Url,
  packShare,
  toBase64Url,
  unpackShare,
} from './shareCodec'
import type { Blueprint } from './types'

const bp = (over: Partial<Blueprint> = {}): Blueprint => ({
  id: 'bp_orig',
  name: 'Nhà',
  kind: 'building',
  tags: ['home'],
  baseplate: { w: 16, d: 16, c: 24 },
  bricks: [
    { id: 'secret1', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 },
    { id: 'secret2', p: 'brick_2x4', x: 4, y: 0, z: 0, r: 1, c: 15 },
    { id: 'secret3', p: 'minifig', x: 8, y: 0, z: 8, r: 2, c: 21, fig: figPreset('police') },
    { id: 'secret4', p: 'print_heart_1x1', x: 0, y: 3, z: 0, r: 0, c: 0 },
  ],
  createdAt: 1,
  updatedAt: 2,
  ...over,
})

const modelPkg = (steps?: number[][]): SharePackage => ({
  app: 'bricktown',
  v: 1,
  kind: 'model',
  name: 'Nhà',
  createdAt: 1000,
  model: steps ? { blueprint: bp(), steps } : { blueprint: bp() },
})

describe('base64url', () => {
  it('round-trips every length and uses only url-safe characters without padding', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + n * 13) % 256)
      const s = toBase64Url(bytes)
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(Array.from(fromBase64Url(s) ?? [])).toEqual(Array.from(bytes))
    }
  })
  it('encodes the bytes that need the url-safe alphabet', () => {
    expect(toBase64Url(Uint8Array.from([0xfb, 0xff, 0xbf]))).toBe('-_-_')
  })
  it('rejects characters outside the alphabet and impossible lengths', () => {
    expect(fromBase64Url('ab+c')).toBeNull()
    expect(fromBase64Url('ab/c')).toBeNull()
    expect(fromBase64Url('abc=')).toBeNull()
    expect(fromBase64Url('a b')).toBeNull()
    expect(fromBase64Url('abcde')).toBeNull() // length % 4 === 1 cannot come from whole bytes
  })
})

describe('compress / decompress', () => {
  it('round-trips unicode text', () => {
    const text = JSON.stringify({ n: 'Nhà của bé 🏠', list: Array.from({ length: 50 }, (_, i) => i) })
    expect(decompress(compress(text))).toEqual({ text })
  })
  it('reports garbage as corrupt', () => {
    expect(decompress('!!!')).toEqual({ error: 'corrupt' })
    expect(decompress('')).toEqual({ error: 'corrupt' })
    expect(decompress('AAAA')).toEqual({ error: 'corrupt' })
  })
  it('reports a truncated stream as corrupt', () => {
    const payload = compress('x'.repeat(5000) + Math.random())
    expect(decompress(payload.slice(0, Math.floor(payload.length / 2)))).toEqual({ error: 'corrupt' })
  })
  it('reports bytes that are not utf-8 as corrupt', () => {
    expect(decompress(toBase64Url(deflateSync(Uint8Array.from([0xff, 0xfe, 0xfd]))))).toEqual({ error: 'corrupt' })
  })
  it('stops a zip bomb at the size cap', () => {
    const bomb = toBase64Url(deflateSync(new Uint8Array(64 * 1024 * 1024), { level: 9 }))
    const started = Date.now()
    expect(decompress(bomb)).toEqual({ error: 'too_big' })
    expect(Date.now() - started).toBeLessThan(2000)
  })
  it('accepts text right at the cap and rejects one byte more', () => {
    expect(decompress(compress('a'.repeat(1000)), 1000)).toEqual({ text: 'a'.repeat(1000) })
    expect(decompress(compress('a'.repeat(1001)), 1000)).toEqual({ error: 'too_big' })
    expect(MAX_DECOMPRESSED_BYTES).toBe(2 * 1024 * 1024)
  })
})

describe('packShare', () => {
  it('stores bricks as tuples over a part table and a figure table', () => {
    const c = packShare(modelPkg())
    expect(c).toMatchObject({ a: 'bricktown', v: 1, k: 'model', n: 'Nhà', t: 1000 })
    expect(c.P).toEqual(['brick_2x4', 'minifig', 'print_heart_1x1'])
    expect(c.F).toEqual([figPreset('police')])
    expect(c.m?.b.b).toEqual([
      [0, 0, 0, 0, 0, 2],
      [0, 4, 0, 0, 1, 15],
      [1, 8, 0, 8, 2, 21, 0],
      [2, 0, 3, 0, 0, 0],
    ])
    expect(c.m?.b.p).toEqual([16, 16, 24])
    expect(JSON.stringify(c)).not.toContain('secret') // brick ids are not shared
  })
  it('writes steps that cover the bricks in order as step lengths', () => {
    expect(packShare(modelPkg([[0, 1], [2], [3]])).m).toMatchObject({ s: [2, 1, 1] })
    expect(packShare(modelPkg([[0, 1], [2], [3]])).m?.S).toBeUndefined()
  })
  it('writes steps in any other order in full', () => {
    const m = packShare(modelPkg([[1, 0], [2, 3]])).m
    expect(m?.S).toEqual([[1, 0], [2, 3]])
    expect(m?.s).toBeUndefined()
  })
})

describe('unpackShare', () => {
  it('restores the package with local ids and the package time', () => {
    const pkg = modelPkg([[0, 1], [2], [3]])
    const out = unpackShare(packShare(pkg)) as SharePackage
    expect(out.model?.steps).toEqual([[0, 1], [2], [3]])
    expect(out.model?.blueprint).toEqual({
      ...bp(),
      id: 'bp0',
      createdAt: 1000,
      updatedAt: 1000,
      bricks: bp().bricks.map((b, i) => ({ ...b, id: `b${i}` })),
    })
    const plain = unpackShare(packShare(modelPkg([[1, 0], [2, 3]]))) as SharePackage
    expect(plain.model?.steps).toEqual([[1, 0], [2, 3]])
  })
  it('restores mazes, including missing doors and coins', () => {
    const pkg: SharePackage = {
      app: 'bricktown', v: 1, kind: 'maze', name: 'Mê cung', createdAt: 5,
      maze: {
        maze: {
          id: 'maze_a', name: 'Mê cung', w: 7, h: 7,
          walls: ['0,0', '1,0', '6,6', '3,3'], entry: { cx: 0, cz: 1 }, exit: null,
          coins: ['2,2'], wallColor: 6, floorColor: 24, createdAt: 1, updatedAt: 2,
        },
        best: { timeMs: 4200, stars: 3 },
      },
    }
    const out = unpackShare(packShare(pkg)) as SharePackage
    expect(out.maze?.best).toEqual({ timeMs: 4200, stars: 3 })
    expect(out.maze?.maze).toEqual({
      ...pkg.maze!.maze,
      id: 'maze0',
      walls: ['0,0', '1,0', '3,3', '6,6'], // row by row
      createdAt: 5,
      updatedAt: 5,
    })
  })
  it('restores cities with placements pointing at the shared blueprints', () => {
    const pkg: SharePackage = {
      app: 'bricktown', v: 1, kind: 'city', name: '', createdAt: 7,
      city: {
        city: {
          size: 12,
          roads: ['0,0', '1,0'],
          placements: [
            { id: 'p1', source: 'bp_orig', cx: 2, cz: 3, rot: 1 },
            { id: 'p2', source: 'tpl:tree', cx: 5, cz: 5, rot: 0 },
          ],
        },
        blueprints: [bp()],
      },
    }
    const out = unpackShare(packShare(pkg)) as SharePackage
    expect(out.city?.city).toEqual({
      size: 12,
      roads: ['0,0', '1,0'],
      placements: [
        { id: 'pl0', source: 'bp0', cx: 2, cz: 3, rot: 1 },
        { id: 'pl1', source: 'tpl:tree', cx: 5, cz: 5, rot: 0 },
      ],
    })
    expect(out.city?.blueprints.map((b) => b.id)).toEqual(['bp0'])
  })
  it('never throws on junk', () => {
    const junk: unknown[] = [
      null, 0, 'x', [], {}, { k: 'model' }, { m: 1 }, { m: { b: 1 } }, { m: { b: { b: [1, null, 'x', [1e9]] } } },
      { P: 5, F: 'x', m: { b: { b: [[0, 1, 2, 3, 0, 1, 9]], p: 'x' }, s: 'x' } },
      { z: { m: { w: 1e9, h: 1e9, g: 'x' } } }, { z: { m: 5, b: 'x' } },
      { c: { s: 'x', r: [1], p: [[{}, 1, 2, 3], 5], b: [null] } }, { c: { r: 'x', p: 'x', b: 'x' } },
    ]
    for (const j of junk) expect(() => unpackShare(j)).not.toThrow()
  })
  it('does not expand step lengths that add up to more than the bricks', () => {
    const c = packShare(modelPkg([[0, 1], [2], [3]]))
    const huge = { ...c, m: { ...c.m!, s: [1e12] } }
    const started = Date.now()
    const out = unpackShare(huge) as SharePackage
    expect(Date.now() - started).toBeLessThan(200)
    expect(out.model?.steps).toBeNull() // malformed: rejected by validation
    const short = unpackShare({ ...c, m: { ...c.m!, s: [1, 1] } }) as SharePackage
    expect(short.model?.steps).toBeNull()
    const fractional = unpackShare({ ...c, m: { ...c.m!, s: [1.5, 2.5] } }) as SharePackage
    expect(fractional.model?.steps).toBeNull()
  })
  it('drops a maze grid that does not match its size', () => {
    const out = unpackShare({ a: 'bricktown', v: 1, k: 'maze', n: '', t: 0, z: { m: { n: '', w: 7, h: 7, g: '#', c: 6 } } }) as SharePackage
    expect(out.maze?.maze.walls).toBeNull()
  })
})
