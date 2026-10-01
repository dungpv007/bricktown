import { useState } from 'react'
import { INSTALL_HINT_KEY, readFlag, writeFlag } from './flags'
import { useT } from './i18n'
import { readHintEnv, shouldShowInstallHint } from './installTip'

/** Dismissible tip for iOS browsers (not installed): add to Home Screen and keep backups. */
export default function InstallHint() {
  const t = useT()
  const [visible, setVisible] = useState(() => shouldShowInstallHint(readHintEnv(), readFlag(INSTALL_HINT_KEY)))
  if (!visible) return null
  return (
    <div className="bt-install-hint" data-testid="install-hint" role="note">
      <span className="bt-install-hint-text">
        <span>📲 {t('installHintAdd')}</span>
        <span>💾 {t('installHintBackup')}</span>
      </span>
      <button
        className="bt-btn bt-icon-btn"
        data-testid="install-hint-dismiss"
        aria-label={t('close')}
        onClick={() => {
          writeFlag(INSTALL_HINT_KEY)
          setVisible(false)
        }}
      >
        ✕
      </button>
    </div>
  )
}
