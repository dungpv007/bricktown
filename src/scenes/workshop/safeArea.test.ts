import { describe, expect, it } from 'vitest'
import { cheapestEdge } from './safeArea'

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom })

describe('cheapestEdge', () => {
  it('a tall column on a tablet covers its side', () => {
    const canvas = box(0, 0, 1080, 810)
    expect(cheapestEdge(box(12, 84, 88, 232), canvas)).toBe('left') // undo / redo
    expect(cheapestEdge(box(940, 84, 1068, 630), canvas)).toBe('right') // the colour column
  })
  it('a small button under the top bar of a portrait phone covers the top, on a landscape phone its side', () => {
    expect(cheapestEdge(box(355, 63, 403, 111), box(0, 0, 412, 891))).toBe('top')
    expect(cheapestEdge(box(834, 63, 882, 111), box(0, 0, 891, 412))).toBe('right')
  })
  it('a row along the bottom covers the bottom', () => {
    expect(cheapestEdge(box(9, 760, 403, 882), box(0, 0, 412, 891))).toBe('bottom')
  })
})
