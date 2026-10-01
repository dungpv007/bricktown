import { describe, expect, it } from 'vitest'
import { createHistory } from './history'

describe('createHistory', () => {
  it('starts empty', () => {
    const h = createHistory<number>()
    expect(h.canUndo()).toBe(false)
    expect(h.canRedo()).toBe(false)
    expect(h.undo(1)).toBeUndefined()
    expect(h.redo(1)).toBeUndefined()
  })

  it('undoes and redoes snapshots', () => {
    const h = createHistory<number>()
    h.push(1) // state was 1, now 2
    h.push(2) // state was 2, now 3
    expect(h.canUndo()).toBe(true)
    expect(h.undo(3)).toBe(2)
    expect(h.undo(2)).toBe(1)
    expect(h.canUndo()).toBe(false)
    expect(h.canRedo()).toBe(true)
    expect(h.redo(1)).toBe(2)
    expect(h.redo(2)).toBe(3)
    expect(h.canRedo()).toBe(false)
  })

  it('push clears the redo stack', () => {
    const h = createHistory<number>()
    h.push(1)
    h.undo(2)
    expect(h.canRedo()).toBe(true)
    h.push(1)
    expect(h.canRedo()).toBe(false)
  })

  it('drops the oldest snapshots beyond the limit', () => {
    const h = createHistory<number>(3)
    for (let i = 0; i < 5; i++) h.push(i)
    const seen: number[] = []
    let cur = 5
    while (h.canUndo()) {
      cur = h.undo(cur)!
      seen.push(cur)
    }
    expect(seen).toEqual([4, 3, 2])
  })

  it('clear empties both stacks', () => {
    const h = createHistory<number>()
    h.push(1)
    h.push(2)
    h.undo(3)
    h.clear()
    expect(h.canUndo()).toBe(false)
    expect(h.canRedo()).toBe(false)
  })
})
