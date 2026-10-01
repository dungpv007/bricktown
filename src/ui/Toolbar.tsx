import { useEditor, type Tool } from '../state/useEditor'
import { useT, type TKey } from './i18n'

const TOOLS: Array<{ tool: Tool; icon: string; labelKey: TKey }> = [
  { tool: 'place', icon: '🧱', labelKey: 'toolPlace' },
  { tool: 'paint', icon: '🖌️', labelKey: 'toolPaint' },
  { tool: 'delete', icon: '🗑️', labelKey: 'toolDelete' },
  { tool: 'rotate', icon: '🔄', labelKey: 'toolRotate' },
  { tool: 'move', icon: '✋', labelKey: 'toolMove' },
]

/** Left vertical tool column: editing tools, then undo / redo. */
export default function Toolbar() {
  const t = useT()
  const current = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  // Undo also cancels a brick picked up by the move tool.
  const canUndo = useEditor((s) => s.canUndo || s.carried !== null)
  const canRedo = useEditor((s) => s.canRedo && s.carried === null)

  return (
    <div className="bt-toolbar bt-hud-panel" role="toolbar" aria-orientation="vertical">
      {TOOLS.map(({ tool, icon, labelKey }) => (
        <button
          key={tool}
          className="bt-btn bt-icon-btn"
          data-testid={`tool-${tool}`}
          aria-label={t(labelKey)}
          aria-pressed={current === tool}
          onClick={() => setTool(tool)}
        >
          {icon}
        </button>
      ))}
      <div className="bt-toolbar-sep" aria-hidden="true" />
      <button className="bt-btn bt-icon-btn" data-testid="undo" aria-label={t('toolUndo')} disabled={!canUndo} onClick={undo}>
        ↶
      </button>
      <button className="bt-btn bt-icon-btn" data-testid="redo" aria-label={t('toolRedo')} disabled={!canRedo} onClick={redo}>
        ↷
      </button>
    </div>
  )
}
