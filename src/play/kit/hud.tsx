import { useEffect, useRef, useState } from 'react'
import { coin, fanfare } from '../../audio/sfx'
import { prefersReducedMotion, useApp } from '../../state/useApp'
import Confetti from '../../ui/Confetti'
import { useT } from '../../ui/i18n'
import { STICKER_BY_ID } from '../stickers'
import type { RoundOutcome } from '../rewards'
import { useCoins } from '../usePlay'
import '../play.css'

/**
 * The HTML side of the kit (drawn over the game's canvas): progress, the intro, the summary and
 * the coin counter. Big icon buttons, no reading needed.
 */

/** A number that counts up (or down) to `value` over about `ms`; jumps when motion is unwelcome. */
export function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    if (start === value) return
    if (prefersReducedMotion()) {
      from.current = value
      const id = requestAnimationFrame(() => setShown(value))
      return () => cancelAnimationFrame(id)
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const v = Math.round(start + (value - start) * k)
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

/** 🪙 and the wallet's coins, counting up when they change (the games' top bar shows it). */
export function CoinCounter() {
  const t = useT()
  const coins = useCoins()
  const shown = useCountUp(coins)
  return (
    <span className="bt-btn bt-coin-counter" data-testid="play-coins" data-coins={coins} role="status" aria-label={`${t('playCoins')}: ${coins}`}>
      <span aria-hidden="true">🪙</span> {shown}
    </span>
  )
}

/** One mark per customer of the round: done ones filled in. */
export function ProgressBar({ done, total, icon = '🙂' }: { done: number; total: number; icon?: string }) {
  return (
    <div className="bt-play-progress" data-testid="play-progress" data-done={done} data-total={total} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="bt-play-progress-dot" data-done={i < done}>
          {i < done ? icon : ''}
        </span>
      ))}
    </div>
  )
}

/** Before the first customer: the game's big icon and a ▶️ to begin. */
export function RoundIntro({ icon, onStart }: { icon: string; onStart: () => void }) {
  const t = useT()
  return (
    <div className="bt-play-overlay" data-testid="round-intro">
      <div className="bt-play-card">
        <span className="bt-play-card-icon" aria-hidden="true">{icon}</span>
        <button className="bt-btn bt-yes bt-play-big" data-testid="round-start" aria-label={t('playStart')} onClick={onStart}>
          ▶️
        </button>
      </div>
    </div>
  )
}

/** A sticker as it shows in the book and on the summary. */
export function StickerBadge({ id, size = 'normal', locked = false }: { id: string; size?: 'normal' | 'big'; locked?: boolean }) {
  const lang = useApp((s) => s.lang)
  const sticker = STICKER_BY_ID[id]
  if (!sticker) return null
  return (
    <span className={`bt-sticker bt-sticker-${size}`} data-locked={locked} data-testid={`sticker-${id}`} title={sticker.name[lang]}>
      <span className="bt-sticker-icon" aria-hidden="true">{locked ? '?' : sticker.icon}</span>
      <span className="bt-sticker-name">{locked ? '' : sticker.name[lang]}</span>
    </span>
  )
}

/**
 * The end of a round: confetti, the coins earned counting up, any new sticker, then 🔁 (play again)
 * and ← (back to where the game was started).
 */
export function RoundSummary({ outcome, onAgain, onExit }: { outcome: RoundOutcome | null; onAgain: () => void; onExit: () => void }) {
  const t = useT()
  const coins = useCountUp(outcome?.coins ?? 0, 900)
  useEffect(() => {
    fanfare()
    const id = window.setTimeout(coin, 500)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <div className="bt-play-overlay" data-testid="round-summary">
      <Confetti />
      <div className="bt-play-card bt-celebrate-card">
        <span className="bt-play-card-icon" aria-hidden="true">🎉</span>
        <span className="bt-play-earned" data-testid="round-coins" data-coins={outcome?.coins ?? 0}>
          <span aria-hidden="true">🪙</span> +{coins}
        </span>
        {outcome && outcome.stickers.length > 0 && (
          <div className="bt-play-new-stickers" data-testid="round-stickers">
            {outcome.stickers.map((id) => (
              <StickerBadge key={id} id={id} size="big" />
            ))}
          </div>
        )}
        <div className="bt-row">
          <button className="bt-btn bt-play-big" data-testid="round-back" aria-label={t('back')} onClick={onExit}>
            ←
          </button>
          <button className="bt-btn bt-yes bt-play-big" data-testid="round-again" aria-label={t('playAgain')} onClick={onAgain}>
            🔁
          </button>
        </div>
      </div>
    </div>
  )
}
