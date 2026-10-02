import type { LocalizedText } from '../core/types'
import type { PlayData } from './types'

/**
 * The 🛍️ shop: extra items bought with coins. Only items that are new with the shop are ever
 * locked, never one a kid already used before it existed. Ids are saved; only ever append.
 *
 * - `figure`: a ready-made figure (`FIG_PRESETS` id) in the Workshop's figure tab and the figure
 *   editor's ⭐ tab. Presets only combine existing hats, prints and colours: no new save values.
 * - `part`: a catalog part (`PARTS` id) in the Workshop's part palette.
 *
 * New colours or hats are not offered: adding one to the save's value lists needs a schema bump (see
 * core/serialize).
 */
export type UnlockKind = 'figure' | 'part'

export interface Unlockable {
  id: string
  kind: UnlockKind
  /** The preset id (figure) or part id (part). */
  ref: string
  /** Price in coins. */
  price: number
  /** Shown where no picture is drawn. */
  icon: string
  name: LocalizedText
}

export const UNLOCKABLES: Unlockable[] = [
  { id: 'fig_king', kind: 'figure', ref: 'king', price: 30, icon: '🤴', name: { vi: 'Nhà vua', en: 'King' } },
  { id: 'fig_princess', kind: 'figure', ref: 'princess', price: 30, icon: '👸', name: { vi: 'Công chúa', en: 'Princess' } },
  { id: 'fig_superstar', kind: 'figure', ref: 'superstar', price: 50, icon: '🌟', name: { vi: 'Siêu sao', en: 'Superstar' } },
  { id: 'part_sushi_tile', kind: 'part', ref: 'print_sushi_1x2', price: 20, icon: '🍣', name: { vi: 'Biển sushi', en: 'Sushi tile' } },
  { id: 'part_bakery_tile', kind: 'part', ref: 'print_bakery_1x2', price: 20, icon: '🥐', name: { vi: 'Biển tiệm bánh', en: 'Bakery tile' } },
  { id: 'part_grocery_tile', kind: 'part', ref: 'print_grocery_1x2', price: 20, icon: '🍎', name: { vi: 'Biển tạp hóa', en: 'Grocery tile' } },
]

export const UNLOCKABLE_BY_ID: Record<string, Unlockable> = Object.fromEntries(UNLOCKABLES.map((u) => [u.id, u]))

const byRef = (kind: UnlockKind): Record<string, Unlockable> =>
  Object.fromEntries(UNLOCKABLES.filter((u) => u.kind === kind).map((u) => [u.ref, u]))
const FIGURE_LOCKS = byRef('figure')
const PART_LOCKS = byRef('part')

/** The shop item that locks this preset / part, or undefined when it is free. */
export const unlockableFor = (kind: UnlockKind, ref: string): Unlockable | undefined =>
  (kind === 'figure' ? FIGURE_LOCKS : PART_LOCKS)[ref]

/** True when `ref` is a shop item the kid has not bought (`play` absent: nothing bought). */
export function isLocked(play: PlayData | undefined, kind: UnlockKind, ref: string): boolean {
  const u = unlockableFor(kind, ref)
  return u !== undefined && !(play?.unlocked.includes(u.id) ?? false)
}
