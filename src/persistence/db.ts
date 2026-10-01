import Dexie, { type EntityTable } from 'dexie'
import type { SaveData } from '../core/types'

export interface SlotRecord {
  id: number
  name: string
  updatedAt: number
  data: SaveData
}

/** Raw copy of a slot record that could not be read, kept so it is never silently lost. */
export interface BackupRecord {
  id?: number
  slotId: number
  savedAt: number
  raw: unknown
}

class BrickTownDB extends Dexie {
  slots!: EntityTable<SlotRecord, 'id'>
  backups!: EntityTable<BackupRecord, 'id'>

  constructor() {
    super('bricktown')
    this.version(1).stores({ slots: 'id' })
    this.version(2).stores({ slots: 'id', backups: '++id, slotId' })
  }
}

export const db = new BrickTownDB()
