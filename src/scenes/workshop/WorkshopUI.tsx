import { useEffect, useState } from 'react'
import type { Baseplate, BlueprintKind } from '../../core/types'
import { useEditor } from '../../state/useEditor'
import ColorPicker from '../../ui/ColorPicker'
import { useT, type TKey } from '../../ui/i18n'
import PartPalette from '../../ui/PartPalette'
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

const ERROR_ICON_MS = 900

function NewModelPicker({ onClose }: { onClose: () => void }) {
  const t = useT()
  const newModel = useEditor((s) => s.newModel)
  return (
    <div className="bt-modal-backdrop" onClick={onClose}>
      <div className="bt-modal" role="dialog" aria-label={t('newModel')} onClick={(e) => e.stopPropagation()}>
        <div className="bt-cards">
          {MODEL_OPTIONS.map((o) => (
            <button
              key={o.id}
              className="bt-card"
              style={{ background: o.color }}
              data-testid={`new-model-${o.id}`}
              onClick={() => {
                newModel(o.kind, o.baseplate)
                onClose()
              }}
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
      </div>
    </div>
  )
}

/** Brief red icon whenever an action is rejected (no text). */
function ErrorBadge() {
  const t = useT()
  const errorSeq = useEditor((s) => s.errorSeq)
  const [hiddenSeq, setHiddenSeq] = useState(errorSeq)
  useEffect(() => {
    if (errorSeq === hiddenSeq) return
    const id = setTimeout(() => setHiddenSeq(errorSeq), ERROR_ICON_MS)
    return () => clearTimeout(id)
  }, [errorSeq, hiddenSeq])
  if (errorSeq === hiddenSeq) return null
  return (
    <div key={errorSeq} className="bt-error-badge" role="status" aria-label={t('cantPlace')} data-testid="place-error">
      🚫
    </div>
  )
}

/** HTML overlay on top of the workshop canvas. */
export default function WorkshopUI() {
  const t = useT()
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div className="bt-workshop-ui">
      <div className="bt-topright">
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
      <ErrorBadge />
      {pickerOpen && <NewModelPicker onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
