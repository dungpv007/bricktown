import { describe, expect, it } from 'vitest'
import type { Brick } from '../core/types'
import { THUMB_MEMO_MAX, getThumbnail } from './thumbnails'

// No WebGL here: every render resolves '' (and is then forgotten). The memo is checked while the
// requests are still queued, which is when it holds them.
const bricks: Brick[] = [{ id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }]

describe('thumbnail memo', () => {
  it('remembers at most THUMB_MEMO_MAX pictures, forgetting the least recently asked for', async () => {
    const first = Array.from({ length: THUMB_MEMO_MAX }, (_, i) => getThumbnail(`k${i}`, bricks))
    expect(getThumbnail('k0', bricks)).toBe(first[0]) // a hit: k0 is now the most recent
    const extra = getThumbnail('extra', bricks) // one over: k1 is forgotten
    expect(getThumbnail('k0', bricks)).toBe(first[0])
    expect(getThumbnail(`k${THUMB_MEMO_MAX - 1}`, bricks)).toBe(first[THUMB_MEMO_MAX - 1])
    const again = getThumbnail('k1', bricks)
    expect(again).not.toBe(first[1])
    await Promise.all([...first, extra, again])
    expect(await again).toBe('')
  })
})
