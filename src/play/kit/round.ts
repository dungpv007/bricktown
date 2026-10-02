import { useCallback, useReducer, useRef, useState } from 'react'
import { COINS_PER_CUSTOMER, type RoundOutcome } from '../rewards'
import type { GameId } from '../types'
import { finishRound } from '../usePlay'

/**
 * The flow of a round: intro (a big ▶️) → customers one by one → summary (coins, sticker, play
 * again / back). A pure reducer (unit-tested) plus `useRound`, which records the finished round.
 */

export type RoundPhase = 'intro' | 'serving' | 'summary'

export interface RoundState {
  phase: RoundPhase
  /** Customers in the round. */
  total: number
  /** Index of the customer being served (0-based; `total` once all are served). */
  customer: number
  /** Coins earned so far. */
  coins: number
  /** "Try again" moments so far (a round with none is perfect). */
  mistakes: number
}

export type RoundAction =
  | { type: 'start' }
  | { type: 'serve'; coins: number }
  | { type: 'mistake' }
  | { type: 'again' }

export const newRound = (total: number): RoundState => ({ phase: 'intro', total: Math.max(1, Math.floor(total)), customer: 0, coins: 0, mistakes: 0 })

export function roundReducer(state: RoundState, action: RoundAction): RoundState {
  switch (action.type) {
    case 'start':
      return state.phase === 'intro' ? { ...state, phase: 'serving' } : state
    case 'serve': {
      if (state.phase !== 'serving') return state
      const customer = state.customer + 1
      const coins = state.coins + Math.max(0, Math.floor(action.coins))
      return { ...state, customer, coins, phase: customer >= state.total ? 'summary' : 'serving' }
    }
    case 'mistake':
      return state.phase === 'serving' ? { ...state, mistakes: state.mistakes + 1 } : state
    case 'again':
      return { ...newRound(state.total), phase: 'serving' }
  }
}

export interface UseRoundOptions {
  gameId: GameId
  /** Customers per round (the plan: 3-5). */
  customers: number
  /** Coins a served customer pays by default (`serve()` without an argument). */
  coinsPerCustomer?: number
}

export interface Round extends RoundState {
  /** Intro → serving. */
  start: () => void
  /** The current customer is served (pays `coins`, default `coinsPerCustomer`); the last one ends the round. */
  serve: (coins?: number) => void
  /** A "try again" moment (only counts against the ⭐ perfect round). */
  mistake: () => void
  /** A new round straight away (from the summary). */
  again: () => void
  /** What the finished round paid and earned (set in the summary phase). */
  outcome: RoundOutcome | null
}

/**
 * A round's state for a game component. When the last customer is served it records the round
 * (`finishRound`: coins into the wallet, stats, new stickers) exactly once, and `outcome` holds the
 * result for `<RoundSummary>`.
 */
export function useRound({ gameId, customers, coinsPerCustomer = COINS_PER_CUSTOMER }: UseRoundOptions): Round {
  const [state, dispatch] = useReducer(roundReducer, customers, newRound)
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null)
  // The state as of the last action, so two taps in one frame see each other.
  const latest = useRef(state)
  const act = useCallback(
    (action: RoundAction) => {
      const before = latest.current
      const next = roundReducer(before, action)
      latest.current = next
      dispatch(action)
      if (next.phase === 'summary' && before.phase !== 'summary') {
        setOutcome(finishRound(gameId, { customers: next.customer, coins: next.coins, perfect: next.mistakes === 0 }))
      }
    },
    [gameId],
  )
  const start = useCallback(() => act({ type: 'start' }), [act])
  const serve = useCallback((coins = coinsPerCustomer) => act({ type: 'serve', coins }), [act, coinsPerCustomer])
  const mistake = useCallback(() => act({ type: 'mistake' }), [act])
  const again = useCallback(() => {
    setOutcome(null)
    act({ type: 'again' })
  }, [act])
  return { ...state, start, serve, mistake, again, outcome }
}
