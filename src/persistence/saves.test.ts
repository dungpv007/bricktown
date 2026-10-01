import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySave, SCHEMA_VERSION } from '../core/serialize'
import type { SaveData } from '../core/types'
import { db } from './db'
import { deleteSlot, listSlots, loadSlot, saveSlot } from './saves'

function sampleSave(): SaveData {
  const save = createEmptySave()
  save.workshop.bricks.push({ id: 'a', p: 'brick_2x4', x: 1, y: 0, z: 2, r: 1, c: 3 })
  save.completedTemplates.push('house')
  return save
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await db.slots.clear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('saves', () => {
  it('save -> load round-trips', async () => {
    const save = sampleSave()
    expect(await saveSlot(1, save)).toBe(true)
    expect(await loadSlot(1)).toEqual(save)
  })

  it('load of an empty slot returns null', async () => {
    expect(await loadSlot(2)).toBeNull()
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
    expect(await loadSlot(1)).toBeNull()
    expect(await listSlots()).toEqual([])
  })

  it('load of a corrupted record returns null', async () => {
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: { nonsense: true } as unknown as SaveData })
    expect(await loadSlot(1)).toBeNull()
    await db.slots.put({ id: 2, name: 'x', updatedAt: 1, data: null as unknown as SaveData })
    expect(await loadSlot(2)).toBeNull()
  })

  it('load rejects records missing top-level keys', async () => {
    const { city: _city, ...partial } = createEmptySave()
    void _city
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data: partial as unknown as SaveData })
    expect(await loadSlot(1)).toBeNull()
  })

  it('load rejects a record from a newer schema', async () => {
    const data = { ...createEmptySave(), schemaVersion: SCHEMA_VERSION + 1 }
    await db.slots.put({ id: 1, name: 'x', updatedAt: 1, data })
    expect(await loadSlot(1)).toBeNull()
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
    expect(await loadSlot(1)).toBeNull()
    expect(await listSlots()).toEqual([])
    expect(await deleteSlot(1)).toBe(false)
  })
})
