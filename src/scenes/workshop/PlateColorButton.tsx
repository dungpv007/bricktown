import { useState, type CSSProperties } from 'react'
import { BASEPLATE_COLORS, plateColor } from '../../core/baseplate'
import { COLORS } from '../../core/colors'
import { useApp } from '../../state/useApp'
import { useEditor } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useT } from '../../ui/i18n'

const chip = (c: number) => ({ '--bt-plate-color': COLORS[c].hex }) as CSSProperties

/** Top-bar button showing the baseplate colour; opens the five plate colours (undoable choice). */
export default function PlateColorButton() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const current = useGame((s) => plateColor(s.data.workshop.baseplate, s.data.workshop.kind))
  const setPlateColor = useEditor((s) => s.setPlateColor)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="bt-btn bt-icon-btn"
        data-testid="plate-color"
        aria-label={t('plateColor')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="bt-plate-chip" style={chip(current)} aria-hidden="true" />
      </button>
      {open && (
        <div className="bt-modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="bt-ws-dialog bt-plate-colors"
            role="dialog"
            aria-label={t('plateColor')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bt-row">
              {BASEPLATE_COLORS.map((c) => (
                <button
                  key={c}
                  className="bt-btn bt-plate-choice"
                  data-testid={`plate-color-${c}`}
                  aria-label={COLORS[c].name[lang]}
                  aria-pressed={current === c}
                  onClick={() => {
                    setPlateColor(c)
                    setOpen(false)
                  }}
                >
                  <span className="bt-plate-chip" style={chip(c)} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="bt-btn" data-testid="plate-color-close" aria-label={t('close')} onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}
