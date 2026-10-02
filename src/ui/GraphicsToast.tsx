import { useEffect } from 'react'
import { useGraphicsSession } from '../state/useGraphics'
import { useT } from './i18n'

/** How long the notice stays up unless tapped away. */
const SHOW_MS = 6000

/**
 * "Graphics lowered to keep things smooth": shown once when frames stayed slow and the preset stepped
 * down (see autoDowngrade). Tap ✕ (or wait) to dismiss; ⚙️ Đồ họa in the menu changes it back.
 */
export default function GraphicsToast() {
  const t = useT()
  const shown = useGraphicsSession((s) => s.toast)
  const dismiss = useGraphicsSession((s) => s.dismissToast)
  useEffect(() => {
    if (!shown) return
    const timer = window.setTimeout(dismiss, SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [shown, dismiss])
  if (!shown) return null
  return (
    <div className="bt-gfx-toast" role="status" data-testid="graphics-toast">
      <span aria-hidden="true">🔋</span>
      <span>{t('gfxLowered')}</span>
      <button className="bt-btn bt-gfx-toast-close" data-testid="graphics-toast-close" aria-label={t('close')} onClick={dismiss}>
        ✕
      </button>
    </div>
  )
}
