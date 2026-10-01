import { useState } from 'react'
import { createPortal } from 'react-dom'
import { flushAutosave } from '../persistence/autosave'
import { downloadSave } from '../persistence/file'
import { persistWarning, usePersistStatus } from '../persistence/status'
import { useApp } from '../state/useApp'
import { useGame } from '../state/useGame'
import { useT } from './i18n'

/** ⚠️ that opens a short explanation with an "export file" button, so the kid can keep a backup. */
function WarningBadge({ warning }: { warning: 'load' | 'save' }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const message = warning === 'load' ? t('loadWarning') : t('saveFailed')
  const exportNow = () => {
    void flushAutosave() // one more try at saving, in the background
    downloadSave(useGame.getState().data, useApp.getState().slotId)
  }
  return (
    <>
      <button
        className="bt-btn bt-icon-btn bt-save-warning"
        data-testid="save-warning"
        aria-label={message}
        onClick={() => setOpen(true)}
      >
        ⚠️
      </button>
      {open &&
        createPortal(
          // above every scene control, not only the top bar
          <div className="bt-modal-backdrop bt-ask-backdrop" onClick={() => setOpen(false)}>
            <div
              className="bt-dialog bt-ask"
              data-testid="save-warning-help"
              role="alertdialog"
              aria-label={message}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="bt-dialog-kind" aria-hidden="true">
                💾⚠️
              </span>
              <p className="bt-ask-text">{message}</p>
              <p className="bt-save-help">{t('saveHelp')}</p>
              <div className="bt-row">
                <button
                  className="bt-btn bt-icon-btn"
                  data-testid="save-warning-close"
                  aria-label={t('close')}
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
                <button
                  className="bt-btn"
                  data-testid="save-warning-export"
                  aria-label={t('exportSave')}
                  onClick={exportNow}
                >
                  ⬇️ {t('exportSave')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** Shown in every scene's top bar while saving does not work (the slot is unreadable or a write failed). */
export default function SaveWarning() {
  const warning = usePersistStatus(persistWarning)
  // Keyed by kind: a new problem starts with the explanation closed.
  return warning ? <WarningBadge key={warning} warning={warning} /> : null
}
