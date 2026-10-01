import { describe, expect, it } from 'vitest'
import { getTemplate } from '../content/templates'
import { FIG_PRESETS, figPreset } from './figures'
import { createEmptyMaze, setEntry, setExit, type Maze } from './maze'
import { Occupancy } from './occupancy'
import {
  QR_MAX_LINK_CHARS,
  buildCityPackage,
  buildMazePackage,
  buildModelPackage,
  decodeShare,
  encodeShare,
  fitsQr,
  isShareError,
  parseShareFile,
  parseShareHash,
  parseShareText,
  shareFileName,
  shareFileText,
  shareLink,
  type SharePackage,
} from './share'
import { compress } from './shareCodec'
import { SHARE_LIMITS } from './shareImport'
import { validateTemplate } from './template'
import type { Blueprint, Brick, CityState, Template } from './types'

const BASE = 'https://bricktown.example'

function blueprint(bricks: Brick[], over: Partial<Blueprint> = {}): Blueprint {
  return {
    id: 'bp_1', name: 'Nhà của bé', kind: 'building', tags: [], baseplate: { w: 16, d: 16 },
    bricks, createdAt: 10, updatedAt: 20, ...over,
  }
}

const fromTemplate = (t: Template, over: Partial<Blueprint> = {}): Blueprint =>
  blueprint(t.bricks.map((b) => ({ ...b })), { name: t.name.vi, kind: t.kind, baseplate: { ...t.baseplate }, ...over })

/** Strips what a share does not carry (ids, timestamps) so packages can be compared. */
function comparable(pkg: SharePackage) {
  const bpOf = (b: Blueprint) => ({ ...b, id: '', createdAt: 0, updatedAt: 0, bricks: b.bricks.map((x) => ({ ...x, id: '' })) })
  return {
    ...pkg,
    model: pkg.model && { ...pkg.model, blueprint: bpOf(pkg.model.blueprint) },
    maze: pkg.maze && { ...pkg.maze, maze: { ...pkg.maze.maze, id: '', createdAt: 0, updatedAt: 0, walls: [...pkg.maze.maze.walls].sort() } },
    city: pkg.city && {
      blueprints: pkg.city.blueprints.map(bpOf),
      city: {
        ...pkg.city.city,
        placements: pkg.city.city.placements.map((p) => ({
          ...p,
          id: '',
          source: p.source.startsWith('tpl:') ? p.source : `#${pkg.city!.blueprints.findIndex((b) => b.id === p.source)}`,
        })),
      },
    },
  }
}

function roundTrip(pkg: SharePackage): SharePackage {
  const out = decodeShare(encodeShare(pkg))
  if (isShareError(out)) throw new Error(`decode failed: ${out.error}`)
  return out
}

/** Every colour family and part family a share must carry: figures, trans/metal colours, printed tiles. */
const showcase: Brick[] = [
  { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 },
  { id: 'b', p: 'window_1x2x2', x: 0, y: 3, z: 0, r: 0, c: 15 },
  { id: 'c', p: 'round_1x1', x: 5, y: 0, z: 5, r: 0, c: 16 },
  { id: 'd', p: 'round_1x1', x: 6, y: 0, z: 5, r: 0, c: 20 },
  { id: 'e', p: 'brick_1x2', x: 7, y: 0, z: 7, r: 1, c: 28 },
  { id: 'f', p: 'brick_1x2', x: 9, y: 0, z: 7, r: 3, c: 29 },
  { id: 'g', p: 'print_police_2x2', x: 0, y: 3, z: 2, r: 2, c: 0 },
  { id: 'h', p: 'print_heart_1x1', x: 12, y: 0, z: 12, r: 0, c: 0 },
  { id: 'i', p: 'minifig', x: 10, y: 0, z: 2, r: 1, c: 21, fig: figPreset('police') },
  { id: 'j', p: 'minifig', x: 12, y: 0, z: 2, r: 0, c: 4, fig: { torso: 4, legs: 1, arms: 2, face: 'wink', hat: 'crown', hatColor: 29, print: 'plain' } },
  { id: 'k', p: 'minifig', x: 13, y: 0, z: 9, r: 0, c: 0 }, // the default figure: no style
]

function playableMaze(): Maze {
  let m = createEmptyMaze(9, 9, { id: 'maze_x', name: 'Đường hầm', now: 3 })
  const e = setEntry(m, { cx: 0, cz: 1 })
  if ('maze' in e) m = e.maze
  const x = setExit(m, { cx: 8, cz: 7 })
  if ('maze' in x) m = x.maze
  return { ...m, walls: [...m.walls, '2,2', '4,4'], coins: ['3,3', '5,5'], wallColor: 28 }
}

/** A sound house of exactly `count` bricks: walls of 1x2 bricks laid in layers. */
function house(count: number): Blueprint {
  const bricks: Brick[] = []
  for (let layer = 0; bricks.length < count; layer++) {
    for (let x = 0; x < 16 && bricks.length < count; x += 2) {
      for (const z of [0, 15]) {
        if (bricks.length < count) bricks.push({ id: `h${bricks.length}`, p: 'brick_1x2', x, y: layer * 3, z, r: 1, c: (x + layer) % 4 === 0 ? 15 : 2 })
      }
    }
    for (let z = 1; z < 15 && bricks.length < count; z += 2) {
      for (const x of [0, 15]) {
        if (bricks.length < count && z + 2 <= 15) bricks.push({ id: `h${bricks.length}`, p: 'brick_1x2', x, y: layer * 3, z, r: 0, c: 0 })
      }
    }
  }
  return blueprint(bricks)
}

/** The lowest brick `make(x, y, z)` that fits on the plate: no collision, resting on something. */
function freeSpot(occ: Occupancy, bp: Blueprint, make: (x: number, y: number, z: number) => Brick): Brick | null {
  for (let y = 0; y < 48; y++) {
    for (let z = 0; z < bp.baseplate.d; z++) {
      for (let x = 0; x + 2 <= bp.baseplate.w; x++) {
        const b = make(x, y, z)
        if (!occ.collides(b) && occ.isSupported(b)) return b
      }
    }
  }
  return null
}

describe('buildModelPackage', () => {
  it('shares the blueprint without steps by default, bricks in build order', () => {
    const bp = blueprint(showcase)
    const pkg = buildModelPackage(bp, { withSteps: false }, 99)
    expect(pkg).toMatchObject({ app: 'bricktown', v: 1, kind: 'model', name: 'Nhà của bé', createdAt: 99 })
    expect(pkg.model?.steps).toBeUndefined()
    const ys = pkg.model!.blueprint.bricks.map((b) => b.y)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
    expect(new Set(pkg.model!.blueprint.bricks)).toEqual(new Set(bp.bricks))
    expect(pkg.model?.blueprint.templateId).toBeUndefined()
  })
  it('adds build steps that pass template validation', () => {
    const t = getTemplate('house_small')!
    const pkg = buildModelPackage(fromTemplate(t), { withSteps: true })
    const steps = pkg.model!.steps!
    expect(steps.length).toBeGreaterThan(1)
    const asTemplate: Template = { ...t, bricks: pkg.model!.blueprint.bricks, steps }
    expect(validateTemplate(asTemplate)).toEqual([])
  })
  it('leaves out steps a model cannot be built in (a brick floating in the air)', () => {
    const bp = blueprint([
      { id: 'a', p: 'brick_2x2', x: 0, y: 0, z: 0, r: 0, c: 1 },
      { id: 'b', p: 'brick_2x2', x: 5, y: 6, z: 5, r: 0, c: 1 },
    ])
    expect(buildModelPackage(bp, { withSteps: true }).model?.steps).toBeUndefined()
  })
})

describe('buildMazePackage', () => {
  it('shares the maze and, when given, the best run', () => {
    const m = playableMaze()
    expect(buildMazePackage(m, undefined, 5)).toEqual({ app: 'bricktown', v: 1, kind: 'maze', name: 'Đường hầm', createdAt: 5, maze: { maze: m } })
    const withBest = buildMazePackage(m, { timeMs: 12345, stars: 2 }, 5)
    expect(withBest.maze?.best).toEqual({ timeMs: 12345, stars: 2 })
  })
})

describe('buildCityPackage', () => {
  it('takes only the blueprints the placements use and drops placements of missing blueprints', () => {
    const used = blueprint([{ id: 'a', p: 'brick_2x2', x: 0, y: 0, z: 0, r: 0, c: 1 }], { id: 'bp_used' })
    const unused = blueprint([], { id: 'bp_unused' })
    const city: CityState = {
      size: 48,
      roads: ['0,0'],
      placements: [
        { id: 'p1', source: 'bp_used', cx: 1, cz: 1, rot: 0 },
        { id: 'p2', source: 'tpl:tree', cx: 4, cz: 4, rot: 2 },
        { id: 'p3', source: 'bp_deleted', cx: 6, cz: 6, rot: 0 },
        { id: 'p4', source: 'bp_used', cx: 8, cz: 8, rot: 3 },
      ],
    }
    const pkg = buildCityPackage(city, [unused, used], { name: 'Phố', now: 8 })
    expect(pkg).toMatchObject({ kind: 'city', name: 'Phố', createdAt: 8 })
    expect(pkg.city?.blueprints.map((b) => b.id)).toEqual(['bp_used'])
    expect(pkg.city?.city.placements.map((p) => p.id)).toEqual(['p1', 'p2', 'p4'])
    expect(pkg.city?.city.roads).toEqual(['0,0'])
  })
})

describe('encodeShare / decodeShare', () => {
  it('round-trips a model with figures, trans and metal colours and printed tiles', () => {
    const pkg = buildModelPackage(blueprint(showcase, { tags: ['home', 'red'], baseplate: { w: 16, d: 16, c: 10 } }), { withSteps: false }, 1)
    expect(comparable(roundTrip(pkg))).toEqual(comparable(pkg))
  })
  it('round-trips a model with build steps', () => {
    const pkg = buildModelPackage(fromTemplate(getTemplate('house_small')!), { withSteps: true }, 1)
    const out = roundTrip(pkg)
    expect(out.model?.steps).toEqual(pkg.model?.steps)
    expect(comparable(out)).toEqual(comparable(pkg))
  })
  it('round-trips a maze with its best run', () => {
    const pkg = buildMazePackage(playableMaze(), { timeMs: 9000, stars: 3 }, 2)
    expect(comparable(roundTrip(pkg))).toEqual(comparable(pkg))
  })
  it('round-trips a city with its blueprints and template placements', () => {
    const a = blueprint(showcase, { id: 'bp_a', name: 'A' })
    const b = blueprint([{ id: 'z', p: 'plate_4x4', x: 0, y: 0, z: 0, r: 0, c: 5 }], { id: 'bp_b', name: 'B', kind: 'prop', baseplate: { w: 8, d: 8 } })
    const city: CityState = {
      size: 24,
      roads: ['0,0', '1,0', '2,0', '2,1'],
      placements: [
        { id: 'p1', source: 'bp_b', cx: 4, cz: 4, rot: 1 },
        { id: 'p2', source: 'tpl:house_small', cx: 8, cz: 4, rot: 0 },
        { id: 'p3', source: 'bp_a', cx: 12, cz: 4, rot: 3 },
        { id: 'p4', source: 'bp_b', cx: 16, cz: 4, rot: 2 },
      ],
    }
    const pkg = buildCityPackage(city, [a, b], { name: 'Thành phố', now: 3 })
    expect(comparable(roundTrip(pkg))).toEqual(comparable(pkg))
  })
  it('reports garbage, foreign apps, newer versions and unknown kinds', () => {
    expect(decodeShare('')).toEqual({ error: 'corrupt' })
    expect(decodeShare('not a share link!')).toEqual({ error: 'corrupt' })
    expect(decodeShare(compress('{"a":'))).toEqual({ error: 'corrupt' })
    expect(decodeShare(compress('[1,2,3]'))).toEqual({ error: 'invalid' })
    expect(decodeShare(compress(JSON.stringify({ a: 'othergame', v: 1, k: 'model', n: '', t: 0 })))).toEqual({ error: 'unsupported' })
    expect(decodeShare(compress(JSON.stringify({ a: 'bricktown', v: 2, k: 'model', n: '', t: 0 })))).toEqual({ error: 'unsupported' })
    expect(decodeShare(compress(JSON.stringify({ a: 'bricktown', v: 1, k: 'rocket', n: '', t: 0 })))).toEqual({ error: 'unsupported' })
    expect(decodeShare(compress(JSON.stringify({ a: 'bricktown', v: 1, k: 'model', n: '', t: 0 })))).toEqual({ error: 'invalid' })
  })
  it('reports a payload far too long to be a share as too big without decoding it', () => {
    expect(decodeShare('A'.repeat(4_000_000))).toEqual({ error: 'too_big' })
  })
  it('reports a compressed bomb as too big', () => {
    const bomb = compress(JSON.stringify({ a: 'bricktown', v: 1, k: 'model', n: 'x'.repeat(3 * 1024 * 1024), t: 0 }))
    expect(decodeShare(bomb)).toEqual({ error: 'too_big' })
  })
  it('refuses a tiny payload that unpacks to hundreds of thousands of blueprints, quickly', () => {
    const blueprints = '{},'.repeat(690_000).slice(0, -1)
    const payload = compress(`{"a":"bricktown","v":1,"k":"city","n":"","t":0,"c":{"s":8,"r":[],"p":[],"b":[${blueprints}]}}`)
    expect(payload.length).toBeLessThan(4000)
    const started = performance.now()
    expect(decodeShare(payload)).toEqual({ error: 'too_big' })
    expect(performance.now() - started).toBeLessThan(500)
  })
  it('refuses a model without bricks', () => {
    const empty = buildModelPackage(blueprint([]), { withSteps: true })
    expect(decodeShare(encodeShare(empty))).toEqual({ error: 'invalid' })
  })
  it('reports unknown parts in a crafted payload as invalid', () => {
    const pkg = buildModelPackage(blueprint(showcase), { withSteps: false }, 1)
    const evil = encodeShare({ ...pkg, model: { blueprint: { ...pkg.model!.blueprint, bricks: [{ id: 'q', p: 'death_star', x: 0, y: 0, z: 0, r: 0, c: 0 }] } } })
    expect(decodeShare(evil)).toEqual({ error: 'invalid' })
  })
})

describe('links and files', () => {
  const pkg = buildModelPackage(blueprint(showcase), { withSteps: true }, 1)

  it('puts the payload in the hash of the base url', () => {
    const link = shareLink(pkg, BASE)
    expect(link).toBe(`${BASE}/#s=${encodeShare(pkg)}`)
    expect(shareLink(pkg, `${BASE}/game/`)).toBe(`${BASE}/game/#s=${encodeShare(pkg)}`)
  })
  it('reads the package back from a location hash', () => {
    const hash = new URL(shareLink(pkg, BASE)).hash
    expect(comparable(parseShareHash(hash) as SharePackage)).toEqual(comparable(pkg))
    expect(comparable(parseShareHash(hash.slice(1)) as SharePackage)).toEqual(comparable(pkg))
  })
  it('ignores hashes without a share', () => {
    expect(parseShareHash('')).toBeNull()
    expect(parseShareHash('#')).toBeNull()
    expect(parseShareHash('#menu')).toBeNull()
    expect(parseShareHash('#x=1')).toBeNull()
    expect(parseShareHash('#s=')).toEqual({ error: 'corrupt' })
    expect(parseShareHash('#s=@@@')).toEqual({ error: 'corrupt' })
  })
  it('wraps the same payload in a .bricktown file', () => {
    const text = shareFileText(pkg)
    expect(JSON.parse(text)).toEqual({ bricktown: encodeShare(pkg) })
    expect(comparable(parseShareFile(text) as SharePackage)).toEqual(comparable(pkg))
    expect(parseShareFile('nope')).toEqual({ error: 'corrupt' })
    expect(parseShareFile('{"bricktown":5}')).toEqual({ error: 'corrupt' })
    expect(parseShareFile('{"app":"bricktown","schemaVersion":2}')).toEqual({ error: 'corrupt' })
  })
  it('reads whatever a kid pastes: a link, a hash, a bare payload or file text', () => {
    const link = shareLink(pkg, BASE)
    for (const text of [link, `  ${link}\n`, new URL(link).hash, encodeShare(pkg), shareFileText(pkg)]) {
      expect(comparable(parseShareText(text) as SharePackage)).toEqual(comparable(pkg))
    }
    const wrapped = link.replace(/(.{60})/g, '$1\n ') // as a chat app or e-mail wraps it
    expect(comparable(parseShareText(wrapped) as SharePackage)).toEqual(comparable(pkg))
    expect(parseShareText('hello')).toEqual({ error: 'corrupt' })
    expect(parseShareText(`${BASE}/#menu`)).toEqual({ error: 'corrupt' })
  })
  it('refuses text far longer than any share before parsing it', () => {
    const huge = 'x'.repeat(3_000_100)
    expect(parseShareText(huge)).toEqual({ error: 'too_big' })
    expect(parseShareFile(`{"bricktown":"${huge}"}`)).toEqual({ error: 'too_big' })
    expect(parseShareHash(`#s=${huge}`)).toEqual({ error: 'too_big' })
  })
  it('names the file after the creation, keeping only safe characters', () => {
    expect(shareFileName(pkg)).toBe('Nhà của bé.bricktown')
    expect(shareFileName({ ...pkg, name: '../<b>evil</b>:*?' })).toBe('bevilb.bricktown')
    expect(shareFileName({ ...pkg, name: '   ' })).toBe('model.bricktown')
  })
  it('knows when a link is too long for a QR code', () => {
    expect(fitsQr('x'.repeat(QR_MAX_LINK_CHARS))).toBe(true)
    expect(fitsQr('x'.repeat(QR_MAX_LINK_CHARS + 1))).toBe(false)
  })
})

describe('link length', () => {
  it('fits a 200-brick house with build steps in a QR code', () => {
    const bp = house(200)
    expect(bp.bricks).toHaveLength(200)
    const occ = new Occupancy()
    for (const b of bp.bricks) {
      expect(occ.collides(b)).toBe(false)
      occ.add(b)
    }
    const link = shareLink(buildModelPackage(bp, { withSteps: true }), BASE)
    expect(link.length).toBeLessThanOrEqual(QR_MAX_LINK_CHARS)
  })
  it('fits the sample templates in a QR code, figures included', () => {
    const lengths: Record<string, number> = {}
    for (const id of ['tree', 'car', 'house_small', 'restaurant']) {
      const t = getTemplate(id)!
      lengths[id] = shareLink(buildModelPackage(fromTemplate(t), { withSteps: true }), BASE).length
    }
    for (const n of Object.values(lengths)) expect(n).toBeLessThanOrEqual(QR_MAX_LINK_CHARS)
    // The restaurant with a figure of every preset standing on free ground.
    const r = fromTemplate(getTemplate('restaurant')!)
    const occ = Occupancy.from(r.bricks)
    const figures: Brick[] = []
    for (const preset of FIG_PRESETS) {
      const f = freeSpot(occ, r, (x, y, z): Brick => ({ id: `f_${preset.id}`, p: 'minifig', x, y, z, r: 0, c: preset.style.torso, fig: figPreset(preset.id) }))
      if (f) {
        occ.add(f)
        figures.push(f)
      }
    }
    expect(figures).toHaveLength(FIG_PRESETS.length)
    const withFigs = buildModelPackage({ ...r, bricks: [...r.bricks, ...figures] }, { withSteps: true })
    expect(withFigs.model?.steps).toBeDefined()
    expect(comparable(roundTrip(withFigs))).toEqual(comparable(withFigs))
    expect(shareLink(withFigs, BASE).length).toBeLessThanOrEqual(QR_MAX_LINK_CHARS)
  })
})

describe('the brick limit', () => {
  it('shares and checks a model of the maximum size, with steps, quickly', () => {
    const bricks: Brick[] = []
    for (let y = 0; bricks.length < SHARE_LIMITS.bricks; y += 3) {
      for (let x = 0; x < 48 && bricks.length < SHARE_LIMITS.bricks; x += 4) {
        for (let z = 0; z < 48 && bricks.length < SHARE_LIMITS.bricks; z += 2) {
          bricks.push({ id: `b${bricks.length}`, p: 'brick_2x4', x, y, z, r: 1, c: (x + y + z) % 30 })
        }
      }
    }
    const started = performance.now()
    const pkg = buildModelPackage(blueprint(bricks, { baseplate: { w: 48, d: 48 } }), { withSteps: true })
    expect(pkg.model?.steps).toBeDefined()
    const out = roundTrip(pkg)
    expect(out.model?.blueprint.bricks).toHaveLength(SHARE_LIMITS.bricks)
    expect(performance.now() - started).toBeLessThan(1500)
  })
})

describe('worst case', () => {
  it('checks a city of 60 full blueprints in reasonable time', () => {
    const bricks: Brick[] = []
    for (let y = 0; bricks.length < SHARE_LIMITS.bricks; y += 3) {
      for (let x = 0; x < 48 && bricks.length < SHARE_LIMITS.bricks; x += 4) {
        for (let z = 0; z < 48 && bricks.length < SHARE_LIMITS.bricks; z += 2) {
          bricks.push({ id: `b${bricks.length}`, p: 'brick_2x4', x, y, z, r: 1, c: (x + y + z) % 30 })
        }
      }
    }
    const bps = Array.from({ length: SHARE_LIMITS.cityBlueprints }, (_, i) =>
      blueprint(bricks, { id: `bp_${i}`, name: `B${i}`, baseplate: { w: 48, d: 48 } }))
    const placements = bps.map((b, i) => ({ id: `p${i}`, source: b.id, cx: (i % 8) * 6, cz: Math.floor(i / 8) * 6, rot: 0 as const }))
    const pkg = buildCityPackage({ size: 48, roads: [], placements }, bps, { now: 1 })
    const payload = encodeShare(pkg)
    const started = performance.now()
    const out = decodeShare(payload)
    const ms = performance.now() - started
    expect(out).not.toHaveProperty('error')
    expect((out as SharePackage).city?.blueprints).toHaveLength(SHARE_LIMITS.cityBlueprints)
    expect(ms).toBeLessThan(3000) // a few hundred ms on a desktop: see the S1 report for tablets
  })
})
