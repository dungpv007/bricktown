import { useMemo, useState } from 'react'
import { MAZE_TEMPLATES } from '../../content/mazes'
import type { Maze, MazeTemplate } from '../../core/maze'
import type { MazeRecord } from '../../core/types'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import { useMazeEditor } from '../../state/useMazeEditor'
import ConfirmDialog from '../../ui/ConfirmDialog'
import { useT } from '../../ui/i18n'
import { formatSeconds } from './formatTime'
import { mazeThumbnail } from './mazeThumbnail'
import { DIFFICULTIES, DIFFICULTY_KEY, NEW_MAZE_SIZES, SizeIcon } from './mazeChoices'

// Purple is the 🎲 card's; yellow the "new" card's.
const CARD_COLORS = ['var(--bt-green)', 'var(--bt-orange)', 'var(--bt-blue)', 'var(--bt-red)', '#2b9fb3']

/** Best run as "🏆 12.3s ★★☆". */
function Best({ record }: { record: MazeRecord | undefined }) {
  const t = useT()
  if (!record) return null
  const time = formatSeconds(record.timeMs, t)
  return (
    <span className="bt-maze-best" aria-label={`${t('mazeBest')}: ${time}, ${record.stars}/3`}>
      🏆 {time} <span className="bt-maze-best-stars">{'★'.repeat(record.stars)}{'☆'.repeat(3 - record.stars)}</span>
    </span>
  )
}

function Thumb({ cacheKey, maze }: { cacheKey: string; maze: Maze }) {
  const url = useMemo(() => mazeThumbnail(cacheKey, maze), [cacheKey, maze])
  if (!url) return <span className="bt-card-icon" aria-hidden="true">🌀</span>
  return <img className="bt-tpl-thumb bt-maze-thumb" src={url} alt="" draggable={false} />
}

function templateAsMaze(tpl: MazeTemplate): Maze {
  return { ...tpl.maze, id: `tpl:${tpl.id}`, createdAt: 0, updatedAt: 0 }
}

type Choice = 'new' | 'random' | null

/**
 * Ready-made mazes, the kid's own, and two ways to start one: an empty maze of a chosen size, or
 * a random one of a chosen difficulty.
 */
export default function MazePicker() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const mine = useGame((s) => s.data.mazes)
  const records = useGame((s) => s.data.mazeRecords)
  const [choice, setChoice] = useState<Choice>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const ed = useMazeEditor.getState
  const newestFirst = [...mine].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="bt-guided-picker bt-maze-picker" data-testid="maze-picker">
      <h2 className="bt-picker-title">{t('mazePick')}</h2>
      <div className="bt-cards">
        <button className="bt-card bt-maze-make" style={{ background: 'var(--bt-yellow)' }} data-testid="maze-new" onClick={() => setChoice('new')}>
          <span className="bt-card-icon" aria-hidden="true">➕</span>
          {t('mazeNew')}
        </button>
        <button className="bt-card bt-maze-make" style={{ background: 'var(--bt-purple)' }} data-testid="maze-random" onClick={() => setChoice('random')}>
          <span className="bt-card-icon" aria-hidden="true">🎲</span>
          {t('mazeGenerate')}
        </button>
        {MAZE_TEMPLATES.map((tpl, i) => (
          <button
            key={tpl.id}
            className="bt-card bt-tpl-card"
            style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
            data-testid={`maze-tpl-${tpl.id}`}
            onClick={() => ed().openTemplate(tpl.id)}
          >
            <Thumb cacheKey={`tpl:${tpl.id}`} maze={templateAsMaze(tpl)} />
            {tpl.name[lang]}
            <span className="bt-tpl-stars" aria-label={`${tpl.difficulty}/3`}>
              {'⭐'.repeat(tpl.difficulty)}
            </span>
            <Best record={records[`tpl:${tpl.id}`]} />
          </button>
        ))}
      </div>
      {newestFirst.length > 0 && (
        <>
          <h3 className="bt-maze-section">{t('mazeMine')}</h3>
          <div className="bt-cards bt-maze-own-grid">
            {newestFirst.map((m) => (
              <div key={m.id} className="bt-maze-own">
                <button className="bt-card bt-tpl-card bt-maze-own-card" data-testid={`maze-own-${m.id}`} onClick={() => ed().openMaze(m.id)}>
                  <Thumb cacheKey={`${m.id}:${m.updatedAt}`} maze={m} />
                  <span className="bt-maze-own-name">{m.name}</span>
                  <Best record={records[m.id]} />
                </button>
                <button
                  className="bt-btn bt-maze-del"
                  data-testid={`maze-del-${m.id}`}
                  aria-label={t('mazeDelete')}
                  onClick={() => setPendingDelete(m.id)}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {choice !== null && (
        <div className="bt-modal-backdrop" onClick={() => setChoice(null)}>
          <div
            className="bt-dialog bt-maze-choose"
            data-testid="maze-choose"
            role="dialog"
            aria-label={t(choice === 'new' ? 'mazeNew' : 'mazeGenerate')}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="bt-ask-text">
              <span aria-hidden="true">{choice === 'new' ? '➕ ' : '🎲 '}</span>
              {t(choice === 'new' ? 'mazeSize' : 'mazeGenerate')}
            </p>
            <div className="bt-row">
              {choice === 'new'
                ? NEW_MAZE_SIZES.map((n) => (
                    <button key={n} className="bt-btn bt-maze-choice bt-maze-choice-big" data-testid={`maze-new-${n}`} onClick={() => ed().newMaze(n)}>
                      <SizeIcon n={n} /> {n}×{n}
                    </button>
                  ))
                : DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      className="bt-btn bt-maze-choice bt-maze-choice-big"
                      data-testid={`maze-random-${d}`}
                      onClick={() => ed().newGenerated(d)}
                    >
                      <span aria-hidden="true">{'⭐'.repeat(d)}</span> {t(DIFFICULTY_KEY[d])}
                    </button>
                  ))}
            </div>
            <button className="bt-btn bt-no" data-testid="maze-choose-close" aria-label={t('close')} onClick={() => setChoice(null)}>
              ✗
            </button>
          </div>
        </div>
      )}
      {pendingDelete !== null && (
        <ConfirmDialog
          messageKey="confirmDeleteMaze"
          onNo={() => setPendingDelete(null)}
          onYes={() => {
            useGame.getState().deleteMaze(pendingDelete)
            setPendingDelete(null)
          }}
        />
      )}
    </div>
  )
}
