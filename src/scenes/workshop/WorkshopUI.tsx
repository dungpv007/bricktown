import { useState } from 'react'
import type { Baseplate, Blueprint, BlueprintKind } from '../../core/types'
import { useEditor, useWorkshopHasBricks, workshopHasBricks } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import BlueprintLibrary from '../../ui/BlueprintLibrary'
import ColorPicker from '../../ui/ColorPicker'
import ConfirmDialog from '../../ui/ConfirmDialog'
import ErrorBadge from '../../ui/ErrorBadge'
import { useT, type TKey } from '../../ui/i18n'
import PartPalette from '../../ui/PartPalette'
import SaveBlueprintDialog from '../../ui/SaveBlueprintDialog'
import Toolbar from '../../ui/Toolbar'

interface ModelOption {
  id: string
  kind: BlueprintKind
  baseplate: Baseplate
  icon: string
  labelKeys: TKey[]
  color: string
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'vehicle', kind: 'vehicle', baseplate: { w: 8, d: 16 }, icon: '🚗', labelKeys: ['kindVehicle'], color: 'var(--bt-orange)' },
  { id: 'building-small', kind: 'building', baseplate: { w: 16, d: 16 }, icon: '🏠', labelKeys: ['kindBuilding', 'sizeSmall'], color: 'var(--bt-green)' },
  { id: 'building-large', kind: 'building', baseplate: { w: 32, d: 32 }, icon: '🏢', labelKeys: ['kindBuilding', 'sizeLarge'], color: 'var(--bt-blue)' },
  { id: 'prop', kind: 'prop', baseplate: { w: 8, d: 8 }, icon: '🪑', labelKeys: ['kindProp'], color: 'var(--bt-red)' },
]

function NewModelPicker({ onClose }: { onClose: () => void }) {
  const t = useT()
  const newModel = useEditor((s) => s.newModel)
  const hasBricks = useWorkshopHasBricks()
  // Starting over wipes the current build (and its undo history), so ask first when there is one.
  const [pending, setPending] = useState<ModelOption | null>(null)
  const start = (o: ModelOption) => {
    newModel(o.kind, o.baseplate)
    onClose()
  }

  return (
    <div className="bt-modal-backdrop" onClick={onClose}>
      <div className="bt-ws-dialog" role="dialog" aria-label={t('newModel')} onClick={(e) => e.stopPropagation()}>
        {pending ? (
          <div className="bt-ws-confirm" data-testid="new-model-confirm-step">
            <span className="bt-ws-confirm-icon" aria-hidden="true">🧱➜🗑️</span>
            <div className="bt-row">
              <button
                className="bt-btn bt-ws-confirm-btn bt-ws-confirm-no"
                data-testid="new-model-cancel"
                aria-label={t('back')}
                onClick={() => setPending(null)}
              >
                ✗
              </button>
              <button
                className="bt-btn bt-ws-confirm-btn bt-ws-confirm-yes"
                data-testid="new-model-confirm"
                aria-label={t('newModel')}
                onClick={() => start(pending)}
              >
                ✓
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bt-cards">
              {MODEL_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  className="bt-card"
                  style={{ background: o.color }}
                  data-testid={`new-model-${o.id}`}
                  onClick={() => (hasBricks ? setPending(o) : start(o))}
                >
                  <span className="bt-card-icon" aria-hidden="true">{o.icon}</span>
                  {o.labelKeys.map((k) => t(k)).join(' ')}
                  <span className="bt-card-size">{`${o.baseplate.w}×${o.baseplate.d}`}</span>
                </button>
              ))}
            </div>
            <button className="bt-btn" data-testid="new-model-close" aria-label={t('close')} onClick={onClose}>
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** HTML overlay on top of the workshop canvas. */
export default function WorkshopUI() {
  const t = useT()
  const errorSeq = useEditor((s) => s.errorSeq)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState<Blueprint | null>(null)
  const hasBricks = useWorkshopHasBricks()
  const loadBricks = useEditor((s) => s.loadBricks)

  const open = (bp: Blueprint) => {
    loadBricks(bp.bricks, bp.kind, bp.baseplate, bp.id)
    setPendingOpen(null)
    setLibraryOpen(false)
  }
  const onPick = (bp: Blueprint) => {
    const { workshop } = useGame.getState().data
    // Already open here: keep the unsaved edits (and their undo history) instead of reloading the saved copy.
    if (workshop.editingBlueprintId === bp.id) setLibraryOpen(false)
    // Opening replaces the model being built, so ask first unless there is nothing to lose.
    else if (workshopHasBricks()) setPendingOpen(bp)
    else open(bp)
  }

  return (
    <div className="bt-workshop-ui">
      <div className="bt-topright">
        <button
          className="bt-btn bt-icon-btn"
          data-testid="open-library"
          aria-label={t('open')}
          onClick={() => setLibraryOpen(true)}
        >
          📂
        </button>
        <button
          className="bt-btn bt-icon-btn"
          data-testid="save-blueprint"
          aria-label={t('save')}
          disabled={!hasBricks}
          onClick={() => {
            useEditor.getState().cancelCarry() // the saved model must include a brick in hand
            setSaveOpen(true)
          }}
        >
          💾
        </button>
        <button
          className="bt-btn bt-icon-btn"
          data-testid="new-model"
          aria-label={t('newModel')}
          onClick={() => setPickerOpen(true)}
        >
          📄
        </button>
      </div>
      <Toolbar />
      <ColorPicker />
      <PartPalette />
      <ErrorBadge errorSeq={errorSeq} testId="place-error" />
      {pickerOpen && <NewModelPicker onClose={() => setPickerOpen(false)} />}
      {saveOpen && <SaveBlueprintDialog onClose={() => setSaveOpen(false)} />}
      {libraryOpen && <BlueprintLibrary onPick={onPick} onClose={() => setLibraryOpen(false)} />}
      {pendingOpen && (
        <ConfirmDialog messageKey="confirmReplaceModel" onYes={() => open(pendingOpen)} onNo={() => setPendingOpen(null)} />
      )}
    </div>
  )
}
