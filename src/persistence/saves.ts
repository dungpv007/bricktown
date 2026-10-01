import { migrate } from '../core/serialize'
import type { SaveData } from '../core/types'
import { db } from './db'

export interface SlotSummary {
  id: number
  name: string
  updatedAt: number
  blueprintCount: number
}

/**
 * - absent: no record in this slot
 * - ok: record loaded
 * - unreadable: record exists but is corrupted / from a newer version; a raw copy was saved to `backups`
 * - error: the database could not be read (or the backup could not be written); the slot's real
 *   contents are unknown and MUST NOT be overwritten
 */
export type LoadResult =
  | { status: 'absent' }
  | { status: 'ok'; data: SaveData }
  | { status: 'unreadable' }
  | { status: 'error' }

/** Runs migrations and validates; returns null for anything unusable. */
function readRecordData(raw: unknown): SaveData | null {
  try {
    return migrate(raw)
  } catch (e) {
    console.error('bricktown: ignoring unreadable save', e)
    return null
  }
}

/** Copies the raw record into `backups` (once per distinct content). Throws on failure. */
async function backupRaw(slotId: number, raw: unknown): Promise<void> {
  const serialized = JSON.stringify(raw) ?? 'undefined'
  const existing = await db.backups.where('slotId').equals(slotId).toArray()
  if (existing.some((b) => (JSON.stringify(b.raw) ?? 'undefined') === serialized)) return
  await db.backups.add({ slotId, savedAt: Date.now(), raw })
}

export async function loadSlot(id: number): Promise<LoadResult> {
  try {
    const rec = await db.slots.get(id)
    if (!rec) return { status: 'absent' }
    const data = readRecordData(rec.data)
    if (data) return { status: 'ok', data }
    await backupRaw(id, rec)
    return { status: 'unreadable' }
  } catch (e) {
    console.error('bricktown: failed to load slot', id, e)
    return { status: 'error' }
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
