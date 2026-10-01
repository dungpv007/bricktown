import Dexie, { type EntityTable } from 'dexie'
import type { SaveData } from '../core/types'

export interface SlotRecord {
  id: number
  name: string
  updatedAt: number
  data: SaveData
}

class BrickTownDB extends Dexie {
  slots!: EntityTable<SlotRecord, 'id'>

  constructor() {
    super('bricktown')
    this.version(1).stores({ slots: 'id' })
  }
}

export const db = new BrickTownDB()
