import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { browserCanAnimateMenuBg } from './menuBgPolicy'

/**
 * Behind the main menu: the poster of the LEGO town right away (a plain image, so the menu's first
 * paint loads no 3D code), then, once the menu is up and the browser is idle, the live town
 * (scenes/menuBg, its own lazy chunk with three.js) fading in over it. Reduced motion, low-power
 * devices or any failure to load or draw it (including a lost WebGL context) keep the poster. A soft
 * shade keeps the menu readable.
 */

const POSTER = `${import.meta.env.BASE_URL}menu-bg.webp`
/** Give the menu this long to settle (and be tapped) before the 3D download starts. */
const LOAD_DELAY_MS = 800

/** Set by scripts/capture-menu-bg.mjs: the town holds still for the poster. */
const stillRequested = () => (window as { __btMenuBgStill?: boolean }).__btMenuBgStill === true

// Its own chunk, with three.js and r3f: fetched only when the town is about to play.
const MenuBackground = lazy(() => import('../scenes/menuBg/MenuBackground'))

/** The backdrop is decoration: if the town throws (no WebGL...), quietly keep the poster. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** True once the menu has had LOAD_DELAY_MS and the browser is idle (never when not `enabled`). */
function useIdleAfterDelay(enabled: boolean): boolean {
  const [due, setDue] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let idle: number | undefined
    const timer = window.setTimeout(() => {
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(() => setDue(true), { timeout: 2000 })
      else setDue(true)
    }, LOAD_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      if (idle !== undefined) cancelIdleCallback(idle)
    }
  }, [enabled])
  return due
}

/** `paused`: something covers the whole menu (first-launch tour, save slots), so the town need not move. */
export default function MenuBackdrop({ paused = false }: { paused?: boolean }) {
  const [animate] = useState(browserCanAnimateMenuBg)
  const [still] = useState(stillRequested)
  const due = useIdleAfterDelay(animate)
  const [ready, setReady] = useState(false)
  const [lost, setLost] = useState(false)
  // A lost WebGL context (GPU reset, memory pressure) drops the town for this visit: back to the poster.
  const live = due && !lost
  const onReady = useCallback(() => setReady(true), [])
  const onContextLost = useCallback(() => {
    setReady(false)
    setLost(true)
  }, [])

  return (
    <div className="bt-menu-bg" aria-hidden="true">
      <img className="bt-menu-bg-poster" data-testid="menu-bg-poster" src={POSTER} alt="" decoding="async" />
      {live && (
        <div className={`bt-menu-bg-live${ready ? ' bt-ready' : ''}`} data-testid="menu-bg-live" data-ready={ready}>
          {/* A chunk that fails to download (offline, gone after an update) or a scene that cannot draw keeps the poster. */}
          <Quiet>
            <Suspense fallback={null}>
              <MenuBackground still={still} paused={paused} onReady={onReady} onContextLost={onContextLost} />
            </Suspense>
          </Quiet>
        </div>
      )}
      <div className="bt-menu-bg-shade" />
    </div>
  )
}
