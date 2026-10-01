import { useMemo, useState } from 'react'
import type { Blueprint } from '../core/types'
import { getThumbnail } from '../render/thumbnails'
import { useGame } from '../state/useGame'
import { KIND_ICON } from './blueprintKinds'
import ConfirmDialog from './ConfirmDialog'
import { useT } from './i18n'
import { useThumbnail } from './useThumbnail'

interface Props {
  /** Called with the tapped blueprint (Workshop opens it, City places it). */
  onPick: (blueprint: Blueprint) => void
  onClose: () => void
  /** Show the delete button on each card (default true). */
  allowDelete?: boolean
}

function BlueprintThumb({ blueprint }: { blueprint: Blueprint }) {
  const key = `bp:${blueprint.id}:${blueprint.updatedAt}`
  const url = useThumbnail(key, () => getThumbnail(key, blueprint.bricks))
  if (!url) return <span className="bt-thumb-fallback" aria-hidden="true">{KIND_ICON[blueprint.kind]}</span>
  return <img className="bt-thumb" src={url} alt="" draggable={false} />
}

/** Grid of the kid's saved models as picture buttons. */
export default function BlueprintLibrary({ onPick, onClose, allowDelete = true }: Props) {
  const t = useT()
  const blueprints = useGame((s) => s.data.blueprints)
  const deleteBlueprint = useGame((s) => s.deleteBlueprint)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const sorted = useMemo(() => [...blueprints].sort((a, b) => b.updatedAt - a.updatedAt), [blueprints])

  return (
    <div className="bt-modal-backdrop" onClick={onClose}>
      <div
        className="bt-dialog bt-library"
        role="dialog"
        aria-label={t('open')}
        data-testid="blueprint-library"
        onClick={(e) => e.stopPropagation()}
      >
        {sorted.length === 0 ? (
          <p className="bt-library-empty" data-testid="blueprint-library-empty">
            <span aria-hidden="true">🧱</span> {t('libraryEmpty')}
          </p>
        ) : (
          <div className="bt-library-grid">
            {sorted.map((bp) => (
              <div className="bt-library-item" key={bp.id}>
                <button
                  className="bt-btn bt-library-card"
                  data-testid={`blueprint-card-${bp.id}`}
                  aria-label={bp.name}
                  onClick={() => onPick(bp)}
                >
                  <BlueprintThumb blueprint={bp} />
                  <span className="bt-library-name">
                    <span aria-hidden="true">{KIND_ICON[bp.kind]}</span> {bp.name}
                  </span>
                </button>
                {allowDelete && (
                  <button
                    className="bt-btn bt-icon-btn bt-library-delete"
                    data-testid={`blueprint-delete-${bp.id}`}
                    aria-label={t('toolDelete')}
                    onClick={() => setPendingDelete(bp.id)}
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <button className="bt-btn" data-testid="blueprint-library-close" aria-label={t('close')} onClick={onClose}>
          ✕
        </button>
      </div>
      {pendingDelete !== null && (
        <ConfirmDialog
          messageKey="confirmDeleteBlueprint"
          onNo={() => setPendingDelete(null)}
          onYes={() => {
            deleteBlueprint(pendingDelete)
            setPendingDelete(null)
          }}
        />
      )}
    </div>
  )
}
