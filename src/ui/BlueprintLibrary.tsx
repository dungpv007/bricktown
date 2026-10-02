import { useCallback, useMemo, useState } from 'react'
import { buildModelPackage } from '../core/share'
import type { Blueprint } from '../core/types'
import { getThumbnail } from '../render/thumbnails'
import { useCoverScene } from '../state/sceneCover'
import { useGame } from '../state/useGame'
import { useShareImport } from '../state/useShareImport'
import { KIND_ICON } from './blueprintKinds'
import ConfirmDialog from './ConfirmDialog'
import { useT } from './i18n'
import ShareDialog from './share/ShareDialog'
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

function ShareModel({ blueprint, onClose }: { blueprint: Blueprint; onClose: () => void }) {
  const build = useCallback((withSteps: boolean) => buildModelPackage(blueprint, { withSteps }), [blueprint])
  return <ShareDialog build={build} offerSteps icon={KIND_ICON[blueprint.kind]} onClose={onClose} />
}

/** Grid of the kid's saved models as picture buttons; each can be shared, and friends' models imported (📥). */
export default function BlueprintLibrary({ onPick, onClose, allowDelete = true }: Props) {
  const t = useT()
  useCoverScene()
  const blueprints = useGame((s) => s.data.blueprints)
  const deleteBlueprint = useGame((s) => s.deleteBlueprint)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [sharing, setSharing] = useState<Blueprint | null>(null)
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
                <button
                  className="bt-btn bt-icon-btn bt-share-chip"
                  data-testid={`share-model-${bp.id}`}
                  aria-label={t('share')}
                  onClick={() => setSharing(bp)}
                >
                  🔗
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
        <div className="bt-row">
          <button
            className="bt-btn"
            data-testid="library-import"
            aria-label={t('importShared')}
            onClick={() => useShareImport.getState().openPicker()}
          >
            📥 {t('importShared')}
          </button>
          <button className="bt-btn" data-testid="blueprint-library-close" aria-label={t('close')} onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      {sharing && <ShareModel blueprint={sharing} onClose={() => setSharing(null)} />}
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
