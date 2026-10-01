import { createEmptySave } from '../core/serialize'
import type { SaveData } from '../core/types'
import { useApp, type SlotId } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { useGame } from '../state/useGame'
import { flushAutosave, markClean } from './autosave'
import { deleteSlot, loadSlot, saveSlot } from './saves'
import { usePersistStatus, withSlotActivity } from './status'

/**
 * Makes `data` the live game state. Also resets the editor, whose undo history lives outside
 * `useGame`, so undo can never restore bricks from a previously loaded slot.
 */
export function applySave(data: SaveData): void {
  useGame.getState().setData(data)
  const w = data.workshop
  useEditor.getState().loadBricks(w.bricks, w.kind, w.baseplate, w.editingBlueprintId)
  markClean(useGame.getState().data)
}

/**
 * Loads the current slot into the game. An absent or unreadable record (already backed up by
 * `loadSlot`) starts from an empty save. A read error starts an empty in-memory save too, but
 * blocks autosave so the unknown real contents are never overwritten.
 */
export async function loadCurrentSlot(): Promise<void> {
  const result = await loadSlot(useApp.getState().slotId)
  if (result.status === 'error') {
    usePersistStatus.getState().set({ error: 'load', writeBlocked: true })
    applySave(createEmptySave())
    return
  }
  usePersistStatus.getState().set({ error: null, writeBlocked: false })
  applySave(result.status === 'ok' ? result.data : createEmptySave())
}

// Slot operations run as slot activity, so an app update never reloads the page in the middle of one.

/**
 * Flushes the current slot, then switches to and loads `id`.
 * Returns false (and changes nothing) when the flush fails.
 */
export function switchSlot(id: SlotId): Promise<boolean> {
  return withSlotActivity(async () => {
    if (!(await flushAutosave())) return false
    useApp.getState().setSlot(id)
    await loadCurrentSlot()
    return true
  })
}

/** Deletes slot `id`; if it is the current slot the game restarts from an empty save. */
export function deleteSlotById(id: SlotId): Promise<boolean> {
  return withSlotActivity(async () => {
    if (!(await deleteSlot(id))) return false
    if (id === useApp.getState().slotId) {
      usePersistStatus.getState().set({ error: null, writeBlocked: false })
      applySave(createEmptySave())
    }
    return true
  })
}

/** Replaces the current slot's contents with imported `data` and persists it immediately. */
export function importIntoCurrentSlot(data: SaveData): Promise<boolean> {
  return withSlotActivity(async () => {
    applySave(data)
    usePersistStatus.getState().set({ error: null, writeBlocked: false })
    const ok = await saveSlot(useApp.getState().slotId, useGame.getState().data)
    if (!ok) {
      // Not persisted: let the next flush (edit, tab hide) retry.
      markClean(null)
      usePersistStatus.getState().set({ error: 'save' })
    }
    return ok
  })
}
