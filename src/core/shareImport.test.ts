import { describe, expect, it } from 'vitest'
import { MAX_CITIES, addCity, currentCity, emptyCity } from './cities'
import { figPreset } from './figures'
import { createEmptyMaze, setEntry, setExit, type Maze } from './maze'
import { MAX_HEIGHT_PLATES } from './model'
import { createEmptySave } from './serialize'
import { buildCityPackage, buildMazePackage, buildModelPackage, decodeShare, encodeShare, type SharePackage } from './share'
import { compress, packShare } from './shareCodec'
import { DEFAULT_SHARE_NAMES, SHARE_LIMITS, applyImport, planImport, sanitizeName, validatePackage } from './shareImport'
import { validateTemplate } from './template'
import type { Blueprint, Brick, CityState, SaveData } from './types'

const brick = (over: Partial<Brick> = {}): Brick => ({ id: 'a', p: 'brick_2x2', x: 0, y: 0, z: 0, r: 0, c: 2, ...over })

function blueprint(bricks: Brick[], over: Partial<Blueprint> = {}): Blueprint {
  return {
    id: 'bp_1', name: 'Xe', kind: 'vehicle', tags: [], baseplate: { w: 8, d: 16 },
    bricks, createdAt: 10, updatedAt: 20, ...over,
  }
}

const tower: Brick[] = [
  brick({ id: 'a' }),
  brick({ id: 'b', y: 3, c: 15 }),
  brick({ id: 'c', p: 'minifig', x: 3, z: 3, c: 21, fig: figPreset('police') }),
  brick({ id: 'd', p: 'print_star_1x1', y: 6, c: 0 }),
]

const modelPkg = (bricks: Brick[] = tower, over: Partial<Blueprint> = {}, withSteps = false): SharePackage =>
  buildModelPackage(blueprint(bricks, over), { withSteps }, 100)

/** Replaces part of a valid package and validates the result. */
const withModel = (bp: Partial<Blueprint>, steps?: unknown) => {
  const pkg = modelPkg()
  return validatePackage({ ...pkg, model: { blueprint: { ...pkg.model!.blueprint, ...bp }, ...(steps !== undefined ? { steps } : {}) } })
}

function maze(): Maze {
  let m = createEmptyMaze(7, 7, { id: 'maze_1', name: 'Mê', now: 1 })
  const e = setEntry(m, { cx: 0, cz: 1 })
  if ('maze' in e) m = e.maze
  const x = setExit(m, { cx: 6, cz: 5 })
  if ('maze' in x) m = x.maze
  return { ...m, coins: ['3,3'] }
}

const withMaze = (over: Partial<Maze>, best?: unknown) =>
  validatePackage({ ...buildMazePackage(maze(), undefined, 1), maze: { maze: { ...maze(), ...over }, ...(best !== undefined ? { best } : {}) } })

function cityPkg(): SharePackage {
  const a = blueprint(tower, { id: 'bp_a', name: 'A' })
  const b = blueprint([brick()], { id: 'bp_b', name: 'B', kind: 'building' })
  const city: CityState = {
    size: 24,
    roads: ['0,0', '1,0'],
    placements: [
      { id: 'p1', source: 'bp_a', cx: 2, cz: 2, rot: 0 },
      { id: 'p2', source: 'tpl:tree', cx: 6, cz: 2, rot: 1 },
      { id: 'p3', source: 'bp_b', cx: 10, cz: 2, rot: 0 },
      { id: 'p4', source: 'bp_a', cx: 14, cz: 2, rot: 2 },
    ],
  }
  return buildCityPackage(city, [a, b], { name: 'Phố', now: 3 })
}

const withCity = (over: Partial<CityState>, blueprints?: Blueprint[]) => {
  const pkg = cityPkg()
  return validatePackage({ ...pkg, city: { city: { ...pkg.city!.city, ...over }, blueprints: blueprints ?? pkg.city!.blueprints } })
}

describe('sanitizeName', () => {
  it('trims, strips control and direction characters and caps the length', () => {
    expect(sanitizeName('  Nhà của bé  ')).toBe('Nhà của bé')
    expect(sanitizeName('a\u0000b\u0007c\nd\u007f\u200ee\u202Ef')).toBe('abcdef')
    expect(sanitizeName('x'.repeat(100))).toBe('x'.repeat(SHARE_LIMITS.nameLength))
    expect(Array.from(sanitizeName('🏠'.repeat(50)))).toHaveLength(40) // never splits an emoji
    expect(sanitizeName(42)).toBe('')
    expect(sanitizeName(null)).toBe('')
  })
  it('strips soft hyphens, line separators, the Arabic letter mark and tag characters', () => {
    const hidden = [0xad, 0x61c, 0x2028, 0x2029, 0xe0041, 0xe007f, 0x200b, 0xfeff]
    expect(sanitizeName(`a${String.fromCodePoint(...hidden)}b`)).toBe('ab')
  })
  it('keeps emoji sequences whole and counts them as one character each', () => {
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467) // joined by ZWJ
    expect(sanitizeName(`Nhà ${family}`)).toBe(`Nhà ${family}`)
    const cut = sanitizeName(family.repeat(50)) // 8 code units each: the 200-unit cap stops it at 25
    expect(cut).toBe(family.repeat(SHARE_LIMITS.nameUnits / family.length))
    expect(sanitizeName('\u{1F3E0}'.repeat(50))).toBe('\u{1F3E0}'.repeat(40)) // 2 units each: 40 characters
    const flag = String.fromCodePoint(0x1f1fb, 0x1f1f3) // a flag: two code points, one character
    expect(sanitizeName('x'.repeat(39) + flag + 'yyy')).toBe('x'.repeat(39) + flag)
  })
  it('falls back to the given name when nothing is left', () => {
    expect(sanitizeName('   ', 'Mô hình')).toBe('Mô hình')
    expect(sanitizeName(String.fromCodePoint(0x200b, 0x202e), 'Mê cung')).toBe('Mê cung')
    expect(sanitizeName(7, 'Thành phố')).toBe('Thành phố')
    expect(sanitizeName('An', 'Mô hình')).toBe('An')
  })
  it('caps a name at 200 UTF-16 code units without splitting a character', () => {
    const heavy = 'e' + '\u0301'.repeat(30) // one character, 31 code units
    const out = sanitizeName(heavy.repeat(40))
    expect(out.length).toBeLessThanOrEqual(SHARE_LIMITS.nameUnits)
    expect(out).toBe(heavy.repeat(Math.floor(SHARE_LIMITS.nameUnits / heavy.length)))
    expect(sanitizeName('e' + '\u0301'.repeat(300), 'Mô hình')).toBe('Mô hình') // one character too long to keep
  })
  it('never leaves a lone surrogate, from the scan limit or from the input', () => {
    const hasLone = (s: string) => /[\uD800-\uDFFF]/u.test(s)
    const cut = sanitizeName('\u200b'.repeat(4095) + '\u{1F600}', 'Mô hình') // the scan limit splits the emoji
    expect(hasLone(cut)).toBe(false)
    expect(cut).toBe('Mô hình')
    expect(sanitizeName('a\uD800b\uDC00c')).toBe('abc')
  })
  it('falls back when the name has only invisible characters', () => {
    for (const cp of [0x200d, 0xfe0f, 0x3164, 0x115f, 0x1160, 0x034f, 0x180e, 0xffa0, 0x2800, 0x17b4]) {
      expect(sanitizeName(String.fromCodePoint(cp, cp, 0x20, cp), 'Mê cung')).toBe('Mê cung')
    }
    expect(sanitizeName('A\u3164B')).toBe('AB') // Hangul fillers are stripped
    expect(sanitizeName('\u2764\uFE0F')).toBe('\u2764\uFE0F') // an emoji with its variation selector stays
  })
  it('keeps markup as plain text (names are only ever rendered as text)', () => {
    expect(sanitizeName('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
    expect(sanitizeName('<img src=x onerror=alert(1)>'.padEnd(60, 'y'))).toHaveLength(40)
  })
})

describe('validatePackage', () => {
  it('accepts what the builders produce', () => {
    for (const pkg of [modelPkg(), modelPkg(tower, {}, true), buildMazePackage(maze(), { timeMs: 5000, stars: 2 }), cityPkg()]) {
      expect(validatePackage(pkg)).not.toHaveProperty('error')
    }
  })
  it('sanitises names of the package, blueprints and mazes', () => {
    const pkg = modelPkg(tower, { name: ' <b>\u0000Xe</b> ' })
    const out = validatePackage({ ...pkg, name: '\u202Eabc'.repeat(30) }) as SharePackage
    expect(out.name).toBe('abc'.repeat(13) + 'a')
    expect(out.model?.blueprint.name).toBe('<b>Xe</b>')
    const m = withMaze({ name: 'Mê\ncung' }) as SharePackage
    expect(m.maze?.maze.name).toBe('Mêcung')
  })
  it('names creations left without a name, by kind, overridable in the kid language', () => {
    const empty = validatePackage({ ...modelPkg(tower, { name: ' ' }), name: '' }) as SharePackage
    expect(empty.name).toBe(DEFAULT_SHARE_NAMES.model)
    expect(empty.model?.blueprint.name).toBe(DEFAULT_SHARE_NAMES.model)
    const en = validatePackage({ ...modelPkg(), name: '' }, { names: { model: 'Model' } }) as SharePackage
    expect(en.name).toBe('Model')
    expect((validatePackage({ ...buildMazePackage(maze()), name: '' }) as SharePackage).name).toBe('Mê cung')
    expect((validatePackage({ ...cityPkg(), name: '' }) as SharePackage).name).toBe('Thành phố')
  })
  it('rejects anything that is not a package', () => {
    for (const raw of [null, 1, 'x', [], {}]) expect(validatePackage(raw)).toHaveProperty('error')
    expect(validatePackage({ ...modelPkg(), app: 'evil' })).toEqual({ error: 'unsupported' })
    expect(validatePackage({ ...modelPkg(), v: 3 })).toEqual({ error: 'unsupported' })
    expect(validatePackage({ ...modelPkg(), v: '1' })).toEqual({ error: 'invalid' })
    expect(validatePackage({ ...modelPkg(), kind: 'virus' })).toEqual({ error: 'unsupported' })
    expect(validatePackage({ ...modelPkg(), kind: 'maze' })).toEqual({ error: 'invalid' }) // kind without its section
    expect(validatePackage({ ...modelPkg(), createdAt: 'yesterday' })).toEqual({ error: 'invalid' })
    expect(validatePackage({ ...modelPkg(), name: { evil: true } })).toEqual({ error: 'invalid' })
  })
  it('keeps only the section of its kind', () => {
    const out = validatePackage({ ...modelPkg(), maze: buildMazePackage(maze()).maze }) as SharePackage
    expect(out.maze).toBeUndefined()
    expect(out.model).toBeDefined()
  })

  describe('models', () => {
    it('rejects unknown parts, bad colours and broken figures', () => {
      expect(withModel({ bricks: [brick({ p: 'death_star' })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ p: '__proto__' })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ c: 30 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ c: -1 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ c: 1.5 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ fig: figPreset('chef') })] })).toEqual({ error: 'invalid' }) // not a figure part
      const badFig = { ...figPreset('chef'), hat: 'tinfoil' } as unknown as Brick['fig']
      expect(withModel({ bricks: [brick({ p: 'minifig', fig: badFig })] })).toEqual({ error: 'invalid' })
      const extraKey = { ...figPreset('chef'), onClick: 'x' } as unknown as Brick['fig']
      expect(withModel({ bricks: [brick({ p: 'minifig', fig: extraKey })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [null as unknown as Brick] })).toEqual({ error: 'invalid' })
    })
    it('rejects bricks outside the plate, off the grid, too high or overlapping', () => {
      expect(withModel({ bricks: [brick({ x: -1 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ z: -2 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ y: -3 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ x: 7 })] })).toEqual({ error: 'invalid' }) // 2 wide on an 8 plate
      expect(withModel({ bricks: [brick({ x: 0.5 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ y: MAX_HEIGHT_PLATES - 2 })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ r: 4 as Brick['r'] })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ x: Infinity })] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [brick({ id: 'a' }), brick({ id: 'b', x: 1 })] })).toEqual({ error: 'invalid' })
    })
    it('rejects absurd counts and plates as too big', () => {
      const many = Array.from({ length: SHARE_LIMITS.bricks + 1 }, (_, i) => brick({ id: `b${i}`, p: 'plate_1x1', x: i % 48, y: Math.floor(i / 2304), z: Math.floor(i / 48) % 48 }))
      expect(withModel({ bricks: many, baseplate: { w: 48, d: 48 } })).toEqual({ error: 'too_big' })
      expect(withModel({ baseplate: { w: 1000, d: 16 } })).toEqual({ error: 'too_big' })
      expect(withModel({ baseplate: { w: 0, d: 16 } })).toEqual({ error: 'invalid' })
      expect(withModel({ baseplate: { w: 8, d: 16, c: 99 } })).toEqual({ error: 'invalid' })
    })
    it('rejects a model without bricks, with or without steps', () => {
      expect(withModel({ bricks: [] })).toEqual({ error: 'invalid' })
      expect(withModel({ bricks: [] }, [])).toEqual({ error: 'invalid' })
    })
    it('rejects a bad kind and drops tags that are not simple words', () => {
      expect(withModel({ kind: 'spaceship' as Blueprint['kind'] })).toEqual({ error: 'invalid' })
      const out = withModel({ tags: ['car', '<script>', 5 as unknown as string, 'fast'] }) as SharePackage
      expect(out.model?.blueprint.tags).toEqual(['car', 'fast'])
    })
    it('rejects build steps that skip bricks, repeat them or cannot be built', () => {
      expect(withModel({}, [[0, 1, 2]])).toEqual({ error: 'invalid' }) // brick 3 missing
      expect(withModel({}, [[0, 1, 2, 3, 3]])).toEqual({ error: 'invalid' })
      // The package has the bricks in build order (y first): 0 ground brick, 1 figure, 2 on 0, 3 on 2.
    expect(withModel({}, [[2], [0], [1], [3]])).toEqual({ error: 'invalid' }) // brick 2 sits on brick 0
      expect(withModel({}, [[0], [1, 2, 3, 99]])).toEqual({ error: 'invalid' })
      expect(withModel({}, 'all at once')).toEqual({ error: 'invalid' })
      expect(withModel({}, null)).toEqual({ error: 'invalid' })
      expect(withModel({}, [[0], [1], [2], [3]])).not.toHaveProperty('error')
    })
  })

  describe('mazes', () => {
    it('rejects sizes that are even or out of range', () => {
      expect(withMaze({ w: 8 })).toEqual({ error: 'invalid' })
      expect(withMaze({ h: 5 })).toEqual({ error: 'invalid' })
      expect(withMaze({ w: 23, h: 23 })).toEqual({ error: 'invalid' })
    })
    it('rejects walls, coins and doors that are off the grid or misplaced', () => {
      expect(withMaze({ walls: ['-1,0'] })).toEqual({ error: 'invalid' })
      expect(withMaze({ walls: ['9,0'] })).toEqual({ error: 'invalid' })
      expect(withMaze({ walls: ['1;1'] })).toEqual({ error: 'invalid' })
      expect(withMaze({ coins: ['0,0'] })).toEqual({ error: 'invalid' }) // on a wall
      expect(withMaze({ entry: { cx: 0, cz: 0 } })).toEqual({ error: 'invalid' }) // corner
      expect(withMaze({ entry: { cx: 3, cz: 3 } })).toEqual({ error: 'invalid' }) // not on the border
      expect(withMaze({ exit: { cx: 0, cz: 1 } })).toEqual({ error: 'invalid' }) // same as the entry
      expect(withMaze({ wallColor: 77 })).toEqual({ error: 'invalid' })
      expect(withMaze({ walls: 'everywhere' as unknown as string[] })).toEqual({ error: 'invalid' })
    })
    it('rejects a gap in the outer ring that is not a door', () => {
      expect(withMaze({ walls: maze().walls.filter((k) => k !== '3,0') })).toEqual({ error: 'invalid' })
      expect(withMaze({ walls: maze().walls.filter((k) => k !== '6,6') })).toEqual({ error: 'invalid' }) // a corner
    })
    it('rejects a maze that cannot be played: a missing door or no way through', () => {
      expect(withMaze({ entry: null })).toEqual({ error: 'invalid' })
      expect(withMaze({ exit: null })).toEqual({ error: 'invalid' })
      expect(withMaze({ entry: null, exit: null })).toEqual({ error: 'invalid' })
      const blocked = [...maze().walls, '1,1', '1,2', '1,3', '1,4', '1,5']
      expect(withMaze({ walls: blocked, coins: [] })).toEqual({ error: 'invalid' })
    })
    it('drops a best run faster than the maze allows, keeping the maze', () => {
      const out = withMaze({}, { timeMs: 100, stars: 3 }) as SharePackage
      expect(out.maze?.maze).toBeDefined()
      expect(out.maze?.best).toBeUndefined()
      const fair = withMaze({}, { timeMs: 5000, stars: 3 }) as SharePackage
      expect(fair.maze?.best).toEqual({ timeMs: 5000, stars: 3 })
    })
    it('rejects a malformed best run', () => {
      expect(withMaze({}, { timeMs: 5000, stars: 4 })).toEqual({ error: 'invalid' })
      expect(withMaze({}, { timeMs: -5, stars: 1 })).toEqual({ error: 'invalid' })
      expect(withMaze({}, { timeMs: 'fast', stars: 1 })).toEqual({ error: 'invalid' })
    })
  })

  describe('cities', () => {
    it('rejects cities that are too big or have too many blueprints', () => {
      expect(withCity({ size: SHARE_LIMITS.citySize + 1 })).toEqual({ error: 'too_big' })
      const many = Array.from({ length: SHARE_LIMITS.cityBlueprints + 1 }, (_, i) => blueprint([], { id: `bp${i}` }))
      expect(withCity({}, many)).toEqual({ error: 'too_big' })
      const roads = Array.from({ length: 24 * 24 + 1 }, (_, i) => `${i % 24},${Math.floor(i / 24) % 24}`)
      expect(withCity({ roads })).toEqual({ error: 'too_big' })
    })
    it('rejects roads and placements off the map or pointing nowhere', () => {
      expect(withCity({ size: 0 })).toEqual({ error: 'invalid' })
      expect(withCity({ roads: ['24,0'] })).toEqual({ error: 'invalid' })
      expect(withCity({ roads: ['-1,3'] })).toEqual({ error: 'invalid' })
      expect(withCity({ placements: [{ id: 'p', source: 'bp_nowhere', cx: 0, cz: 0, rot: 0 }] })).toEqual({ error: 'invalid' })
      expect(withCity({ placements: [{ id: 'p', source: 'tpl:<script>', cx: 0, cz: 0, rot: 0 }] })).toEqual({ error: 'invalid' })
      expect(withCity({ placements: [{ id: 'p', source: 'tpl:tree', cx: -1, cz: 0, rot: 0 }] })).toEqual({ error: 'invalid' })
      expect(withCity({ placements: [{ id: 'p', source: 'tpl:tree', cx: 0, cz: 0, rot: 7 as 0 }] })).toEqual({ error: 'invalid' })
    })
    it('rejects placements that overlap, sit on a road or stick out of the map', () => {
      const pkg = cityPkg()
      const [p1] = pkg.city!.city.placements // bp_a: an 8x16 plate, 1 x 2 cells at (2, 2)
      expect(withCity({ placements: [p1, { ...p1, id: 'p9', cz: 3 }] })).toEqual({ error: 'invalid' })
      expect(withCity({ placements: [p1, { id: 'p9', source: 'tpl:tree', cx: 2, cz: 3, rot: 0 }] })).toEqual({ error: 'invalid' })
      expect(withCity({ roads: ['2,3'], placements: [p1] })).toEqual({ error: 'invalid' })
      expect(withCity({ placements: [{ ...p1, cz: 23 }] })).toEqual({ error: 'invalid' }) // 2 cells deep
      expect(withCity({ placements: [{ ...p1, cx: 23, rot: 1 }] })).toEqual({ error: 'invalid' }) // turned: 2 cells wide
      expect(withCity({ placements: [{ ...p1, cx: 22, rot: 1 }] })).not.toHaveProperty('error')
    })
    it('sizes template placements with templateSize and unknown templates as one cell', () => {
      const tpl = { id: 'p8', source: 'tpl:garage', cx: 21, cz: 21, rot: 0 as const }
      const pkg = cityPkg()
      const raw = { ...pkg, city: { ...pkg.city!, city: { ...pkg.city!.city, placements: [tpl] } } }
      expect(validatePackage(raw)).not.toHaveProperty('error') // unknown here: a one-cell placeholder
      const big = { templateSize: (id: string) => (id === 'garage' ? { w: 32, d: 32 } : undefined) }
      expect(validatePackage(raw, big)).toEqual({ error: 'invalid' }) // 4 x 4 cells from (21, 21) stick out of a 24 map
      const fits = { ...raw, city: { ...raw.city, city: { ...raw.city.city, placements: [{ ...tpl, cx: 20, cz: 20 }] } } }
      expect(validatePackage(fits, big)).not.toHaveProperty('error')
    })
    it('keeps only the blueprints a placement uses', () => {
      const pkg = cityPkg()
      const extra = blueprint([brick()], { id: 'bp_extra' })
      const out = withCity({}, [...pkg.city!.blueprints, extra]) as SharePackage
      expect(out.city?.blueprints.map((b) => b.id)).toEqual(pkg.city!.blueprints.map((b) => b.id))
    })
    it('rejects a city whose blueprint is broken or whose blueprint ids repeat', () => {
      const pkg = cityPkg()
      const [a, b] = pkg.city!.blueprints
      expect(withCity({}, [a, { ...b, bricks: [brick({ p: 'nope' })] }])).toEqual({ error: 'invalid' })
      expect(withCity({}, [a, { ...b, id: a.id }])).toEqual({ error: 'invalid' })
    })
  })
})

describe('decodeShare with crafted payloads', () => {
  it('turns every malicious package into an error, never an exception', () => {
    const pkg = modelPkg()
    const evil: SharePackage[] = [
      { ...pkg, model: { blueprint: { ...pkg.model!.blueprint, bricks: [brick({ x: -5 })] } } },
      { ...pkg, model: { blueprint: { ...pkg.model!.blueprint, bricks: [brick({ p: 'laser' })] } } },
      { ...pkg, model: { blueprint: { ...pkg.model!.blueprint, baseplate: { w: 1e6, d: 1e6 } } } },
    ]
    for (const e of evil) expect(decodeShare(encodeShare(e))).toHaveProperty('error')
  })
})

describe('scaled city placements (CityPlacement.s)', () => {
  const scaledPkg = (s: unknown): SharePackage => {
    const pkg = cityPkg()
    const [p1, ...rest] = pkg.city!.city.placements
    return { ...pkg, city: { ...pkg.city!, city: { ...pkg.city!.city, placements: [{ ...p1, s } as never, ...rest] } } }
  }

  it('round-trips a scaled placement through a link, compactly (x1 stays a 4-item tuple)', () => {
    const payload = encodeShare(scaledPkg(2)) // bp_a x2: 16x32 studs, 2 x 4 cells at (2, 2)
    const out = decodeShare(payload) as SharePackage
    expect(out).not.toHaveProperty('error')
    expect(out.city!.city.placements.map((p) => p.s)).toEqual([2, undefined, undefined, undefined])
    expect(out.city!.city.placements.every((p) => 's' in p === (p.s !== undefined))).toBe(true)
    const p = (JSON.parse(JSON.stringify(packShare(scaledPkg(2)))) as { c: { p: unknown[][] } }).c.p
    expect(p.map((t) => t.length)).toEqual([5, 4, 4, 4])
    expect(packShare(scaledPkg(1)).c!.p.map((t) => t.length)).toEqual([4, 4, 4, 4])
  })

  it('old links without sizes still work', () => {
    expect(decodeShare(encodeShare(cityPkg()))).not.toHaveProperty('error')
    expect(validatePackage(scaledPkg(undefined))).not.toHaveProperty('error')
  })

  it('rejects a size that is not an integer from 1 to 10, or a scaled model that no longer fits', () => {
    for (const bad of [0, 11, -2, 2.5, 1e9, NaN, '3', null, [2], { valueOf: 3 }]) {
      expect(validatePackage(scaledPkg(bad)), String(bad)).toEqual({ error: 'invalid' })
      expect(decodeShare(encodeShare(scaledPkg(bad))), String(bad)).toHaveProperty('error')
    }
    // x10: 80x160 studs, 10 x 20 cells from (2, 2) cover the other placements and leave a 24-cell map.
    expect(validatePackage(scaledPkg(10))).toEqual({ error: 'invalid' })
    // x3 (3 x 6 cells, x 2..4) stays clear of the tree at (6, 2); x5 (5 x 10 cells, x 2..6) covers it.
    expect(validatePackage(scaledPkg(3))).not.toHaveProperty('error')
    expect(validatePackage(scaledPkg(5))).toEqual({ error: 'invalid' })
  })
})

describe('planImport / applyImport', () => {
  const existing = (): SaveData => {
    const data = createEmptySave()
    data.blueprints.push(blueprint([brick()], { id: 'bp_1', name: 'Mine' }))
    data.cities[0].city = { size: 48, roads: ['5,5'], placements: [{ id: 'old', source: 'bp_1', cx: 0, cz: 0, rot: 0 }] }
    return data
  }
  const decoded = (pkg: SharePackage): SharePackage => {
    const out = decodeShare(encodeShare(pkg))
    if ('error' in out) throw new Error(out.error)
    return out
  }

  it('adds a shared model as a new blueprint with fresh ids', () => {
    const data = existing()
    const before = structuredClone(data)
    const plan = planImport(data, decoded(modelPkg()), 500)
    expect(plan).toMatchObject({ kind: 'model', name: 'Xe', brickCount: 4 })
    if (plan.kind !== 'model') throw new Error()
    expect(plan.template).toBeUndefined()
    const next = applyImport(data, plan)
    expect(data).toEqual(before) // pure
    expect(next.blueprints).toHaveLength(2)
    const added = next.blueprints[1]
    expect(added.id).not.toBe('bp_1')
    expect(added.id).not.toBe('bp0')
    expect(added).toMatchObject({ name: 'Xe', kind: 'vehicle', createdAt: 500, updatedAt: 500 })
    expect(new Set(added.bricks.map((b) => b.id)).size).toBe(4)
    expect(added.bricks.map((b) => b.id)).not.toContain('b0')
    expect(added.bricks.find((b) => b.p === 'minifig')?.fig).toEqual(figPreset('police'))
    expect(next.sharedTemplates ?? []).toEqual([])
  })
  it('also adds a shared template when the model comes with build steps', () => {
    const data = existing()
    const plan = planImport(data, decoded(modelPkg(tower, {}, true)), 500)
    if (plan.kind !== 'model' || !plan.template) throw new Error('expected a template')
    const next = applyImport(data, plan)
    const t = next.sharedTemplates![0]
    expect(t.id).toMatch(/^shared_/)
    expect(t.name).toEqual({ vi: 'Xe', en: 'Xe' })
    expect(t.kind).toBe('vehicle')
    expect(validateTemplate(t)).toEqual([])
    const noIds = (bs: Brick[]) => bs.map((b) => ({ ...b, id: '' }))
    expect(noIds(t.bricks)).toEqual(noIds(next.blueprints[1].bricks))
    expect([1, 2, 3]).toContain(t.difficulty)
  })
  it('gives every import of the same package its own ids', () => {
    const data = existing()
    const pkg = decoded(modelPkg(tower, {}, true))
    const once = applyImport(data, planImport(data, pkg))
    const twice = applyImport(once, planImport(once, pkg))
    expect(new Set(twice.blueprints.map((b) => b.id)).size).toBe(3)
    expect(new Set(twice.sharedTemplates!.map((t) => t.id)).size).toBe(2)
  })
  it('adds a shared maze with the sender time as a challenge', () => {
    const data = existing()
    const plan = planImport(data, decoded(buildMazePackage(maze(), { timeMs: 4200, stars: 3 })), 700)
    expect(plan).toMatchObject({ kind: 'maze', name: 'Mê', challenge: { timeMs: 4200 } })
    const next = applyImport(data, plan)
    const m = next.mazes![0]
    expect(m.id).not.toBe('maze_1')
    expect(m).toMatchObject({ w: 7, h: 7, entry: { cx: 0, cz: 1 }, exit: { cx: 6, cz: 5 }, coins: ['3,3'], createdAt: 700 })
    expect([...m.walls].sort()).toEqual([...maze().walls].sort())
    expect(next.mazeChallenges).toEqual({ [m.id]: { timeMs: 4200 } })
  })
  it('adds a maze without a challenge when no best run was shared', () => {
    const data = existing()
    const next = applyImport(data, planImport(data, decoded(buildMazePackage(maze()))))
    expect(next.mazes).toHaveLength(1)
    expect(next.mazeChallenges ?? {}).toEqual({})
  })
  it('adds the city as a new current city (the old one kept intact), with its blueprints under new ids and remapped placements', () => {
    const data = existing()
    const before = structuredClone(data.cities[0])
    const plan = planImport(data, decoded(cityPkg()), 900)
    expect(plan).toMatchObject({ kind: 'city', name: 'Phố', brickCount: 5, full: false })
    if (plan.kind !== 'city') throw new Error()
    const next = applyImport(data, plan, 950)
    expect(next.blueprints.map((b) => b.name)).toEqual(['Mine', 'A', 'B'])
    const [, a, b] = next.blueprints
    expect(a.id).not.toBe('bp_a')
    expect(next.cities).toHaveLength(2)
    expect(next.cities[0]).toEqual(before)
    expect(next.cities[1]).toMatchObject({ id: plan.cityId, name: 'Phố', createdAt: 950, updatedAt: 950 })
    expect(next.currentCityId).toBe(plan.cityId)
    const city = currentCity(next)
    expect(city.size).toBe(24)
    expect(city.roads).toEqual(['0,0', '1,0'])
    expect(city.placements.map((p) => p.source)).toEqual([a.id, 'tpl:tree', b.id, a.id])
    expect(city.placements.map((p) => [p.cx, p.cz, p.rot])).toEqual([[2, 2, 0], [6, 2, 1], [10, 2, 0], [14, 2, 2]])
    expect(new Set(city.placements.map((p) => p.id)).size).toBe(4)
    expect(city.placements.map((p) => p.id)).not.toContain('pl0')
  })
  it('adds nothing at the city cap (the preview says to delete a city first)', () => {
    let data = existing()
    for (let i = 1; i < MAX_CITIES; i++) data = addCity(data, emptyCity(), `c${i}`)!.data
    const plan = planImport(data, decoded(cityPkg()), 900)
    expect(plan).toMatchObject({ kind: 'city', full: true })
    expect(applyImport(data, plan)).toBe(data)
  })
})

describe('city terrain and rails (optional layers)', () => {
  const layers = {
    roads: ['0,0', '1,0', '3,7', '3,8', '3,9'], // crosses the rail at 3,8, at right angles
    rails: ['0,8', '1,8', '2,8', '3,8', '4,8', '5,8'],
    terrain: { water: ['5,10', '6,10', '5,11', '6,11'], pavement: ['0,5', '1,5'], sand: ['4,10'] },
  }
  const layered = (over: Partial<CityState> = {}): SharePackage => {
    const pkg = cityPkg()
    return { ...pkg, city: { ...pkg.city!, city: { ...pkg.city!.city, ...layers, ...over } } }
  }

  it('round-trips terrain and rails through a link; old links have neither', () => {
    const built = buildCityPackage({ ...cityPkg().city!.city, ...layers }, cityPkg().city!.blueprints)
    expect(built.city!.city.rails).toEqual(layers.rails)
    const out = decodeShare(encodeShare(layered())) as SharePackage
    expect(out).not.toHaveProperty('error')
    expect(out.city!.city.terrain).toEqual(layers.terrain)
    expect(out.city!.city.rails).toEqual(layers.rails)
    const old = decodeShare(encodeShare(cityPkg())) as SharePackage
    expect(old.city!.city).not.toHaveProperty('terrain')
    expect(old.city!.city).not.toHaveProperty('rails')
    // Empty layers are not sent, and come back absent.
    const empty = decodeShare(encodeShare(layered({ rails: [], terrain: { water: [], pavement: [], sand: [] } }))) as SharePackage
    expect(empty.city!.city).not.toHaveProperty('terrain')
    expect(empty.city!.city).not.toHaveProperty('rails')
  })

  it('imports the layers with the city', () => {
    const pkg = validatePackage(layered()) as SharePackage
    const plan = planImport(createEmptySave(), pkg, 9)
    if (plan.kind !== 'city') throw new Error()
    expect(plan.city.terrain).toEqual(layers.terrain)
    expect(plan.city.rails).toEqual(layers.rails)
    expect(currentCity(applyImport(createEmptySave(), plan)).rails).toEqual(layers.rails)
  })

  it('rejects malformed, off-map or overlapping layers and water under roads or rails', () => {
    const t = layers.terrain
    const bad: Array<Partial<CityState>> = [
      { rails: 'x' as never },
      { rails: ['24,0'] },
      { rails: ['1,1,1'] },
      { rails: [5 as never] },
      { terrain: [] as never },
      { terrain: { ...t, water: 'x' as never } },
      { terrain: { water: t.water } as never }, // a list missing
      { terrain: { ...t, sand: ['-1,0'] } },
      { terrain: { ...t, sand: ['5,10'] } }, // water and sand at once
      { terrain: { ...t, water: [...t.water, '0,0'] } }, // under a road
      { terrain: { ...t, water: [...t.water, '0,8'] } }, // under a rail
    ]
    for (const over of bad) expect(validatePackage(layered(over)), JSON.stringify(over)).toEqual({ error: 'invalid' })
    const all = Array.from({ length: 24 * 24 + 1 }, (_, i) => `${i % 24},${Math.floor(i / 24) % 24}`)
    expect(validatePackage(layered({ rails: all }))).toEqual({ error: 'too_big' })
    expect(validatePackage(layered({ terrain: { ...t, pavement: all } }))).toEqual({ error: 'too_big' })
  })

  it('rejects a road and a rail meeting anywhere but at a straight crossing', () => {
    expect(validatePackage(layered({ roads: ['0,0', '1,0', '3,7', '3,8'] }))).toEqual({ error: 'invalid' }) // the road ends on the rail
    expect(validatePackage(layered({ roads: ['0,0', '1,0', '2,8', '3,8'] }))).toEqual({ error: 'invalid' }) // along the rail
    expect(validatePackage(layered({ rails: ['3,8'] }))).toEqual({ error: 'invalid' }) // a lone rail cell on the road
  })

  it('applies the placement rules: nothing on rails, water only under water models', () => {
    const pkg = layered()
    const [p1, ...rest] = pkg.city!.city.placements // bp_a: 1 x 2 cells
    const at = (cx: number, cz: number) => validatePackage(layered({ placements: [{ ...p1, cx, cz }, ...rest] }))
    expect(at(2, 7)).toEqual({ error: 'invalid' }) // 2,8 is a rail
    expect(at(5, 9)).toEqual({ error: 'invalid' }) // 5,10 is water
    expect(at(0, 4)).not.toHaveProperty('error') // pavement is fine
    // A water model (a bridge) must touch water.
    const bridgeBp = { ...pkg.city!.blueprints[0], id: 'bp_w', tags: ['water'] }
    const withBridge = (cx: number, cz: number) =>
      validatePackage({
        ...pkg,
        city: {
          city: { ...pkg.city!.city, ...layers, placements: [...pkg.city!.city.placements, { ...p1, id: 'w', source: 'bp_w', cx, cz }] },
          blueprints: [...pkg.city!.blueprints, bridgeBp],
        },
      })
    expect(withBridge(6, 9)).not.toHaveProperty('error') // 6,9 land + 6,10 water
    expect(withBridge(8, 10)).toEqual({ error: 'invalid' }) // dry land only
    // A template is a water model when templateSize says so.
    const tplPkg = layered({ placements: [{ id: 't', source: 'tpl:boat', cx: 5, cz: 10, rot: 0 }] })
    expect(validatePackage(tplPkg)).toEqual({ error: 'invalid' }) // unknown: an ordinary one-cell model, on water
    expect(validatePackage(tplPkg, { templateSize: () => ({ w: 8, d: 8, water: true }) })).not.toHaveProperty('error')
  })

  it('never throws on crafted compact layers', () => {
    const c = packShare(layered())
    const variants = [
      { T: 5 }, { T: [[1, 2]] }, { T: [1, 2, 3] }, { T: [['x', 1], [], []] }, { T: [[], [], [], []] },
      { R: 'x' }, { R: [1] }, { R: [1, 2, 3, 4, 'x', null] }, { T: [Array(2 * 48 * 48 + 2).fill(0), [], []] },
    ]
    for (const v of variants) {
      const payload = compress(JSON.stringify({ ...c, c: { ...c.c!, ...v } }))
      expect(decodeShare(payload), JSON.stringify(v).slice(0, 60)).toHaveProperty('error')
    }
  })
})
