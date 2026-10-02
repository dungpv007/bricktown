import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from './i18n'

/** What sits left of the top-right controls in the top row: the back button, the step counter... */
const LEFT_NEIGHBOURS = '.bt-topbar > :not(.bt-topbar-title), .bt-stepnav, .bt-maze-hud-top'

/** True when `children` (laid out in a row, `needed` px wide) do not fit between their left neighbours and `box`'s right edge. */
function tooWide(box: HTMLElement, needed: number): boolean {
  const r = box.getBoundingClientRect()
  const gap = parseFloat(getComputedStyle(box).columnGap) || 0
  let left = 0
  for (const el of document.querySelectorAll(LEFT_NEIGHBOURS)) {
    const n = el.getBoundingClientRect()
    const sameRow = n.top < r.bottom && n.bottom > r.top
    if (n.width > 0 && sameRow && n.left < r.right) left = Math.max(left, n.right)
  }
  return needed > r.right - left - gap
}

/**
 * The screen's controls in the top-right corner of the top bar, in a row. When the row does not fit
 * beside the back button (narrow phones), it folds into a ⋯ button that opens it as a column.
 * The children stay mounted either way (a control's own dialog keeps its state).
 */
export default function TopRight({ children }: { children: ReactNode }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const [folded, setFolded] = useState(false)
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    const el = box.current
    const items = row.current
    if (!el || !items) return
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!openRef.current) setFolded(tooWide(el, items.scrollWidth))
      })
    }
    const onResize = () => {
      setOpen(false)
      check()
    }
    const observer = new ResizeObserver(check)
    const watch = () => {
      observer.observe(items)
      for (const n of document.querySelectorAll(LEFT_NEIGHBOURS)) observer.observe(n)
    }
    watch()
    // Left neighbours that mount later (the top bar's save warning, a lazy step counter) count too.
    const mutation = new MutationObserver(() => {
      watch()
      check()
    })
    mutation.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div ref={box} className="bt-topright" data-folded={folded} data-open={folded && open}>
      {folded && open && <div className="bt-topright-backdrop" onClick={() => setOpen(false)} />}
      {/* A tap on one of the folded controls closes the column (its own dialog, if any, then shows). */}
      <div ref={row} className="bt-topright-items" onClick={() => setOpen(false)}>
        {children}
      </div>
      {folded && (
        <button
          className="bt-btn bt-icon-btn bt-topright-more"
          data-testid="topright-more"
          aria-label={t('moreControls')}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ⋯
        </button>
      )}
    </div>
  )
}
