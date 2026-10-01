import { useT } from './i18n'

/** Shown while a scene's code (and, for drive, the physics engine) downloads: a bouncing brick, no words. */
export default function SceneLoading() {
  const t = useT()
  return (
    <div className="bt-scene-loading" data-testid="scene-loading" role="status" aria-label={t('loading')}>
      <span className="bt-scene-loading-brick" aria-hidden="true">🧱</span>
    </div>
  )
}
