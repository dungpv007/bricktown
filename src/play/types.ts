/**
 * Role-play mini-games (🎮 Nhập vai): the shared data types. Pure (no React, no three.js), so the
 * main menu can read coins and stickers without loading any 3D code.
 */

/**
 * A game's id. The planned games are `sushi`, `bakery`, `grocery`, `rescue`; `demo` proves the
 * framework (dev only). Kept a string so a game can land without touching this file.
 */
export type GameId = string

/** What one game has counted so far (per save slot). */
export interface GameStats {
  /** Rounds finished. */
  rounds: number
  /** Customers served (or calls answered) over all rounds. */
  customers: number
  /** Rounds finished without a single "try again". */
  perfect: number
  /** Coins earned in this game over all rounds. */
  coins: number
}

/**
 * `SaveData.play`: the kid's role-play rewards, per save slot. Optional in the save (absent = nothing
 * earned yet) and repaired on load (`normalizePlay`), so it needs no schema bump.
 */
export interface PlayData {
  /** Coins to spend in the 🛍️ shop (0..MAX_COINS). */
  coins: number
  /** Sticker ids collected (see play/stickers), in the order they were earned. */
  stickers: string[]
  /** Unlockable ids bought in the shop (see play/unlocks). */
  unlocked: string[]
  /** Counters by game id. */
  stats?: Record<GameId, GameStats>
}

/** What a game reports when a round ends (see `finishRound` in play/usePlay). */
export interface RoundResult {
  /** Customers served in the round. */
  customers: number
  /** Coins the round earned (clamped to 0..MAX_ROUND_COINS). */
  coins: number
  /** No "try again" in the whole round: counts toward the ⭐ stickers. */
  perfect?: boolean
}
