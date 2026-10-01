import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySave } from '../core/serialize'
import type { SaveData } from '../core/types'
import { useApp } from '../state/useApp'
import { useGame } from '../state/useGame'
import { flushAutosave } from './autosave'
import { db } from './db'
import { loadSlot } from './saves'
import { applySave, deleteSlotById, loadCurrentSlot, switchSlot } from './session'
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
