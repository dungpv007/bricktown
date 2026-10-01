import { createEmptySave } from '../core/serialize'
import type { SaveData } from '../core/types'
import { useApp, type SlotId } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { useGame } from '../state/useGame'
import { flushAutosave, markClean } from './autosave'
import { deleteSlot, loadSlot, saveSlot } from './saves'

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

/** Loads the current slot (or a fresh empty save) into the game. */
export async function loadCurrentSlot(): Promise<void> {
  const data = (await loadSlot(useApp.getState().slotId)) ?? createEmptySave()
  applySave(data)
}

/** Flushes the current slot, then switches to and loads `id`. */
export async function switchSlot(id: SlotId): Promise<void> {
  await flushAutosave()
  useApp.getState().setSlot(id)
  await loadCurrentSlot()
}

/** Deletes slot `id`; if it is the current slot the game restarts from an empty save. */
export async function deleteSlotById(id: SlotId): Promise<void> {
  if (id === useApp.getState().slotId) {
    applySave(createEmptySave())
  }
  await deleteSlot(id)
}

/** Replaces the current slot's contents with imported `data` and persists it immediately. */
export async function importIntoCurrentSlot(data: SaveData): Promise<boolean> {
  applySave(data)
  const ok = await saveSlot(useApp.getState().slotId, useGame.getState().data)
  return ok
}
