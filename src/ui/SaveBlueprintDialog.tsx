import { useState } from 'react'
import { composeBlueprint } from '../core/blueprint'
import { newId } from '../core/ids'
import { useCoverScene } from '../state/sceneCover'
import { useGame } from '../state/useGame'
import { DEFAULT_NAME_KEY, KIND_ICON } from './blueprintKinds'
import { useT } from './i18n'

/** Names the workshop model and saves it; updates the blueprint it was opened from, if any. */
export default function SaveBlueprintDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  useCoverScene()
  const workshop = useGame((s) => s.data.workshop)
  const blueprints = useGame((s) => s.data.blueprints)
  const upsertBlueprint = useGame((s) => s.upsertBlueprint)
  const setWorkshop = useGame((s) => s.setWorkshop)

  const existing = blueprints.find((b) => b.id === workshop.editingBlueprintId)
  const [name, setName] = useState(() => {
    if (existing) return existing.name
    const sameKind = blueprints.filter((b) => b.kind === workshop.kind).length
    return `${t(DEFAULT_NAME_KEY[workshop.kind])} ${sameKind + 1}`
  })

  const save = () => {
    const finalName = name.trim() || existing?.name || `${t(DEFAULT_NAME_KEY[workshop.kind])} ${blueprints.length + 1}`
    const bp = composeBlueprint({ name: finalName, workshop, id: newId(), now: Date.now(), existing })
    upsertBlueprint(bp)
    // Later saves from this workshop update the same blueprint.
    setWorkshop({ ...useGame.getState().data.workshop, editingBlueprintId: bp.id })
    onClose()
  }

  return (
    <div className="bt-modal-backdrop" onClick={onClose}>
      <form
        className="bt-dialog"
        role="dialog"
        aria-label={t('save')}
        data-testid="save-blueprint-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <span className="bt-dialog-kind" aria-hidden="true">{KIND_ICON[workshop.kind]}</span>
        <input
          className="bt-input"
          data-testid="save-blueprint-name"
          aria-label={t('blueprintName')}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="bt-row">
          <button type="button" className="bt-btn bt-no" data-testid="save-blueprint-cancel" aria-label={t('close')} onClick={onClose}>
            ✗
          </button>
          <button type="submit" className="bt-btn bt-yes" data-testid="save-blueprint-confirm" aria-label={t('save')}>
            ✓
          </button>
        </div>
      </form>
    </div>
  )
}
