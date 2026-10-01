import { describe, expect, it } from 'vitest'
import { figPreset } from './figures'
import { createEmptyMaze, setEntry, setExit, type Maze } from './maze'
import { createEmptySave } from './serialize'
import { buildCityPackage, buildMazePackage, buildModelPackage, decodeShare, encodeShare, type SharePackage } from './share'
import { SHARE_LIMITS, applyImport, planImport, sanitizeName, validatePackage } from './shareImport'
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
      expect(withModel({ bricks: [brick({ y: 70 })] })).toEqual({ error: 'invalid' })
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
    it('accepts a maze without doors and rejects a bad best run', () => {
      expect(withMaze({ entry: null, exit: null })).not.toHaveProperty('error')
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

describe('planImport / applyImport', () => {
  const existing = (): SaveData => {
    const data = createEmptySave()
    data.blueprints.push(blueprint([brick()], { id: 'bp_1', name: 'Mine' }))
    data.city = { size: 48, roads: ['5,5'], placements: [{ id: 'old', source: 'bp_1', cx: 0, cz: 0, rot: 0 }] }
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
  it('replaces the city, adding its blueprints with new ids and remapped placements', () => {
    const data = existing()
    const plan = planImport(data, decoded(cityPkg()), 900)
    expect(plan).toMatchObject({ kind: 'city', name: 'Phố', brickCount: 5, replaces: { placements: 1, roads: 1 } })
    if (plan.kind !== 'city') throw new Error()
    const next = applyImport(data, plan)
    expect(next.blueprints.map((b) => b.name)).toEqual(['Mine', 'A', 'B'])
    const [, a, b] = next.blueprints
    expect(a.id).not.toBe('bp_a')
    expect(next.city.size).toBe(24)
    expect(next.city.roads).toEqual(['0,0', '1,0'])
    expect(next.city.placements.map((p) => p.source)).toEqual([a.id, 'tpl:tree', b.id, a.id])
    expect(next.city.placements.map((p) => [p.cx, p.cz, p.rot])).toEqual([[2, 2, 0], [6, 2, 1], [10, 2, 0], [14, 2, 2]])
    expect(new Set(next.city.placements.map((p) => p.id)).size).toBe(4)
    expect(next.city.placements.map((p) => p.id)).not.toContain('pl0')
  })
})
