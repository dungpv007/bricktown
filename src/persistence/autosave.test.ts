import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySave } from '../core/serialize'
import { useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { useGame } from '../state/useGame'
import { AUTOSAVE_DELAY_MS, flushAutosave, hasUnsavedChanges, startAutosave } from './autosave'
import { db } from './db'
import { loadSlot as loadSlotResult } from './saves'
import { applySave, switchSlot } from './session'

async function loadSlot(id: number) {
  const r = await loadSlotResult(id)
  return r.status === 'ok' ? r.data : null
}

const brick = { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0 as const, c: 0 }

function addBrick() {
  const ws = useGame.getState().data.workshop
  useGame.getState().setWorkshop({ ...ws, bricks: [...ws.bricks, brick] })
}

const tick = () =>
  new Promise<void>((r) => (globalThis as unknown as { setImmediate: (f: () => void) => void }).setImmediate(r))

let stop: (() => void) | undefined

beforeEach(async () => {
  await db.slots.clear()
  useApp.getState().setSlot(1)
  applySave(createEmptySave())
})

afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
})

describe('autosave', () => {
  it('debounces edits and writes to the current slot', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stop = startAutosave()
    addBrick()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    expect(await loadSlot(1)).toBeNull()
    await vi.advanceTimersByTimeAsync(200)
    for (let i = 0; i < 50 && !(await loadSlot(1)); i++) await tick()
    expect((await loadSlot(1))?.workshop.bricks).toHaveLength(1)
  })

  it('does not write freshly loaded data', async () => {
    stop = startAutosave()
    await flushAutosave()
    expect(await loadSlot(1)).toBeNull()
  })

  it('flushAutosave writes immediately', async () => {
    stop = startAutosave()
    addBrick()
    await flushAutosave()
    expect((await loadSlot(1))?.workshop.bricks).toHaveLength(1)
  })
  describe('leaving the app with a brick in hand', () => {
    const fakeDom = () => {
      const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState })
      const win = new EventTarget()
      vi.stubGlobal('document', doc)
      vi.stubGlobal('window', win)
      return { doc, win }
    }
    const pickUp = () => {
      const ed = useEditor.getState()
      ed.newModel('building', { w: 16, d: 16 })
      ed.setTool('place')
      ed.setPart('brick_2x4')
      ed.place(0, 0, 0)
      const id = useGame.getState().data.workshop.bricks[0].id
      ed.setTool('move')
      ed.tapBrick(id)
      expect(useEditor.getState().carried?.id).toBe(id)
      expect(useGame.getState().data.workshop.bricks).toHaveLength(0)
      return id
    }
    const waitForSave = async () => {
      for (let i = 0; i < 50 && !(await loadSlot(1)); i++) await tick()
      return loadSlot(1)
    }

    afterEach(() => {
      stop?.() // detach from the fake document/window before they are removed
      stop = undefined
      useEditor.getState().cancelCarry()
      vi.unstubAllGlobals()
    })

    it('visibilitychange to hidden puts the carried brick back before saving', async () => {
      const { doc } = fakeDom()
      stop = startAutosave()
      const id = pickUp()
      doc.visibilityState = 'hidden'
      doc.dispatchEvent(new Event('visibilitychange'))
      expect(useEditor.getState().carried).toBeNull()
      expect((await waitForSave())?.workshop.bricks.map((b) => b.id)).toEqual([id])
    })

    it('pagehide puts the carried brick back before saving', async () => {
      const { win } = fakeDom()
      stop = startAutosave()
      const id = pickUp()
      win.dispatchEvent(new Event('pagehide'))
      expect(useEditor.getState().carried).toBeNull()
      expect((await waitForSave())?.workshop.bricks.map((b) => b.id)).toEqual([id])
    })
  })
})

describe('slot switching', () => {
  it('flushes the old slot, loads the new one and resets editor history', async () => {
    stop = startAutosave()
    useEditor.getState().place(0, 0, 0)
    // fall back to a direct edit if the editor needs a selected part before placing
    if (useGame.getState().data.workshop.bricks.length === 0) addBrick()
    expect(useGame.getState().data.workshop.bricks).toHaveLength(1)

    await switchSlot(2)
    expect(useApp.getState().slotId).toBe(2)
    expect(useGame.getState().data.workshop.bricks).toHaveLength(0)
    expect((await loadSlot(1))?.workshop.bricks).toHaveLength(1)
    expect(await loadSlot(2)).toBeNull()

    useEditor.getState().undo()
    expect(useGame.getState().data.workshop.bricks).toHaveLength(0)
    expect(useEditor.getState().canUndo).toBe(false)

    await switchSlot(1)
    expect(useGame.getState().data.workshop.bricks).toHaveLength(1)
  })
})

describe('hasUnsavedChanges', () => {
  it('is false after a load, true after an edit, false again once written', async () => {
    expect(hasUnsavedChanges()).toBe(false)
    addBrick()
    expect(hasUnsavedChanges()).toBe(true)
    expect(await flushAutosave()).toBe(true)
    expect(hasUnsavedChanges()).toBe(false)
  })
})
