import type { CSSProperties } from 'react'
import { MAZE_MAX_SIZE } from '../../core/maze'
import type { MazeDifficulty } from '../../core/mazeGen'
import type { TKey } from '../../ui/i18n'

/** Sizes the editor's 📐 button offers (cells per side). */
export const MAZE_SIZES = [7, 11, 15, MAZE_MAX_SIZE] as const
/** Sizes offered for a new empty maze. */
export const NEW_MAZE_SIZES = [7, 11, 15] as const
export const DIFFICULTIES: MazeDifficulty[] = [1, 2, 3]
export const DIFFICULTY_KEY: Record<MazeDifficulty, TKey> = { 1: 'mazeDiff1', 2: 'mazeDiff2', 3: 'mazeDiff3' }

/** Little grid whose square count grows with the size, so the choice reads without the numbers too. */
export function SizeIcon({ n }: { n: number }) {
  const cells = Math.round((n - 3) / 4) + 1 // 7 -> 2, 11 -> 3, 15 -> 4, 21 -> 6
  return <span className="bt-maze-size-icon" style={{ '--bt-maze-grid': cells } as CSSProperties} aria-hidden="true" />
}
