import { useCallback, useEffect, useState } from 'react'
import type { SaveData } from '../core/types'
import { flushAutosave } from '../persistence/autosave'
import { downloadSave, pickAndImportSave } from '../persistence/file'
import { listSlots, type SlotSummary } from '../persistence/saves'
import { deleteSlotById, importIntoCurrentSlot, switchSlot } from '../persistence/session'
import { useApp, type SlotId } from '../state/useApp'
import { usePersistStatus } from '../persistence/status'
import { useGame } from '../state/useGame'
import { useT, type TKey } from './i18n'

const SLOTS: SlotId[] = [1, 2, 3]

type Pending = { kind: 'delete'; id: SlotId } | { kind: 'import'; data: SaveData }

export default function SlotMenu({ onClose }: { onClose: () => void }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const slotId = useApp((s) => s.slotId)
  const [summaries, setSummaries] = useState<SlotSummary[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const persistError = usePersistStatus((s) => s.error)

  const refresh = useCallback(async () => {
    await flushAutosave()
    setSummaries(await listSlots())
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      await flushAutosave()
      const list = await listSlots()
      if (alive) setSummaries(list)
    })()
    return () => {
      alive = false
    }
  }, [])

  const run = async (fn: () => Promise<boolean>, failKey: TKey = 'saveFailed') => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const ok = await fn()
      if (!ok) setError(t(failKey))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const onSelect = (id: SlotId) => {
    if (id === slotId) return
    void run(() => switchSlot(id))
  }

  const onImport = async () => {
    setError(null)
    const result = await pickAndImportSave()
    if (result.status === 'ok') setPending({ kind: 'import', data: result.data })
    else if (result.status === 'invalid') setError(t('importFailed'))
    // 'cancelled': nothing was chosen, so there is nothing to report
  }

  const onConfirm = () => {
    const p = pending
    setPending(null)
    if (!p) return
    if (p.kind === 'delete') void run(() => deleteSlotById(p.id), 'deleteFailed')
    else void run(() => importIntoCurrentSlot(p.data))
  }

  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="bt-modal" data-testid="slot-menu" role="dialog" aria-modal="true">
      <div className="bt-panel">
        <div className="bt-row bt-panel-head">
          <h2 className="bt-panel-title">{t('slot')}</h2>
          <button className="bt-btn" data-testid="slot-menu-close" aria-label={t('close')} onClick={onClose}>
            ✕
          </button>
        </div>

        {SLOTS.map((n) => {
          const info = summaries.find((s) => s.id === n)
          return (
            <div className="bt-slot-row" key={n}>
              <button
                className="bt-btn bt-slot-card"
                data-testid={`slot-${n}`}
                aria-pressed={slotId === n}
                disabled={busy}
                onClick={() => onSelect(n)}
              >
                <span className="bt-slot-num">{n}</span>
                <span className="bt-slot-info">
                  {info ? (
                    <>
                      <span>🏠 {info.blueprintCount}</span>
                      <small>{dateFmt.format(info.updatedAt)}</small>
                    </>
                  ) : (
                    <small>{t('slotEmpty')}</small>
                  )}
                </span>
              </button>
              <button
                className="bt-btn"
                data-testid={`delete-slot-${n}`}
                aria-label={t('toolDelete')}
                disabled={busy || (!info && slotId !== n)}
                onClick={() => setPending({ kind: 'delete', id: n })}
              >
                🗑️
              </button>
            </div>
          )
        })}

        <div className="bt-row">
          <button
            className="bt-btn"
            data-testid="export-save"
            aria-label={t('exportSave')}
            disabled={busy}
            onClick={() => {
              void flushAutosave()
              downloadSave(useGame.getState().data, slotId)
            }}
          >
            ⬇️ {t('exportSave')}
          </button>
          <button
            className="bt-btn"
            data-testid="import-save"
            aria-label={t('importSave')}
            disabled={busy}
            onClick={() => void onImport()}
          >
            ⬆️ {t('importSave')}
          </button>
        </div>
        {persistError === 'load' && (
          <p className="bt-error" data-testid="slot-load-warning" role="alert">
            ⚠️ {t('loadWarning')}
          </p>
        )}
        {error && (
          <p className="bt-error" data-testid="slot-error" role="alert">
            {error}
          </p>
        )}

        {pending && (
          <div className="bt-confirm" data-testid="confirm-dialog" role="alertdialog">
            <p>{pending.kind === 'delete' ? t('confirmDelete') : t('confirmImport')}</p>
            <div className="bt-row">
              <button className="bt-btn bt-yes" data-testid="confirm-yes" aria-label="OK" onClick={onConfirm}>
                ✓
              </button>
              <button className="bt-btn bt-no" data-testid="confirm-no" aria-label={t('back')} onClick={() => setPending(null)}>
                ✗
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
