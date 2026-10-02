import type { ReactNode } from 'react'
import { useGame } from '../../state/useGame'
import { useT } from '../../ui/i18n'
import { unlockableFor, type UnlockKind } from '../unlocks'
import { usePlayUi } from '../usePlay'
import '../play.css'

/**
 * Shop items in the palettes (part palette, figure tab, figure editor): until the kid buys one in
 * the 🛍️ shop it shows greyed out with 🔒 and its price, and a tap opens the shop.
 */

/** The price while shop item `kind`/`ref` is not bought in this save slot (see play/unlocks); null when it is free or owned. */
export function useLocked(kind: UnlockKind, ref: string): number | null {
  const item = unlockableFor(kind, ref)
  const owned = useGame((s) => (item ? (s.data.play?.unlocked.includes(item.id) ?? false) : true))
  return item && !owned ? item.price : null
}

/** 🔒 and the price, over a locked shop item's picture. */
export function LockChip({ price }: { price: number }) {
  return (
    <span className="bt-lock-chip" aria-hidden="true">
      🔒{price}
    </span>
  )
}

/**
 * A palette button for a shop item not bought yet: its picture greyed out with 🔒 and the price;
 * a tap opens the 🛍️ shop instead of picking it.
 */
export function LockedButton({ testId, label, price, className, children }: { testId: string; label: string; price: number; className: string; children: ReactNode }) {
  const t = useT()
  return (
    <button
      className={`${className} bt-locked`}
      data-testid={testId}
      data-locked="true"
      aria-label={`${label} (🔒 ${t('playLocked')}: ${price})`}
      onClick={() => usePlayUi.getState().openShop()}
    >
      {children}
      <LockChip price={price} />
    </button>
  )
}

