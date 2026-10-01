import { useEditor } from '../state/useEditor'
import { useT, type TKey } from './i18n'

type Action = 'rotate' | 'recolor' | 'duplicate' | 'delete' | 'deselect'

const ACTIONS: Array<{ action: Action; icon: string; labelKey: TKey }> = [
  { action: 'rotate', icon: '↻', labelKey: 'actRotate' },
  { action: 'recolor', icon: '🎨', labelKey: 'actRecolor' },
  { action: 'duplicate', icon: '📋', labelKey: 'actDuplicate' },
  { action: 'delete', icon: '🗑️', labelKey: 'actDelete' },
  { action: 'deselect', icon: '✕', labelKey: 'actDeselect' },
]

const run = (action: Action) => {
  const ed = useEditor.getState()
  switch (action) {
    case 'rotate': return ed.rotateSelected()
    case 'recolor': return ed.hintColors() // the swatches do the recolouring
    case 'duplicate': return ed.duplicateSelected()
    case 'delete': return ed.deleteSelected()
    case 'deselect': return ed.deselect()
  }
}

/** What can be done to the selected brick; shown only while a brick is selected. 🎨 points at the colour swatches. */
function ActionBar() {
  const t = useT()
  return (
    <div className="bt-actionbar bt-hud-panel" role="toolbar" aria-orientation="vertical" data-testid="action-bar">
      {ACTIONS.map(({ action, icon, labelKey }) => (
        <button
          key={action}
          className={`bt-btn bt-icon-btn bt-act-${action}`}
          data-testid={`act-${action}`}
          aria-label={t(labelKey)}
          onClick={() => run(action)}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

/** Left column: undo / redo, then the actions for the selected brick (when there is one). */
export default function Toolbar() {
  const t = useT()
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.canUndo)
  const canRedo = useEditor((s) => s.canRedo)
  const hasSelection = useEditor((s) => s.selectedId !== null)

  return (
    <>
      <div className="bt-toolbar bt-hud-panel" role="toolbar" aria-orientation="vertical">
        <button className="bt-btn bt-icon-btn" data-testid="undo" aria-label={t('toolUndo')} disabled={!canUndo} onClick={undo}>
          ↶
        </button>
        <button className="bt-btn bt-icon-btn" data-testid="redo" aria-label={t('toolRedo')} disabled={!canRedo} onClick={redo}>
          ↷
        </button>
      </div>
      {hasSelection && <ActionBar />}
    </>
  )
}
