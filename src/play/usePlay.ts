import { create } from 'zustand'
import { useApp } from '../state/useApp'
import { useGame } from '../state/useGame'
import { buyUnlock, emptyPlay, recordRound, type BuyError, type RoundOutcome } from './rewards'
import type { GameId, PlayData, RoundResult } from './types'

/**
 * The role-play rewards bound to the save slot (`SaveData.play` in useGame, saved with the slot by
 * autosave), and starting / leaving a game. Light (no three.js): the menu uses it.
 */

const EMPTY: PlayData = emptyPlay()

/** The current slot's play data (an empty one when nothing was earned yet). */
export const playOf = (data: { play?: PlayData }): PlayData => data.play ?? EMPTY

/** The current slot's play data; re-renders when it changes. */
export const usePlayData = (): PlayData => useGame((s) => playOf(s.data))

/** The coins in the wallet. */
export const useCoins = (): number => useGame((s) => playOf(s.data).coins)

/**
 * A round of `gameId` is over: pays its coins, counts it and awards stickers, all saved with the
 * slot. Returns what the summary shows. The kit's `useRound` calls it for you.
 */
export function finishRound(gameId: GameId, result: RoundResult): RoundOutcome {
  const outcome = recordRound(playOf(useGame.getState().data), gameId, result)
  useGame.getState().update((d) => ({ ...d, play: outcome.play }))
  return outcome
}

/** Buys shop item `id` with coins; the stickers it earned, or why it could not. */
export function buy(id: string): { stickers: string[] } | { error: BuyError } {
  const result = buyUnlock(playOf(useGame.getState().data), id)
  if ('error' in result) return result
  useGame.getState().update((d) => ({ ...d, play: result.play }))
  return { stickers: result.stickers }
}

/** Opens game `gameId` from the menu (Back returns to the menu). */
export const startGameFromMenu = (gameId: GameId): void => {
  usePlayUi.getState().closeShop() // started from the shop popup: it must not stay over the game
  useApp.getState().startPlay({ gameId, from: 'menu' })
}

/** Leaves the game in progress: back to the City (same view) or the menu it was started from. */
export function exitGame(): void {
  const app = useApp.getState()
  app.setMode(app.play?.from === 'city' ? 'city' : 'menu')
}

/** UI state shared by the palettes and the menu: the 🛍️ shop dialog. */
interface PlayUi {
  shopOpen: boolean
  openShop: () => void
  closeShop: () => void
}

export const usePlayUi = create<PlayUi>()((set) => ({
  shopOpen: false,
  openShop: () => set({ shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
}))
