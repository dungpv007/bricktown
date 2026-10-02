import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_CITY } from '../content/cities/sample'
import { createEmptySave } from '../core/serialize'
import type { SaveData } from '../core/types'
import { useApp } from '../state/useApp'
import { useGame } from '../state/useGame'
import { flushAutosave } from './autosave'
import { db } from './db'
import { loadSlot } from './saves'
import { applySave, deleteSlotById, importIntoCurrentSlot, loadCurrentSlot, switchSlot } from './session'
import { usePersistStatus } from './status'

const brick = { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0 as const, c: 0 }

function addBrick() {
  const ws = useGame.getState().data.workshop
  useGame.getState().setWorkshop({ ...ws, bricks: [...ws.bricks, brick] })
}

function savedWithBrick(): SaveData {
  const s = createEmptySave()
  s.workshop.bricks.push(brick)
  return s
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await db.slots.clear()
  await db.backups.clear()
  useApp.getState().setSlot(1)
  usePersistStatus.getState().set({ error: null, writeBlocked: false })
  applySave(createEmptySave())
})

/** A city with the sample town's layout and models (placement ids are fresh in every copy). */
const isSampleTown = (city: SaveData['city']) =>
  city.roads.length === SAMPLE_CITY.roads.length &&
  city.placements.length === SAMPLE_CITY.placements.length &&
  city.placements.every((p, i) => p.source === SAMPLE_CITY.placements[i].source && p.cx === SAMPLE_CITY.placements[i].cx)

describe('new saves start with the sample town', () => {
  it('an empty slot (fresh install) loads the sample town with fresh ids, and saves nothing until an edit', async () => {
    await loadCurrentSlot()
    const { city } = useGame.getState().data
    expect(isSampleTown(city)).toBe(true)
    expect(city.placements.some((p) => SAMPLE_CITY.placements.some((q) => q.id === p.id))).toBe(false)
    expect(await flushAutosave()).toBe(true)
    expect((await loadSlot(1)).status).toBe('absent')
  })

  it('an existing save keeps its own city, even an empty one', async () => {
    const own = savedWithBrick()
    own.city = { size: 48, roads: ['1,1', '2,1'], placements: [{ id: 'p1', source: 'tpl:tree', cx: 5, cz: 5, rot: 0 }] }
    await db.slots.put({ id: 1, name: 'Slot 1', updatedAt: 1, data: own })
    await db.slots.put({ id: 2, name: 'Slot 2', updatedAt: 1, data: createEmptySave() })
    await loadCurrentSlot()
    expect(useGame.getState().data.city).toEqual(own.city)
    expect(await switchSlot(2)).toBe(true)
    expect(useGame.getState().data.city).toEqual(createEmptySave().city)
  })

  it('switching to a never-used slot, or deleting the current one, starts the sample town', async () => {
    expect(await switchSlot(3)).toBe(true)
    expect(isSampleTown(useGame.getState().data.city)).toBe(true)
    await db.slots.put({ id: 3, name: 'Slot 3', updatedAt: 1, data: savedWithBrick() })
    await loadCurrentSlot()
    expect(useGame.getState().data.city.placements).toHaveLength(0)
    expect(await deleteSlotById(3)).toBe(true)
    expect(isSampleTown(useGame.getState().data.city)).toBe(true)
  })
})

describe('loadCurrentSlot', () => {
  it('backs up an unreadable record, starts empty, and later edits may overwrite it', async () => {
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: { nonsense: true } as unknown as SaveData })
    await loadCurrentSlot()
    expect(useGame.getState().data).toEqual(createEmptySave())
    expect(await db.backups.count()).toBe(1)
    expect(usePersistStatus.getState().writeBlocked).toBe(false)
    addBrick()
    expect(await flushAutosave()).toBe(true)
    const r = await loadSlot(1)
    expect(r.status).toBe('ok')
    // the original corrupt record is still recoverable
    expect((await db.backups.toArray())[0].raw).toMatchObject({ data: { nonsense: true } })
  })

  it('a transient read error never overwrites the real slot and raises a warning', async () => {
    await db.slots.put({ id: 1, name: 'Slot 1', updatedAt: 1, data: savedWithBrick() })
    const get = vi.spyOn(db.slots, 'get').mockRejectedValue(new Error('transient'))
    await loadCurrentSlot()
    expect(usePersistStatus.getState()).toMatchObject({ error: 'load', writeBlocked: true })
    expect(useGame.getState().loaded).toBe(true)

    addBrick()
    expect(await flushAutosave()).toBe(true) // nothing written by design
    get.mockRestore()
    const r = await loadSlot(1)
    expect(r.status === 'ok' && r.data.workshop.bricks).toHaveLength(1)
    expect(await db.backups.count()).toBe(0)

    // the next successful load clears the block
    await loadCurrentSlot()
    expect(usePersistStatus.getState()).toMatchObject({ error: null, writeBlocked: false })
    expect(useGame.getState().data.workshop.bricks).toHaveLength(1)
  })
})

describe('switchSlot', () => {
  it('aborts and keeps the current slot and data when the flush fails', async () => {
    addBrick()
    vi.spyOn(db.slots, 'put').mockRejectedValue(new Error('quota'))
    expect(await switchSlot(2)).toBe(false)
    expect(useApp.getState().slotId).toBe(1)
    expect(useGame.getState().data.workshop.bricks).toHaveLength(1)
    expect(usePersistStatus.getState().error).toBe('save')
  })

  it('succeeds after the failure clears', async () => {
    addBrick()
    const put = vi.spyOn(db.slots, 'put').mockRejectedValue(new Error('quota'))
    expect(await switchSlot(2)).toBe(false)
    put.mockRestore()
    expect(await switchSlot(2)).toBe(true)
    expect(useApp.getState().slotId).toBe(2)
    expect(usePersistStatus.getState().error).toBeNull()
    const r = await loadSlot(1)
    expect(r.status === 'ok' && r.data.workshop.bricks).toHaveLength(1)
  })
})

describe('deleteSlotById', () => {
  it('does not reset the game when the delete fails', async () => {
    addBrick()
    vi.spyOn(db.slots, 'delete').mockRejectedValue(new Error('boom'))
    expect(await deleteSlotById(1)).toBe(false)
    expect(useGame.getState().data.workshop.bricks).toHaveLength(1)
  })
})

describe('slot operations block app-update reloads while they run', () => {
  const activity = () => usePersistStatus.getState().slotActivity

  it('switch, delete and import each count as slot activity until they settle', async () => {
    for (const run of [() => switchSlot(2), () => deleteSlotById(2), () => importIntoCurrentSlot(savedWithBrick())]) {
      const running = run()
      expect(activity()).toBe(1)
      expect(await running).toBe(true)
      expect(activity()).toBe(0)
    }
  })

  it('a failed operation ends its activity too', async () => {
    vi.spyOn(db.slots, 'put').mockRejectedValue(new Error('quota'))
    const running = importIntoCurrentSlot(savedWithBrick())
    expect(activity()).toBe(1)
    expect(await running).toBe(false)
    expect(activity()).toBe(0)
  })
})
