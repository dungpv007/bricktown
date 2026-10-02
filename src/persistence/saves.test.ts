import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySave, SCHEMA_VERSION } from '../core/serialize'
import type { SaveData } from '../core/types'
import { db } from './db'
import { deleteSlot, listBackups, listSlots, loadSlot, saveSlot } from './saves'

function sampleSave(): SaveData {
  const save = createEmptySave()
  save.workshop.bricks.push({ id: 'a', p: 'brick_2x4', x: 1, y: 0, z: 2, r: 1, c: 3 })
  save.completedTemplates.push('house')
  return save
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await db.slots.clear()
  await db.backups.clear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('saves', () => {
  it('save -> load round-trips', async () => {
    const save = sampleSave()
    expect(await saveSlot(1, save)).toBe(true)
    expect(await loadSlot(1)).toEqual({ status: 'ok', data: save })
  })

  it('load of an empty slot is absent', async () => {
    expect(await loadSlot(2)).toEqual({ status: 'absent' })
    expect(await db.backups.count()).toBe(0)
  })

  it('listSlots reports existing slots with blueprint counts', async () => {
    const withBp = sampleSave()
    withBp.blueprints.push({
      id: 'b1',
      name: 'x',
      kind: 'building',
      tags: [],
      baseplate: { w: 16, d: 16 },
      bricks: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await saveSlot(1, withBp)
    await saveSlot(3, createEmptySave())
    const list = await listSlots()
    expect(list.map((s) => s.id)).toEqual([1, 3])
    expect(list[0].blueprintCount).toBe(1)
    expect(list[1].blueprintCount).toBe(0)
    expect(list[0].updatedAt).toBeGreaterThan(0)
  })

  it('deleteSlot removes the slot', async () => {
    await saveSlot(1, sampleSave())
    expect(await deleteSlot(1)).toBe(true)
    expect(await loadSlot(1)).toEqual({ status: 'absent' })
    expect(await listSlots()).toEqual([])
  })

  it('load of a corrupted record is unreadable and the raw record is backed up', async () => {
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: { nonsense: true } as unknown as SaveData })
    expect(await loadSlot(1)).toEqual({ status: 'unreadable' })
    await db.slots.put({ id: 2, name: 'x', updatedAt: 1, data: null as unknown as SaveData })
    expect(await loadSlot(2)).toEqual({ status: 'unreadable' })
    const backups = await db.backups.toArray()
    expect(backups.map((b) => b.slotId).sort()).toEqual([1, 2])
    expect(backups.find((b) => b.slotId === 1)?.raw).toMatchObject({ id: 1, data: { nonsense: true } })
  })

  it('does not duplicate a backup of identical content on repeated loads', async () => {
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: { nonsense: true } as unknown as SaveData })
    await loadSlot(1)
    await loadSlot(1)
    expect(await db.backups.count()).toBe(1)
  })

  it('concurrent loads of the same unreadable record make one backup', async () => {
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: { nonsense: true } as unknown as SaveData })
    await Promise.all([loadSlot(1), loadSlot(1)])
    expect(await db.backups.count()).toBe(1)
  })

  it('a read exception is an error, not an empty slot, and makes no backup', async () => {
    await saveSlot(1, sampleSave())
    vi.spyOn(db.slots, 'get').mockRejectedValue(new Error('boom'))
    expect(await loadSlot(1)).toEqual({ status: 'error' })
    expect(await db.backups.count()).toBe(0)
  })

  it('an unreadable record whose backup fails is an error (never proceed to overwrite)', async () => {
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: { nonsense: true } as unknown as SaveData })
    vi.spyOn(db.backups, 'add').mockRejectedValue(new Error('quota'))
    expect(await loadSlot(1)).toEqual({ status: 'error' })
  })

  it('load rejects records missing top-level keys', async () => {
    const { cities: _cities, ...partial } = createEmptySave()
    void _cities
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: partial as unknown as SaveData })
    expect(await loadSlot(1)).toEqual({ status: 'unreadable' })
  })

  it('load rejects a record from a newer schema', async () => {
    const data = { ...createEmptySave(), schemaVersion: SCHEMA_VERSION + 1 }
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data })
    expect(await loadSlot(1)).toEqual({ status: 'unreadable' })
    expect((await db.backups.toArray())[0].raw).toMatchObject({ data: { schemaVersion: SCHEMA_VERSION + 1 } })
  })

  it('listSlots skips corrupted records without throwing', async () => {
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: null as unknown as SaveData })
    await saveSlot(2, createEmptySave())
    const list = await listSlots()
    expect(list.map((s) => s.id)).toEqual([2])
  })

  it('never throws when the database fails', async () => {
    vi.spyOn(db.slots, 'put').mockRejectedValue(new Error('quota'))
    vi.spyOn(db.slots, 'get').mockRejectedValue(new Error('boom'))
    vi.spyOn(db.slots, 'toArray').mockRejectedValue(new Error('boom'))
    vi.spyOn(db.slots, 'delete').mockRejectedValue(new Error('boom'))
    expect(await saveSlot(1, createEmptySave())).toBe(false)
    expect(await loadSlot(1)).toEqual({ status: 'error' })
    expect(await listSlots()).toEqual([])
    expect(await deleteSlot(1)).toBe(false)
  })

  it('listBackups lists every backup, by slot then newest first', async () => {
    expect(await listBackups()).toEqual([])
    await db.backups.bulkAdd([
      { slotId: 2, savedAt: 10, raw: { id: 2, data: 'a' } },
      { slotId: 1, savedAt: 5, raw: { id: 1, data: 'old' } },
      { slotId: 1, savedAt: 20, raw: { id: 1, data: 'new' } },
    ])
    const list = await listBackups()
    expect(list.map((b) => [b.slotId, b.savedAt])).toEqual([
      [1, 20],
      [1, 5],
      [2, 10],
    ])
    expect(list[0].raw).toEqual({ id: 1, data: 'new' })
    expect(list.every((b) => typeof b.id === 'number')).toBe(true)
  })

  it('a backup made from an unreadable slot is listed for download', async () => {
    await db.slots.put({ id: 3, name: 'x', updatedAt: 1, data: { nonsense: true } as unknown as SaveData })
    await loadSlot(3)
    const [backup] = await listBackups()
    expect(backup.slotId).toBe(3)
    expect(backup.raw).toMatchObject({ id: 3, data: { nonsense: true } })
  })

  it('listBackups is empty when the database fails', async () => {
    vi.spyOn(db.backups, 'toArray').mockRejectedValue(new Error('boom'))
    expect(await listBackups()).toEqual([])
  })
})
