import { addCoins, awardStickers } from '../rewards'
import type { PlayData } from '../types'
import { DUPLICATE_COINS, isPrizeId } from './prizes'

/**
 * The 🏆 prize cabinet ("Tủ quà") as pure functions over `PlayData`: a new kind goes on the shelf, a
 * kind the kid already owns turns into coins. Stickers for the collection are awarded on the way.
 */

export interface CollectResult {
  play: PlayData
  /** True when the kind was not on the shelf yet. */
  isNew: boolean
  /** Coins paid for a duplicate (0 for a new kind). */
  coins: number
  /** Stickers this prize earned. */
  stickers: string[]
}

/** The kinds the kid owns (none yet: empty). */
export const ownedPrizes = (play: PlayData): readonly string[] => play.prizes ?? []

/** The kid won a prize of `kind`. An unknown kind changes nothing. */
export function collectPrize(play: PlayData, kind: string): CollectResult {
  if (!isPrizeId(kind)) return { play, isNew: false, coins: 0, stickers: [] }
  const owned = ownedPrizes(play)
  if (owned.includes(kind)) {
    const paid = addCoins(play, DUPLICATE_COINS)
    return { play: paid, isNew: false, coins: paid.coins - play.coins, stickers: [] }
  }
  const { play: next, added } = awardStickers({ ...play, prizes: [...owned, kind] })
  return { play: next, isNew: true, coins: 0, stickers: added }
}
