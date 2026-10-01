import { useEffect, useState, type CSSProperties } from 'react'
import { COLORS, colorMaterialKind, type MaterialKind } from '../../core/colors'
import { playabilityError, type PlayabilityError } from '../../core/maze'
import { useApp } from '../../state/useApp'
import { MAZE_NAME_MAX, currentMaze, useMazeEditor, useShownMaze, type MazeEditError, type MazeTool } from '../../state/useMazeEditor'
import ErrorBadge from '../../ui/ErrorBadge'
import { useT, type TKey } from '../../ui/i18n'
import { DIFFICULTIES, DIFFICULTY_KEY, MAZE_SIZES, SizeIcon } from './mazeChoices'

const TOOLS: Array<{ tool: MazeTool; icon: string; labelKey: TKey }> = [
  { tool: 'move', icon: '✋', labelKey: 'mazeToolMove' },
  { tool: 'wall', icon: '🧱', labelKey: 'mazeToolWall' },
  { tool: 'erase', icon: '🧽', labelKey: 'mazeToolErase' },
  { tool: 'entry', icon: '🚩', labelKey: 'mazeToolEntry' },
  { tool: 'exit', icon: '🏁', labelKey: 'mazeToolExit' },
  { tool: 'coin', icon: '🪙', labelKey: 'mazeToolCoin' },
]

const PROBLEM: Record<PlayabilityError, { icon: string; labelKey: TKey }> = {
  no_entry: { icon: '🚩', labelKey: 'mazeNoEntry' },
  no_exit: { icon: '🏁', labelKey: 'mazeNoExit' },
  no_path: { icon: '🚧', labelKey: 'mazeNoPath' },
}

const ERROR_LABEL: Record<MazeEditError, TKey> = {
  corner: 'mazeErrCorner',
  not_border: 'mazeErrNotBorder',
  same_cell: 'mazeErrSameCell',
  nothing: 'cantPlace',
}

const KIND_ORDER: MaterialKind[] = ['opaque', 'metal', 'trans']
const WALL_COLORS = KIND_ORDER.flatMap((kind) => COLORS.filter((c) => colorMaterialKind(c.id) === kind))
const SWATCH_CLASS: Record<MaterialKind, string> = {
  opaque: 'bt-swatch',
  trans: 'bt-swatch bt-swatch-trans',
  metal: 'bt-swatch bt-swatch-metal',
}

function ToolColumn() {
  const t = useT()
  const current = useMazeEditor((s) => s.tool)
  const setTool = useMazeEditor((s) => s.setTool)
  const undo = useMazeEditor((s) => s.undo)
  const canUndo = useMazeEditor((s) => s.canUndo)
  return (
    <div className="bt-toolbar bt-maze-tools bt-hud-panel" role="toolbar" aria-orientation="vertical">
      {TOOLS.map(({ tool, icon, labelKey }) => (
        <button
          key={tool}
          className="bt-btn bt-icon-btn"
          data-testid={`maze-tool-${tool}`}
          aria-label={t(labelKey)}
          aria-pressed={current === tool}
          onClick={() => setTool(tool)}
        >
          {icon}
        </button>
      ))}
      <div className="bt-toolbar-sep" aria-hidden="true" />
      <button className="bt-btn bt-icon-btn" data-testid="maze-undo" aria-label={t('toolUndo')} disabled={!canUndo} onClick={undo}>
        ↶
      </button>
    </div>
  )
}

/** ✅ when the maze can be driven, otherwise ⚠️ with what is missing; then the Drive button. */
function DriveCorner({ problem }: { problem: PlayabilityError | null }) {
  const t = useT()
  const setMode = useApp((s) => s.setMode)
  return (
    <div className="bt-topright">
      {problem === null ? (
        <span className="bt-maze-status bt-maze-ok" data-testid="maze-status" data-status="ok" role="status" aria-label={t('mazePlayable')}>
          ✅
        </span>
      ) : (
        <span className="bt-maze-status bt-maze-warn" data-testid="maze-status" data-status={problem} role="status" aria-label={t(PROBLEM[problem].labelKey)}>
          <span aria-hidden="true">⚠️ {PROBLEM[problem].icon}</span>
          <span className="bt-maze-status-text">{t(PROBLEM[problem].labelKey)}</span>
        </span>
      )}
      <button
        className="bt-btn bt-city-drive"
        data-testid="maze-drive"
        aria-label={t('mazeDrive')}
        disabled={problem !== null}
        onClick={() => setMode('mazeDrive')}
      >
        <span aria-hidden="true">🚗</span> {t('menuDrive')}
      </button>
    </div>
  )
}

type Popover = 'color' | 'size' | 'generate'

/** Right column: wall colour, size, 🎲; each opens a small panel of big choices. */
function SideColumn() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const maze = useShownMaze()
  const [open, setOpen] = useState<Popover | null>(null)
  if (!maze) return null
  const ed = useMazeEditor.getState
  const toggle = (p: Popover) => setOpen((o) => (o === p ? null : p))
  const wallHex = COLORS[maze.wallColor]?.hex ?? '#ffffff'
  return (
    <>
      <div className="bt-maze-side bt-hud-panel">
        <button
          className="bt-btn bt-icon-btn"
          data-testid="maze-color"
          aria-label={t('mazeWallColor')}
          aria-expanded={open === 'color'}
          onClick={() => toggle('color')}
        >
          <span className="bt-maze-color-chip" style={{ '--bt-swatch-color': wallHex } as CSSProperties} aria-hidden="true" />
        </button>
        <button className="bt-btn bt-icon-btn" data-testid="maze-size" aria-label={t('mazeSize')} aria-expanded={open === 'size'} onClick={() => toggle('size')}>
          📐
        </button>
        <button className="bt-btn bt-icon-btn" data-testid="maze-generate" aria-label={t('mazeGenerate')} aria-expanded={open === 'generate'} onClick={() => toggle('generate')}>
          🎲
        </button>
      </div>
      {open && <div className="bt-maze-pop-backdrop" onClick={() => setOpen(null)} />}
      {open === 'color' && (
        <div className="bt-maze-pop bt-maze-pop-colors bt-hud-panel" role="group" aria-label={t('mazeWallColor')}>
          {WALL_COLORS.map((c) => (
            <button
              key={c.id}
              className={SWATCH_CLASS[colorMaterialKind(c.id)]}
              style={{ '--bt-swatch-color': c.hex } as CSSProperties}
              data-testid={`maze-color-${c.id}`}
              aria-label={c.name[lang]}
              aria-pressed={maze.wallColor === c.id}
              onClick={() => {
                ed().setWallColor(c.id)
                setOpen(null)
              }}
            />
          ))}
        </div>
      )}
      {open === 'size' && (
        <div className="bt-maze-pop bt-hud-panel" role="group" aria-label={t('mazeSize')}>
          {MAZE_SIZES.map((n) => (
            <button
              key={n}
              className="bt-btn bt-maze-choice"
              data-testid={`maze-size-${n}`}
              aria-pressed={maze.w === n && maze.h === n}
              onClick={() => {
                ed().resize(n)
                setOpen(null)
              }}
            >
              <SizeIcon n={n} /> {n}×{n}
            </button>
          ))}
        </div>
      )}
      {open === 'generate' && (
        <div className="bt-maze-pop bt-hud-panel" role="group" aria-label={t('mazeGenerate')}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className="bt-btn bt-maze-choice"
              data-testid={`maze-gen-${d}`}
              aria-label={`${t('mazeGenerate')}: ${t(DIFFICULTY_KEY[d])}`}
              onClick={() => {
                ed().generate(d)
                setOpen(null)
              }}
            >
              <span aria-hidden="true">🎲 {'⭐'.repeat(d)}</span> {t(DIFFICULTY_KEY[d])}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/** The maze's name, editable; saved when the field is left or Enter is pressed. */
function NameChip() {
  const t = useT()
  const maze = useShownMaze()
  const name = maze?.name ?? ''
  const [draft, setDraft] = useState(name)
  const [editingFor, setEditingFor] = useState(name)
  // A new maze (or an undo) changed the name under the field: show it.
  if (editingFor !== name) {
    setEditingFor(name)
    setDraft(name)
  }
  const save = () => {
    useMazeEditor.getState().rename(draft)
    setDraft(currentMaze()?.name ?? draft)
  }
  return (
    <form
      className="bt-maze-name bt-hud-panel"
      onSubmit={(e) => {
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur()
      }}
    >
      <span aria-hidden="true">✏️</span>
      <input
        data-testid="maze-name"
        aria-label={t('mazeName')}
        value={draft}
        maxLength={MAZE_NAME_MAX}
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
      />
    </form>
  )
}

/** HTML overlay on top of the maze canvas. */
export default function MazeUI() {
  const errorSeq = useMazeEditor((s) => s.errorSeq)
  const lastError = useMazeEditor((s) => s.lastError)
  const maze = useShownMaze()
  // Live: a stroke being dragged already counts, so the kid sees a path close or open.
  const problem = maze ? playabilityError(maze) : 'no_entry'
  useEffect(() => () => useMazeEditor.getState().strokeCancel(), [])
  return (
    <div className="bt-maze-ui" data-testid="maze-editor">
      <DriveCorner problem={problem} />
      <ToolColumn />
      <SideColumn />
      <NameChip />
      <ErrorBadge errorSeq={errorSeq} testId="maze-error" labelKey={ERROR_LABEL[lastError ?? 'nothing']} />
    </div>
  )
}
