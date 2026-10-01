import { migrate } from '../core/serialize'
import type { SaveData } from '../core/types'
import { db } from './db'

export interface SlotSummary {
  id: number
  name: string
  updatedAt: number
  blueprintCount: number
}

/** Runs migrations and validates; returns null for anything unusable. */
function readRecordData(raw: unknown): SaveData | null {
  try {
    return migrate(raw)
  } catch (e) {
    console.error('bricktown: ignoring unreadable save', e)
    return null
  }
}

export async function loadSlot(id: number): Promise<SaveData | null> {
  try {
    const rec = await db.slots.get(id)
    return rec ? readRecordData(rec.data) : null
  } catch (e) {
    console.error('bricktown: failed to load slot', id, e)
    return null
  }
}

export async function saveSlot(id: number, data: SaveData): Promise<boolean> {
  try {
    await db.slots.put({ id, name: `Slot ${id}`, updatedAt: Date.now(), data })
    return true
  } catch (e) {
    console.error('bricktown: failed to save slot', id, e)
    return false
  }
}

export async function listSlots(): Promise<SlotSummary[]> {
  try {
    const recs = await db.slots.toArray()
    const out: SlotSummary[] = []
    for (const rec of recs) {
      const data = readRecordData(rec.data)
      if (data) out.push({ id: rec.id, name: rec.name, updatedAt: rec.updatedAt, blueprintCount: data.blueprints.length })
    }
    return out.sort((a, b) => a.id - b.id)
  } catch (e) {
    console.error('bricktown: failed to list slots', e)
    return []
  }
}

export async function deleteSlot(id: number): Promise<boolean> {
  try {
    await db.slots.delete(id)
    return true
  } catch (e) {
    console.error('bricktown: failed to delete slot', id, e)
    return false
  }
}
