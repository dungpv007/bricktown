import { useEffect, useState, type CSSProperties } from 'react'
import { HINT_COOLDOWN_MS } from '../../core/mazeRun'
import { useMazeRun } from '../../state/useMazeRun'
import Confetti from '../../ui/Confetti'
import { useT } from '../../ui/i18n'
import { formatSeconds } from './formatTime'

/** How often the clock on screen (and the hint's time-out) is refreshed. */
const TICK_MS = 100

/** `performance.now()`, refreshed every TICK_MS; also lets the hint arrows time out. */
function useNow(): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = performance.now()
      useMazeRun.getState().tick(t)
      setNow(t)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Hidden mirror of the run for e2e specs (production-safe, like `drive-status`). */
function RunProbe() {
  const phase = useMazeRun((s) => s.phase)
  const cell = useMazeRun((s) => s.carCell)
  const left = useMazeRun((s) => s.coinsLeft.length)
  const total = useMazeRun((s) => s.maze?.coins.length ?? 0)
  const hints = useMazeRun((s) => s.hintsUsed)
  const arrows = useMazeRun((s) => s.hintArrows.length)
  return (
    <output
      hidden
      data-testid="maze-run-status"
      data-phase={phase}
      data-cell={cell ? `${cell.cx},${cell.cz}` : ''}
      data-coins={total - left}
      data-total={total}
      data-hints={hints}
      data-arrows={arrows}
    />
  )
}

function Hud() {
  const t = useT()
  const now = useNow()
  const elapsed = useMazeRun((s) => s.elapsed)
  const left = useMazeRun((s) => s.coinsLeft.length)
  const total = useMazeRun((s) => s.maze?.coins.length ?? 0)
  const camera = useMazeRun((s) => s.camera)
  const toggleCamera = useMazeRun((s) => s.toggleCamera)
  const lastHintAt = useMazeRun((s) => s.lastHintAt)
  const cooling = lastHintAt !== null && now - lastHintAt < HINT_COOLDOWN_MS
  // 0 right after a hint, 1 when the next one is ready (drawn as a filling ring).
  const ready = lastHintAt === null ? 1 : Math.min(1, (now - lastHintAt) / HINT_COOLDOWN_MS)
  return (
    <>
      <div className="bt-maze-hud-top">
        <span className="bt-maze-chip" data-testid="maze-timer" role="timer" aria-label={t('mazeTime')}>
          ⏱️ {formatSeconds(elapsed(now), t)}
        </span>
        {total > 0 && (
          <span className="bt-maze-chip" data-testid="maze-coins" aria-label={t('mazeCoins')}>
            🪙 {total - left}/{total}
          </span>
        )}
      </div>
      <div className="bt-maze-hud-side">
        <button
          className="bt-btn bt-icon-btn"
          data-testid="maze-camera"
          data-mode={camera}
          aria-label={t('mazeCamera')}
          aria-pressed={camera === 'chase'}
          onClick={toggleCamera}
        >
          {camera === 'top' ? '📷' : '🎥'}
        </button>
        <button
          className="bt-btn bt-icon-btn bt-maze-hint"
          data-testid="maze-hint"
          data-state={cooling ? 'cooling' : 'ready'}
          aria-label={t('mazeHint')}
          disabled={cooling}
          style={{ '--bt-hint-ready': ready } as CSSProperties}
          onClick={() => useMazeRun.getState().askHint(performance.now())}
        >
          💡
        </button>
      </div>
    </>
  )
}

/** Three stars popping in one after the other; the ones not earned stay grey. */
function Stars({ stars }: { stars: 1 | 2 | 3 }) {
  const t = useT()
  return (
    <div className="bt-maze-stars" data-testid="maze-win-stars" data-stars={stars} role="img" aria-label={`${t('mazeStars')}: ${stars}/3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= stars ? 'bt-maze-star bt-maze-star-on' : 'bt-maze-star'} style={{ animationDelay: `${0.3 + n * 0.25}s` }}>
          ★
        </span>
      ))}
    </div>
  )
}

function WinOverlay({ onRetry, onEdit, onMenu }: Actions) {
  const t = useT()
  const result = useMazeRun((s) => s.result)
  if (!result) return null
  const { best } = result
  return (
    <div className="bt-celebrate bt-maze-win" data-testid="maze-win" role="dialog" aria-label={t('mazeWin')}>
      <Confetti />
      <div className="bt-celebrate-card bt-maze-win-card">
        <div className="bt-celebrate-title">🏁 {t('mazeWin')}</div>
        <Stars stars={result.stars} />
        <div className="bt-maze-win-stats">
          <span className="bt-maze-chip" data-testid="maze-win-time" aria-label={t('mazeTime')}>
            ⏱️ {formatSeconds(result.timeMs, t)}
          </span>
          {result.totalCoins > 0 && (
            <span className="bt-maze-chip" data-testid="maze-win-coins" aria-label={t('mazeCoins')}>
              🪙 {result.coins}/{result.totalCoins}
            </span>
          )}
        </div>
        {result.newRecord ? (
          <div className="bt-maze-record bt-maze-record-new" data-testid="maze-win-record" data-new="true">
            🏆 {t('mazeNewRecord')}
          </div>
        ) : (
          best && (
            <div className="bt-maze-record" data-testid="maze-win-record" data-new="false" aria-label={`${t('mazeBest')}: ${formatSeconds(best.timeMs, t)}`}>
              🏆 {formatSeconds(best.timeMs, t)} {'★'.repeat(best.stars)}
              {'☆'.repeat(3 - best.stars)}
            </div>
          )
        )}
        <div className="bt-row">
          <button className="bt-btn bt-celebrate-btn" data-testid="maze-retry" aria-label={t('mazeRetry')} onClick={onRetry}>
            🔁 {t('mazeRetry')}
          </button>
          <button className="bt-btn bt-celebrate-btn" data-testid="maze-win-edit" aria-label={t('mazeEditMaze')} onClick={onEdit}>
            🧱 {t('mazeEditMaze')}
          </button>
          <button className="bt-btn bt-celebrate-btn" data-testid="maze-win-menu" aria-label={t('mazeToMenu')} onClick={onMenu}>
            🏠
          </button>
        </div>
      </div>
    </div>
  )
}

interface Actions {
  onRetry: () => void
  onEdit: () => void
  onMenu: () => void
}

/** The run's HUD over the drive controls (time, coins, camera, hint) and the finish card. */
export default function MazeDriveUI(actions: Actions) {
  const won = useMazeRun((s) => s.phase === 'won')
  return (
    <div className="bt-maze-hud" data-testid="maze-hud">
      <RunProbe />
      {won ? <WinOverlay {...actions} /> : <Hud />}
    </div>
  )
}
