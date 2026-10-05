import type { LocalizedText } from '../../core/types'

/**
 * The claw machine's 10 prize kinds (pure data, no three.js: the save loader and the sticker book read
 * it). Ids are saved in `SaveData.play.prizes`: stable, only ever append.
 *
 * `model` says how a prize is drawn: a node of `public/models/claw/prizes.glb` (Kenney, CC0; the node is
 * named after the id) or one of the game's own smooth meshes (see claw/PrizeModel).
 */
export interface PrizeKind {
  id: string
  /** Shown in HTML (the summary, the toast): kids read the picture. */
  icon: string
  name: LocalizedText
  model: 'glb' | 'ball' | 'star'
  /** Animals and cars can also hide inside a gift box. */
  group: 'animal' | 'car' | 'toy'
}

export const PRIZES: readonly PrizeKind[] = [
  { id: 'bunny', icon: '🐰', name: { vi: 'Thỏ con', en: 'Bunny' }, model: 'glb', group: 'animal' },
  { id: 'cat', icon: '🐱', name: { vi: 'Mèo con', en: 'Kitty' }, model: 'glb', group: 'animal' },
  { id: 'panda', icon: '🐼', name: { vi: 'Gấu trúc', en: 'Panda' }, model: 'glb', group: 'animal' },
  { id: 'chick', icon: '🐥', name: { vi: 'Gà con', en: 'Chick' }, model: 'glb', group: 'animal' },
  { id: 'pig', icon: '🐷', name: { vi: 'Heo con', en: 'Piglet' }, model: 'glb', group: 'animal' },
  { id: 'penguin', icon: '🐧', name: { vi: 'Chim cánh cụt', en: 'Penguin' }, model: 'glb', group: 'animal' },
  { id: 'monster_truck', icon: '🚙', name: { vi: 'Xe bánh to', en: 'Monster truck' }, model: 'glb', group: 'car' },
  { id: 'racer', icon: '🏎️', name: { vi: 'Xe đua', en: 'Race car' }, model: 'glb', group: 'car' },
  { id: 'beach_ball', icon: '🏐', name: { vi: 'Bóng bãi biển', en: 'Beach ball' }, model: 'ball', group: 'toy' },
  { id: 'star', icon: '⭐', name: { vi: 'Ngôi sao', en: 'Star' }, model: 'star', group: 'toy' },
]

export const PRIZE_COUNT = PRIZES.length

export const PRIZE_BY_ID: Readonly<Record<string, PrizeKind>> = Object.fromEntries(PRIZES.map((p) => [p.id, p]))

export const isPrizeId = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(PRIZE_BY_ID, id)

/**
 * The gift boxes' looks (nodes of prizes.glb). A gift is not a prize kind: it is a mystery box in the
 * pit with an animal or a car inside, opened when the kid takes it from the prize door. (Saves from
 * when gifts were kinds may hold `gift_box` / `gift_round`: unknown kinds now, dropped on load.)
 */
export const GIFT_LOOKS = ['gift_box', 'gift_round'] as const
export type GiftLook = (typeof GIFT_LOOKS)[number]

/** The kinds a gift box can hold. */
export const GIFT_CONTENTS: readonly string[] = PRIZES.filter((p) => p.group !== 'toy').map((p) => p.id)

/** Coins a prize the kid already owns turns into. */
export const DUPLICATE_COINS = 3

/** A saved prize list made safe: known ids only, each once, in the order first seen. */
export function normalizePrizes(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isPrizeId))] : []
}
