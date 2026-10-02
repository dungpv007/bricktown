import { describe, expect, it } from 'vitest'
import { brushLine, deriveRoads, eraseKeys, roadTiles, straightAxis, type RoadShape } from './avenues'
import { neighbourMask, roadKey, roadTileAt } from './roads'

/** Road cells from an ASCII map: `=` is road, anything else is not (x = column, z = row). */
function cells(map: string[]): string[] {
  const out: string[] = []
  map.forEach((row, z) => [...row].forEach((ch, x) => ch === '=' && out.push(roadKey(x, z))))
  return out
}

/** One letter per cell: s street, a avenue, b box, p plaza. */
function kinds(map: string[]): string[] {
  const shapes = deriveRoads(cells(map))
  return map.map((row, z) => [...row].map((_, x) => shapes.get(roadKey(x, z))?.kind[0] ?? '.').join(''))
}

const at = (map: string[], x: number, z: number): RoadShape => deriveRoads(cells(map)).get(roadKey(x, z))!

describe('avenue derivation', () => {
  it('a 1-wide road is all street (old saves), tiled exactly as before', () => {
    const map = ['..=....', '=======', '..=....', '..=====']
    expect(kinds(map)).toEqual(['..s....', 'sssssss', '..s....', '..sssss'])
    const set = new Set(cells(map))
    const shapes = deriveRoads(set)
    for (const k of set) {
      const s = shapes.get(k)!
      expect(s.kind).toBe('street')
      const [x, z] = k.split(',').map(Number)
      // Same neighbour mask the old auto-tiler reads.
      expect(s.kind === 'street' && s.mask).toBe(neighbourMask(set, x, z))
    }
  })

  it('a straight 2-wide strip is an avenue, in both orientations, with partners across the centre line', () => {
    const ew = ['......', '======', '======', '......']
    expect(kinds(ew)).toEqual(['......', 'aaaaaa', 'aaaaaa', '......'])
    const top = at(ew, 2, 1)
    const bottom = at(ew, 2, 2)
    expect(top).toMatchObject({ kind: 'avenue', partner: 2, heading: 3, junction: false, end: false }) // north half drives W
    expect(bottom).toMatchObject({ kind: 'avenue', partner: 0, heading: 1 }) // south half drives E
    expect(at(ew, 0, 1)).toMatchObject({ end: true })
    const ns = ['.==.', '.==.', '.==.', '.==.']
    expect(kinds(ns)).toEqual(['.aa.', '.aa.', '.aa.', '.aa.'])
    expect(at(ns, 1, 1)).toMatchObject({ partner: 1, heading: 2 }) // west half drives S
    expect(at(ns, 2, 1)).toMatchObject({ partner: 3, heading: 0 }) // east half drives N
  })

  it('two avenues crossing make a 2 x 2 box with zebras; a bend makes a box without', () => {
    const cross = ['...==...', '...==...', '========', '========', '...==...', '...==...']
    expect(kinds(cross)).toEqual(['...aa...', '...aa...', 'aaabbaaa', 'aaabbaaa', '...aa...', '...aa...'])
    expect(at(cross, 3, 2)).toMatchObject({ kind: 'box', inV: 2, inH: 1, zebra: true })
    expect(at(cross, 4, 3)).toMatchObject({ kind: 'box', inV: 0, inH: 3, zebra: true })
    const bend = ['......', '======', '======', '....==', '....==', '....==']
    expect(kinds(bend)).toEqual(['......', 'aaaabb', 'aaaabb', '....aa', '....aa', '....aa'])
    expect(at(bend, 4, 1)).toMatchObject({ kind: 'box', zebra: false })
    const tee = ['........', '========', '========', '...==...', '...==...']
    expect(kinds(tee)).toEqual(['........', 'aaabbaaa', 'aaabbaaa', '...aa...', '...aa...'])
    expect(at(tee, 3, 1)).toMatchObject({ kind: 'box', zebra: true })
  })

  it('an avenue meeting a street: a junction pair (T and cross), lines broken, zebras across', () => {
    const tee = ['...=...', '...=...', '=======', '=======', '.......']
    expect(kinds(tee)).toEqual(['...s...', '...s...', 'aaaaaaa', 'aaaaaaa', '.......'])
    expect(at(tee, 3, 2)).toMatchObject({ kind: 'avenue', arm: true, junction: true })
    expect(at(tee, 3, 3)).toMatchObject({ kind: 'avenue', arm: false, junction: true })
    expect(at(tee, 2, 2)).toMatchObject({ junction: false })
    const cross = ['...=...', '=======', '=======', '...=...']
    expect(at(cross, 3, 1)).toMatchObject({ arm: true, junction: true })
    expect(at(cross, 3, 2)).toMatchObject({ arm: true, junction: true })
    expect(at(cross, 3, 0)).toMatchObject({ kind: 'street', mask: 4 })
  })

  it('a dead end: the last pair of an avenue is an end (cars U-turn across)', () => {
    const map = ['=====', '=====']
    expect(at(map, 4, 0)).toMatchObject({ kind: 'avenue', end: true })
    expect(at(map, 4, 1)).toMatchObject({ kind: 'avenue', end: true })
    expect(at(map, 2, 0)).toMatchObject({ end: false })
  })

  it('3-wide or wider areas are plaza; avenues entering them stay avenues', () => {
    const map = ['.........', '===......', '=========', '====.....', '===......']
    // Rows 1..4 at columns 0..2 are a 4 x 3 block (plaza); a street leads east from it.
    const k = kinds(map)
    expect(k[2].slice(0, 3)).toBe('ppp')
    expect(k[1].slice(0, 3)).toBe('ppp')
    expect(k[2].slice(5)).toBe('ssss')
    const wide = ['=====', '=====', '=====', '=====']
    expect(kinds(wide)).toEqual(['ppppp', 'ppppp', 'ppppp', 'ppppp'])
    const avenueToPlaza = ['====....', '========', '========', '====....']
    const k2 = kinds(avenueToPlaza)
    expect(k2[1].slice(5)).toBe('aaa')
    expect(k2[1].slice(0, 4)).toBe('pppp')
  })

  it('a lone 2 x 2 is a box (a tap of the avenue brush)', () => {
    expect(kinds(['==', '=='])).toEqual(['bb', 'bb'])
  })

  it('level crossings: straight streets and plain avenue halves only, perpendicular', () => {
    const ew = ['=====', '=====']
    expect(straightAxis(at(ew, 2, 0))).toBe('x')
    expect(straightAxis(at(ew, 0, 0))).toBe(null) // an end
    const ns = ['==', '==', '==', '==']
    expect(straightAxis(at(ns, 1, 1))).toBe('z')
    const tee = ['..=..', '=====', '=====']
    expect(straightAxis(at(tee, 2, 1))).toBe(null) // junction
    expect(straightAxis(at(['===', '...'], 1, 0))).toBe('x')
    expect(straightAxis(at(['==', '=='], 0, 0))).toBe(null) // box
  })

  it('is deterministic whatever the order of the cells', () => {
    const map = ['...==...', '...==...', '========', '========', '...=....', '...=....']
    const a = deriveRoads(cells(map))
    const b = deriveRoads(cells(map).reverse())
    expect([...b].sort()).toEqual([...a].sort())
  })
})

describe('road tiles (what each cell draws)', () => {
  const tileAt = (map: string[], x: number, z: number) => roadTiles(cells(map)).find((t) => t.cx === x && t.cz === z)!

  it('old saves: 1-wide roads draw exactly the street tiles they always did', () => {
    const map = ['..=......', '=========', '..=...=..', '..=====..', '......=..']
    const set = new Set(cells(map))
    const tiles = roadTiles(set)
    expect(tiles).toHaveLength(set.size)
    for (const t of tiles) {
      const { tile, rot } = roadTileAt(set, t.cx, t.cz)
      expect(t).toEqual({ variant: `street:${tile}`, cx: t.cx, cz: t.cz, rot })
    }
  })

  it('avenue halves turn so the centre line is on the shared edge; ends and junctions get their own variants', () => {
    const ew = ['......', '======', '======', '......']
    // North half: partner S (rot 3); south half: partner N (rot 1). A straight piece is open both ways.
    expect(tileAt(ew, 2, 1)).toMatchObject({ variant: 'avenue:1100', rot: 3 })
    expect(tileAt(ew, 2, 2)).toMatchObject({ variant: 'avenue:1100', rot: 1 })
    // The west end: closed on the canonical side that faces W.
    const westN = tileAt(ew, 0, 1) // rot 3: canonical N faces E, S faces W
    expect(westN.variant).toBe('avenue:1000')
    const ns = ['.==.', '.==.', '.==.']
    expect(tileAt(ns, 1, 1)).toMatchObject({ variant: 'avenue:1100', rot: 0 })
    expect(tileAt(ns, 2, 1)).toMatchObject({ variant: 'avenue:1100', rot: 2 })
    const tee = ['...=...', '=======', '=======']
    expect(tileAt(tee, 3, 1).variant).toBe('avenue:1111')
    expect(tileAt(tee, 3, 2).variant).toBe('avenue:1101')
  })

  it('box quarters turn so their outer sides face out', () => {
    const cross = ['...==...', '...==...', '========', '========', '...==...', '...==...']
    expect(tileAt(cross, 3, 3)).toEqual({ variant: 'box:111', cx: 3, cz: 3, rot: 0 }) // SW quarter
    expect(tileAt(cross, 4, 3)).toMatchObject({ rot: 1 }) // SE
    expect(tileAt(cross, 4, 2)).toMatchObject({ rot: 2 }) // NE
    expect(tileAt(cross, 3, 2)).toMatchObject({ rot: 3 }) // NW
    const bend = ['......', '======', '======', '....==', '....==']
    expect(tileAt(bend, 5, 1)).toMatchObject({ variant: 'box:000', rot: 2 }) // NE quarter: the outside of the bend
    expect(tileAt(bend, 4, 2)).toMatchObject({ variant: 'box:110', rot: 0 }) // SW quarter: the inside
  })

  it('plaza cells are unrotated pavement with kerb corners only round missing cells', () => {
    const wide = ['=====', '=====', '=====']
    expect(tileAt(wide, 2, 1).variant).toBe('plaza:15:0')
    expect(tileAt(wide, 0, 0).variant).toBe('plaza:6:0')
  })
})

describe('road brushes', () => {
  it('a street brush paints the L-shaped line', () => {
    expect(brushLine({ cx: 1, cz: 1 }, { cx: 3, cz: 1 }, 'street', 10).sort()).toEqual(['1,1', '2,1', '3,1'])
  })

  it('an avenue brush paints 2 wide, the second cell on the right of the stroke', () => {
    const east = brushLine({ cx: 1, cz: 1 }, { cx: 4, cz: 1 }, 'avenue', 10)
    expect(new Set(east)).toEqual(new Set(['1,1', '2,1', '3,1', '4,1', '1,2', '2,2', '3,2', '4,2'])) // right of E = S
    const north = brushLine({ cx: 5, cz: 6 }, { cx: 5, cz: 3 }, 'avenue', 10)
    expect(new Set(north)).toEqual(new Set(['5,6', '5,5', '5,4', '5,3', '6,6', '6,5', '6,4', '6,3'])) // right of N = E
    // A tap: a 2 x 2.
    expect(new Set(brushLine({ cx: 2, cz: 2 }, { cx: 2, cz: 2 }, 'avenue', 10))).toEqual(new Set(['2,2', '3,2', '2,3', '3,3']))
  })

  it('fills the outside of a bend, and keeps 2 wide along the grid edge', () => {
    const bend = new Set(brushLine({ cx: 1, cz: 5 }, { cx: 4, cz: 2 }, 'avenue', 10)) // E then N
    for (const k of ['5,6', '5,2', '4,6', '5,5']) expect(bend.has(k), k).toBe(true)
    const shapes = deriveRoads(bend)
    expect([...shapes.values()].every((s) => s.kind === 'avenue' || s.kind === 'box')).toBe(true)
    const edge = brushLine({ cx: 0, cz: 9 }, { cx: 5, cz: 9 }, 'avenue', 10) // right of E would be z = 10
    expect(new Set(edge.map((k) => k.split(',')[1]))).toEqual(new Set(['8', '9']))
    expect(edge).toHaveLength(12)
  })

  it('the avenue eraser takes the whole width: the partner, or the whole box', () => {
    const roads = cells(['...==...', '...==...', '========', '========', '........'])
    expect(new Set(eraseKeys(roads, ['1,2'], 'avenue'))).toEqual(new Set(['1,2', '1,3']))
    expect(new Set(eraseKeys(roads, ['3,2'], 'avenue'))).toEqual(new Set(['3,2', '4,2', '3,3', '4,3']))
    expect(eraseKeys(roads, ['1,2'], 'street')).toEqual(['1,2'])
    expect(eraseKeys(['1,1', '2,1'], ['1,1'], 'avenue')).toEqual(['1,1']) // a street cell goes alone
  })
})
