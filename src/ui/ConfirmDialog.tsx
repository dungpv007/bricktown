import { useT, type TKey } from './i18n'

interface Props {
  messageKey: TKey
  onYes: () => void
  onNo: () => void
}

/** Big green check / red cross question that sits above any other dialog. */
export default function ConfirmDialog({ messageKey, onYes, onNo }: Props) {
  const t = useT()
  return (
    <div
      className="bt-modal-backdrop bt-ask-backdrop"
      onClick={(e) => {
        e.stopPropagation() // do not also dismiss a dialog this one sits inside
        onNo()
      }}
    >
      <div className="bt-dialog bt-ask" role="alertdialog" aria-label={t(messageKey)} onClick={(e) => e.stopPropagation()}>
        <p className="bt-ask-text">{t(messageKey)}</p>
        <div className="bt-row">
          <button className="bt-btn bt-no" data-testid="confirm-no" aria-label={t('no')} onClick={onNo}>
            ✗
          </button>
          <button className="bt-btn bt-yes" data-testid="confirm-yes" aria-label={t('yes')} onClick={onYes}>
            ✓
          </button>
        </div>
      </div>
    </div>
  )
}
