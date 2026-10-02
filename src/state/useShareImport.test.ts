import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTemplate } from '../content/templates'
import { createEmptyMaze, setEntry, setExit, type Maze } from '../core/maze'
import { createEmptySave } from '../core/serialize'
import { buildCityPackage, buildMazePackage, buildModelPackage, shareFileText, shareLink } from '../core/share'
import type { Blueprint } from '../core/types'
import { useApp } from './useApp'
import { useCityEditor } from './useCityEditor'
import { useGame } from './useGame'
import { MAX_SHARE_FILE_BYTES, consumeShareHash, shareImportOptions, useShareImport } from './useShareImport'

const s = () => useShareImport.getState()
const data = () => useGame.getState().data

const car: Blueprint = {
  id: 'bp_car', name: 'Xe của An', kind: 'vehicle', tags: [], baseplate: { w: 8, d: 8 },
  bricks: [
    { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 1 },
    { id: 'b', p: 'brick_2x2', x: 0, y: 3, z: 0, r: 0, c: 4 },
  ],
  createdAt: 1, updatedAt: 1,
}

function playableMaze(): Maze {
  let m = createEmptyMaze(7, 7, { id: 'm_friend', name: 'Mê cung của An', now: 1 })
  const e = setEntry(m, { cx: 0, cz: 1 })
  if ('maze' in e) m = e.maze
  const x = setExit(m, { cx: 6, cz: 5 })
  if ('maze' in x) m = x.maze
  return m
}

const BASE = 'https://bricktown.example'

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
  useApp.setState({ lang: 'vi' })
  useShareImport.setState({ incoming: null, done: null, pickerOpen: false })
  useApp.setState({ mode: 'menu' })
})

describe('consumeShareHash', () => {
  it('returns a share hash and removes it from the address, keeping path and query', () => {
    const replaceState = vi.fn()
    const hash = consumeShareHash({ hash: '#s=abc', pathname: '/app/', search: '?x=1' }, { replaceState })
    expect(hash).toBe('#s=abc')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/app/?x=1')
  })
  it('leaves other hashes alone', () => {
    const replaceState = vi.fn()
    expect(consumeShareHash({ hash: '', pathname: '/', search: '' }, { replaceState })).toBeNull()
    expect(consumeShareHash({ hash: '#top', pathname: '/', search: '' }, { replaceState })).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })
})

describe('shareImportOptions', () => {
  it('sizes built-in templates and names nameless creations in the kid language', () => {
    const opts = shareImportOptions('en')
    expect(opts.templateSize?.('house_small')).toEqual(getTemplate('house_small')!.baseplate)
    expect(opts.templateSize?.('nope')).toBeUndefined()
    expect(opts.names).toEqual({ model: 'Model', maze: 'Maze', city: 'City' })
    expect(shareImportOptions('vi').names?.model).toBe('Mô hình')
  })
})

describe('useShareImport', () => {
  it('previews a model link without changing the save, then adds it once confirmed', () => {
    const link = shareLink(buildModelPackage(car, { withSteps: true }), BASE)
    s().receiveText(link, 'link')
    const incoming = s().incoming
    expect(incoming?.status).toBe('preview')
    expect(data().blueprints).toEqual([]) // never applied before the kid confirms
    const plan = s().confirm()
    expect(plan?.kind).toBe('model')
    expect(data().blueprints.map((b) => b.name)).toEqual(['Xe của An'])
    expect(data().sharedTemplates).toHaveLength(1)
    expect(s().incoming).toBeNull()
    expect(s().done).toBe(plan)
  })

  it('adds a shared maze with the sender time as a challenge', () => {
    s().receiveText(shareFileText(buildMazePackage(playableMaze(), { timeMs: 42_000, stars: 2 })), 'file')
    s().confirm()
    const [maze] = data().mazes
    expect(maze.name).toBe('Mê cung của An')
    expect(maze.id).not.toBe('m_friend')
    expect(data().mazeChallenges[maze.id]).toEqual({ timeMs: 42_000 })
  })

  it('replaces the city and adds the models it uses', () => {
    useGame.setState({ data: { ...createEmptySave(), city: { size: 48, roads: ['0,0'], placements: [] } } })
    const city = { size: 24, roads: ['5,5', '6,5'], placements: [{ id: 'p', source: 'bp_car', cx: 1, cz: 1, rot: 0 as const }] }
    s().receiveText(shareLink(buildCityPackage(city, [car], { name: 'Phố' }), BASE), 'paste')
    const incoming = s().incoming
    expect(incoming?.status === 'preview' && incoming.plan.kind === 'city' && incoming.plan.replaces).toEqual({ placements: 0, roads: 1 })
    s().confirm()
    expect(data().city.roads).toEqual(['5,5', '6,5'])
    expect(data().blueprints).toHaveLength(1)
    expect(data().city.placements[0].source).toBe(data().blueprints[0].id)
  })

  it('confirming a city import clears the city undo history, so undo cannot bring the old city back', () => {
    const oldCity = { size: 48, roads: [], placements: [] }
    useGame.setState({ data: { ...createEmptySave(), city: oldCity } })
    useCityEditor.getState().reset()
    useCityEditor.getState().paintRoad({ cx: 2, cz: 2 }, { cx: 5, cz: 2 })
    expect(useCityEditor.getState().canUndo).toBe(true)
    const city = { size: 24, roads: ['5,5', '6,5'], placements: [] }
    s().receiveText(shareLink(buildCityPackage(city, [], { name: 'Phố' }), BASE), 'paste')
    s().confirm()
    expect(useCityEditor.getState().canUndo).toBe(false)
    useCityEditor.getState().undo()
    expect(data().city.roads).toEqual(['5,5', '6,5'])
    expect(data().city.size).toBe(24)
  })

  it('a city import while driving returns to the city', () => {
    useApp.setState({ mode: 'drive' })
    s().receiveText(shareLink(buildCityPackage({ size: 24, roads: ['5,5'], placements: [] }, [], { name: 'Phố' }), BASE), 'paste')
    s().confirm()
    expect(useApp.getState().mode).toBe('city')
  })

  it('every new import or picker opening bumps seq (the dialog error boundary starts fresh)', () => {
    const before = s().seq
    s().openPicker()
    s().receiveText(`${BASE}/#s=not-a-real-payload`, 'link')
    expect(s().seq).toBe(before + 2)
  })

  it('shows an error card for a broken link and changes nothing', () => {
    s().receiveText(`${BASE}/#s=not-a-real-payload`, 'link')
    expect(s().incoming).toEqual({ status: 'error', error: 'corrupt', source: 'link' })
    expect(s().confirm()).toBeNull()
    expect(data()).toEqual(createEmptySave())
    s().dismiss()
    expect(s().incoming).toBeNull()
  })

  it('refuses a file that is too big without reading it', async () => {
    const huge = { size: MAX_SHARE_FILE_BYTES + 1, text: vi.fn(async () => '') }
    await s().receiveFile(huge)
    expect(s().incoming).toEqual({ status: 'error', error: 'too_big', source: 'file' })
    expect(huge.text).not.toHaveBeenCalled()
  })

  it('reads a file and previews it; an unreadable file is an error card', async () => {
    const text = shareFileText(buildModelPackage(car, { withSteps: false }))
    await s().receiveFile({ size: text.length, text: async () => text })
    expect(s().incoming?.status).toBe('preview')
    await s().receiveFile({ size: 10, text: async () => Promise.reject(new Error('gone')) })
    expect(s().incoming).toEqual({ status: 'error', error: 'corrupt', source: 'file' })
  })
})
