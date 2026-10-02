import { coin, error as errorSound } from '../../audio/sfx'
import { figPreset } from '../../core/figures'
import { getPartThumbnail } from '../../render/thumbnails'
import { useApp } from '../../state/useApp'
import { FigureImage } from '../../ui/FigureEditor'
import { useT } from '../../ui/i18n'
import { useThumbnail } from '../../ui/useThumbnail'
import { UNLOCKABLES, type Unlockable } from '../unlocks'
import { buy, usePlayData } from '../usePlay'
import '../play.css'

/** The colour a shop part is shown in (printed tiles keep their own print colours on top). */
const SHOP_PART_COLOR = 0

function PartPicture({ item }: { item: Unlockable }) {
  const url = useThumbnail(`part:${item.ref}:${SHOP_PART_COLOR}`, () => getPartThumbnail(item.ref, SHOP_PART_COLOR))
  return url ? <img src={url} alt="" draggable={false} /> : <span aria-hidden="true">{item.icon}</span>
}

function ItemPicture({ item }: { item: Unlockable }) {
  if (item.kind === 'figure') return <FigureImage fig={figPreset(item.ref)} />
  return <PartPicture item={item} />
}

/**
 * The 🛍️ shop's items: each with its picture, name and price. Buying spends coins (never below
 * zero: the button is off without enough) and unlocks the item in the Workshop for this save slot.
 */
export default function ShopPanel() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const play = usePlayData()
  return (
    <div className="bt-shop-grid" data-testid="play-shop">
      {UNLOCKABLES.map((item) => {
        const owned = play.unlocked.includes(item.id)
        const affordable = play.coins >= item.price
        return (
          <div key={item.id} className="bt-shop-item" data-testid={`shop-item-${item.id}`} data-owned={owned}>
            <span className="bt-shop-pic">
              <ItemPicture item={item} />
            </span>
            <span className="bt-shop-name">{item.name[lang]}</span>
            {owned ? (
              <span className="bt-btn bt-shop-buy bt-yes" aria-label={t('playOwned')} role="img">
                ✓
              </span>
            ) : (
              <button
                className="bt-btn bt-shop-buy"
                data-testid={`shop-buy-${item.id}`}
                aria-label={`${t('playBuy')} ${item.name[lang]}: ${item.price}`}
                title={affordable ? undefined : t('playNotEnough')}
                disabled={!affordable}
                onClick={() => {
                  const result = buy(item.id)
                  if ('error' in result) errorSound()
                  else coin()
                }}
              >
                🪙 {item.price}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
