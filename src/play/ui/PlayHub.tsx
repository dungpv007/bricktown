import { useState } from 'react'
import { useCoverScene } from '../../state/sceneCover'
import { useApp } from '../../state/useApp'
import { useT, type TKey } from '../../ui/i18n'
import { CoinCounter, StickerBadge } from '../kit/hud'
import { pickerGames } from '../registry'
import { STICKERS } from '../stickers'
import { startGameFromMenu, usePlayData } from '../usePlay'
import ShopPanel from './ShopPanel'
import '../play.css'

export type HubTab = 'games' | 'stickers' | 'shop'

const TABS: Array<{ tab: HubTab; icon: string; labelKey: TKey }> = [
  { tab: 'games', icon: '🎮', labelKey: 'playPicker' },
  { tab: 'stickers', icon: '🏅', labelKey: 'playStickers' },
  { tab: 'shop', icon: '🛍️', labelKey: 'playShop' },
]

/** Big cards, one per game; a game that has not landed yet says so (and opens its coming-soon card). */
function GamePicker() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  return (
    <div className="bt-cards bt-play-games" data-testid="play-picker">
      {pickerGames().map((g) => (
        <button
          key={g.id}
          className="bt-card"
          style={{ background: g.color }}
          data-testid={`play-game-${g.id}`}
          data-ready={g.scene !== null}
          onClick={() => startGameFromMenu(g.id)}
        >
          <span className="bt-card-icon" aria-hidden="true">{g.icon}</span>
          {g.name[lang]}
          {!g.scene && <span className="bt-play-soon">⏳ {t('playComingSoon')}</span>}
        </button>
      ))}
    </div>
  )
}

/** Every sticker: the collected ones in colour, the others as ❔ to look forward to. */
function StickerBook() {
  const play = usePlayData()
  const have = STICKERS.filter((s) => play.stickers.includes(s.id)).length
  return (
    <>
      <span className="bt-play-count" data-testid="sticker-count">
        🏅 {have} / {STICKERS.length}
      </span>
      <div className="bt-sticker-grid" data-testid="sticker-book">
        {STICKERS.map((s) => (
          <StickerBadge key={s.id} id={s.id} locked={!play.stickers.includes(s.id)} />
        ))}
      </div>
    </>
  )
}

/** The main menu's 🎮 Nhập vai: the game picker, the 🏅 sticker book and the 🛍️ shop, in tabs. */
export default function PlayHub({ onClose, initialTab = 'games' }: { onClose: () => void; initialTab?: HubTab }) {
  const t = useT()
  const [tab, setTab] = useState<HubTab>(initialTab)
  useCoverScene()
  return (
    <div className="bt-modal-backdrop" onClick={onClose}>
      <div className="bt-dialog bt-play-hub" role="dialog" aria-label={t('menuRolePlay')} data-testid="play-hub" onClick={(e) => e.stopPropagation()}>
        <div className="bt-play-hub-head">
          <div className="bt-play-tabs" role="tablist">
            {TABS.map((x) => (
              <button
                key={x.tab}
                role="tab"
                className="bt-btn bt-icon-btn"
                data-testid={`play-tab-${x.tab}`}
                aria-label={t(x.labelKey)}
                aria-selected={tab === x.tab}
                aria-pressed={tab === x.tab}
                onClick={() => setTab(x.tab)}
              >
                {x.icon}
              </button>
            ))}
          </div>
          <CoinCounter />
          <button className="bt-btn bt-icon-btn" data-testid="play-hub-close" aria-label={t('close')} onClick={onClose}>
            ✕
          </button>
        </div>
        {tab === 'games' && <GamePicker />}
        {tab === 'stickers' && <StickerBook />}
        {tab === 'shop' && <ShopPanel />}
      </div>
    </div>
  )
}
