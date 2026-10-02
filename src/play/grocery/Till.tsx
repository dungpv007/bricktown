import { useEffect, useRef, useState } from 'react'
import { coin as coinSound } from '../../audio/sfx'
import { useT } from '../../ui/i18n'
import { useCountUp, useIdle } from '../kit'
import { coinBreakdown, DRAWER_COINS } from './logic'

/**
 * The HTML till under the scene: the screen (the total as big digits plus coin pictures), then
 * either the big "pay" button (Bé nhỏ) or the change tray (Bé lớn): what the customer gave, one dot
 * per coin of change that lights up as the kid counts, and the drawer's 1, 2 and 5 coins.
 */

/** A coin picture: gold for 1 and 2, bigger for 5, a green note for 10 and 20. */
export function Coin({ value, size = 'normal' }: { value: number; size?: 'normal' | 'big' }) {
  return (
    <span className={`g-coin g-coin-${value} g-coin-${size}`} aria-hidden="true">
      {value}
    </span>
  )
}

/** Coin pictures for an amount (10 / 5 / 1). */
export function CoinRow({ amount, coins: kinds, testId }: { amount: number; coins?: readonly number[]; testId?: string }) {
  const coins = coinBreakdown(amount, kinds)
  return (
    <span className="g-coin-row" data-testid={testId}>
      {coins.map((c, i) => (
        <Coin key={i} value={c} />
      ))}
    </span>
  )
}

/** The till screen: big digits and the matching coins. */
export function TillScreen({ total }: { total: number }) {
  const t = useT()
  const shown = useCountUp(total, 300)
  return (
    <div className="g-screen" data-testid="grocery-total" data-total={total} role="status" aria-label={`${t('groceryTotal')}: ${total}`}>
      <span className="g-digits">{shown}</span>
      <CoinRow amount={total} />
    </div>
  )
}

/** A pointing hand over a button after the idle wait. */
function Hint({ active, resetKey }: { active: boolean; resetKey?: unknown }) {
  const show = useIdle(active, undefined, resetKey)
  if (!show) return null
  return (
    <span className="bt-hint-hand g-hint" data-testid="hint-hand" aria-hidden="true">
      👆
    </span>
  )
}

export function PayButton({ total, onPay }: { total: number; onPay: () => void }) {
  const t = useT()
  return (
    <div className="g-pay-wrap">
      <button className="bt-btn bt-yes g-pay" data-testid="grocery-pay" aria-label={t('groceryPay')} onClick={onPay}>
        <CoinRow amount={total} />
        <span className="g-pay-check" aria-hidden="true">✓</span>
      </button>
      <Hint active />
    </div>
  )
}

export interface ChangeTrayProps {
  paid: number
  change: number
  given: number
  /** Gives one coin; false when it is too much (the coin wobbles). */
  onCoin: (coin: number) => boolean
}

const COUNT_STEP_MS = 150

/** What a customer pays with on the big level: notes of 20 and 10, coins of 5. */
export const NOTES = [20, 10, 5, 1] as const

/** Counting the change out: dots light up one by one with a count-along number and a clink each. */
export function ChangeTray({ paid, change, given, onCoin }: ChangeTrayProps) {
  const t = useT()
  const [wobbling, setWobbling] = useState<number | null>(null)
  const [step, setStep] = useState(1)
  /** Dots lit before the last tap (the newly lit ones light up one by one after it). */
  const [from, setFrom] = useState(given)
  const timers = useRef<number[]>([])
  const counted = useCountUp(given, COUNT_STEP_MS * step)
  useEffect(() => {
    const list = timers.current
    return () => list.forEach((id) => window.clearTimeout(id))
  }, [])

  const tap = (c: number) => {
    if (!onCoin(c)) {
      setWobbling(c)
      timers.current.push(window.setTimeout(() => setWobbling(null), 500))
      return
    }
    setFrom(given)
    setStep(c)
    // One clink per coin counted.
    for (let i = 0; i < c; i++) timers.current.push(window.setTimeout(coinSound, i * COUNT_STEP_MS))
  }

  const dots = []
  for (let i = 0; i < change; i++) {
    const on = i < given
    const fresh = on && i >= from
    dots.push(
      <span
        key={i}
        className="g-dot"
        data-on={on}
        style={fresh ? { animationDelay: `${(i - from) * COUNT_STEP_MS}ms` } : undefined}
      >
        {on ? i + 1 : ''}
      </span>,
    )
  }
  const groups = []
  for (let i = 0; i < dots.length; i += 5) groups.push(<span key={i} className="g-dot-group">{dots.slice(i, i + 5)}</span>)

  return (
    <div className="g-change" data-testid="grocery-change" data-change={change} data-given={given}>
      <div className="g-change-top">
        <span className="g-paid" aria-label={`${t('groceryPaid')}: ${paid}`}>
          <span aria-hidden="true">🤲</span>
          <CoinRow amount={paid} coins={NOTES} />
        </span>
        <span className="g-arrow" aria-hidden="true">➜</span>
        <span className="g-dots" aria-label={`${t('groceryChange')}: ${change}`}>
          {groups}
        </span>
        <span className="g-count" key={counted} aria-hidden="true">
          {counted}
        </span>
      </div>
      <div className="g-drawer">
        {DRAWER_COINS.map((c, i) => (
          <span key={c} className="g-pay-wrap">
            <button
              className="g-drawer-coin"
              data-testid={`grocery-coin-${c}`}
              data-wobble={wobbling === c}
              aria-label={t('groceryCoin').replace('{n}', String(c))}
              onClick={() => tap(c)}
            >
              <Coin value={c} size="big" />
            </button>
            {i === 0 && <Hint active resetKey={given} />}
          </span>
        ))}
      </div>
    </div>
  )
}
