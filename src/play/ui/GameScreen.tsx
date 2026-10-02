import { useEffect } from 'react'
import { useApp } from '../../state/useApp'
import SceneBoundary from '../../ui/SceneBoundary'
import TopRight from '../../ui/TopRight'
import { useT } from '../../ui/i18n'
import { CoinCounter } from '../kit/hud'
import { gameById, type GameDef } from '../registry'
import { exitGame } from '../usePlay'
import '../play.css'

/** A game that has not landed yet: its icon, "coming soon" and a big ←. */
function ComingSoon({ game }: { game: GameDef }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  return (
    <div className="bt-play-overlay" data-testid="play-coming-soon">
      <div className="bt-play-card">
        <span className="bt-play-card-icon" aria-hidden="true">{game.icon}</span>
        <span className="bt-play-card-title">{game.name[lang]}</span>
        <span className="bt-play-card-title" aria-hidden="true">⏳ {t('playComingSoon')}</span>
        <button className="bt-btn bt-play-big" data-testid="play-coming-soon-back" aria-label={t('back')} onClick={exitGame}>
          ←
        </button>
      </div>
    </div>
  )
}

/** Mode 'play': the game in progress (its lazy scene, or the coming-soon card) and the wallet. */
export default function GameScreen() {
  const session = useApp((s) => s.play)
  const game = session ? gameById(session.gameId) : undefined
  // A game that is not (or no longer) registered: back to the menu.
  useEffect(() => {
    if (!game) useApp.getState().setMode('menu')
  }, [game])
  if (!game) return null
  const Scene = game.scene
  return (
    <div className="bt-screen bt-play-screen" data-testid="mode-play" data-game={game.id}>
      <SceneBoundary>{Scene ? <Scene gameId={game.id} onExit={exitGame} /> : <ComingSoon game={game} />}</SceneBoundary>
      <TopRight>
        <CoinCounter />
      </TopRight>
    </div>
  )
}
