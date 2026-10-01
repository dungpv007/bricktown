import { useMemo, useState } from 'react'
import { fitsQr, shareFileName, shareFileText, shareLink, type SharePackage } from '../../core/share'
import { useT } from '../i18n'
import QrCode from './QrCode'
import { canShareNative, copyText, downloadText, shareNative } from './shareActions'
import { isLocalBase, shareBase } from './shareEnv'
import './share.css'

interface Props {
  /** The package to share; `withSteps` is the "with build instructions" choice (models only). */
  build: (withSteps: boolean) => SharePackage
  /** Models: offer the "with build instructions" switch. */
  offerSteps?: boolean
  /** Kind icon shown next to the name. */
  icon: string
  onClose: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Share a creation: a QR code of the link (when it fits), the system share sheet, copy the link,
 * or save a `.bricktown` file. Nothing leaves the device unless the kid taps one of them.
 */
export default function ShareDialog({ build, offerSteps = false, icon, onClose }: Props) {
  const t = useT()
  const [withSteps, setWithSteps] = useState(true)
  const [copy, setCopy] = useState<CopyState>('idle')
  const base = shareBase()
  const share = useMemo(() => {
    const pkg = build(offerSteps && withSteps)
    return { pkg, link: shareLink(pkg, base), fileText: shareFileText(pkg), fileName: shareFileName(pkg) }
  }, [build, offerSteps, withSteps, base])
  const { pkg, link, fileText, fileName } = share
  const noSteps = offerSteps && withSteps && !pkg.model?.steps
  const showQr = fitsQr(link)

  const onCopy = async () => setCopy((await copyText(link)) ? 'copied' : 'failed')

  return (
    <div
      className="bt-modal-backdrop bt-share-backdrop"
      onClick={(e) => {
        e.stopPropagation() // do not also close a dialog this one sits inside (the library)
        onClose()
      }}
    >
      <div
        className="bt-dialog bt-share"
        role="dialog"
        aria-label={t('share')}
        data-testid="share-dialog"
        data-link={link}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="bt-share-name">
          <span aria-hidden="true">{icon}</span> <span data-testid="share-name">{pkg.name}</span>
        </p>
        <div className="bt-share-body">
          <div className="bt-share-qr-box">
            {showQr ? (
              <QrCode text={link} label={t('share')} />
            ) : (
              <p className="bt-share-hint" data-testid="share-qr-too-long">
                <span aria-hidden="true">📏</span> {t('shareQrTooLong')}
              </p>
            )}
          </div>
          <div className="bt-share-side">
            {offerSteps && (
              <button
                className="bt-btn bt-share-steps"
                data-testid="share-with-steps"
                aria-pressed={withSteps}
                onClick={() => setWithSteps((v) => !v)}
              >
                <span aria-hidden="true">{withSteps ? '☑️' : '⬜'} 📋</span> {t('shareWithSteps')}
              </button>
            )}
            {noSteps && (
              <p className="bt-share-hint" data-testid="share-no-steps">
                <span aria-hidden="true">🧩</span> {t('shareNoSteps')}
              </p>
            )}
            <div className="bt-share-actions">
              {canShareNative() && (
                <button
                  className="bt-btn bt-share-act bt-share-main"
                  data-testid="share-native"
                  onClick={() => void shareNative({ title: pkg.name, url: link, fileText, fileName })}
                >
                  <span className="bt-share-act-icon" aria-hidden="true">📤</span>
                  {t('share')}
                </button>
              )}
              <button className="bt-btn bt-share-act" data-testid="share-copy" onClick={() => void onCopy()}>
                <span className="bt-share-act-icon" aria-hidden="true">{copy === 'copied' ? '✅' : '🔗'}</span>
                {copy === 'copied' ? t('shareCopied') : copy === 'failed' ? t('shareCopyFailed') : t('shareCopy')}
              </button>
              <button className="bt-btn bt-share-act" data-testid="share-download" onClick={() => downloadText(fileText, fileName)}>
                <span className="bt-share-act-icon" aria-hidden="true">💾</span>
                {t('shareDownload')}
              </button>
            </div>
            {isLocalBase(base) && (
              <p className="bt-share-hint" data-testid="share-local-hint">
                <span aria-hidden="true">🏠➡️💾</span> {t('shareLocalHint')}
              </p>
            )}
          </div>
        </div>
        <button className="bt-btn bt-no" data-testid="share-close" aria-label={t('close')} onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  )
}
