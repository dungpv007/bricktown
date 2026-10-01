import { useEffect, useRef, useState, type RefObject } from 'react'
import type { TKey } from './i18n'
import { useT } from './i18n'
import { useApp } from '../state/useApp'
import SaveWarning from './SaveWarning'

/** The screens' own controls in the top row, beside the title. */
const TITLE_NEIGHBOURS = '.bt-topright, .bt-stepnav, .bt-maze-hud-top, .bt-drive-change'

/** Room (px) kept between the title and a neighbour. */
const TITLE_GAP = 8

/**
 * True while the title would touch one of the screen's top-row controls (narrow phones): it then
 * hides (the back button is enough) instead of being covered. A hidden title keeps its place, so
 * its box (what is measured) is the same either way. Checked whenever the window, the title, the
 * top bar or the screen's controls change.
 */
function useTitleSqueezed(title: RefObject<HTMLElement | null>): boolean {
  const [squeezed, setSqueezed] = useState(false)
  useEffect(() => {
    const el = title.current
    if (!el) return
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const touches = [...document.querySelectorAll(TITLE_NEIGHBOURS)].some((n) => {
          const b = n.getBoundingClientRect()
          return b.width > 0 && b.left < r.right + TITLE_GAP && b.right > r.left - TITLE_GAP && b.top < r.bottom && b.bottom > r.top
        })
        setSqueezed(touches)
      })
    }
    // The title, the back button beside it and the screen's controls: any of them changing size
    // (a ✏️ appears, a status grows, a row folds) can make room or take it.
    const resize = new ResizeObserver(check)
    const watch = () => {
      resize.observe(el)
      if (el.parentElement) resize.observe(el.parentElement)
      for (const n of document.querySelectorAll(TITLE_NEIGHBOURS)) resize.observe(n)
    }
    watch()
    // The screen's controls mount later (lazy scenes): watch them as they come.
    const mutation = new MutationObserver(() => {
      watch()
      check()
    })
    mutation.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    window.addEventListener('resize', check)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [title])
  return squeezed
}

/** `onBack` replaces the default "back to the main menu" (e.g. from an editor back to its picker). */
export default function TopBar({ titleKey, onBack }: { titleKey: TKey; onBack?: () => void }) {
  const t = useT()
  const setMode = useApp((s) => s.setMode)
  const title = useRef<HTMLSpanElement>(null)
  const squeezed = useTitleSqueezed(title)
  return (
    <div className="bt-topbar">
      <button className="bt-btn" data-testid="back" aria-label={t('back')} onClick={onBack ?? (() => setMode('menu'))}>
        ←
      </button>
      <span ref={title} className="bt-topbar-title" data-testid="mode-title" data-squeezed={squeezed}>
        {t(titleKey)}
      </span>
      <SaveWarning />
    </div>
  )
}
