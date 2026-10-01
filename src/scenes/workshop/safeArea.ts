import type { NdcRect } from './viewFit'

/** Pixel rectangle relative to the canvas' top-left corner. */
export interface PxRect { left: number; top: number; right: number; bottom: number }

/** The workshop HUD panels, grouped by the screen edge they cover. */
const HUD_EDGES = {
  left: ['.bt-toolbar'],
  right: ['.bt-colors'],
  top: ['.bt-topbar', '.bt-topright'],
  bottom: ['.bt-palette'],
} as const

/** Kept between the HUD and anything placed in the safe rect. */
const MARGIN = 12

let cached: PxRect | null = null
let observer: ResizeObserver | null = null
const invalidate = () => {
  cached = null
}
if (typeof window !== 'undefined') window.addEventListener('resize', invalidate)

/**
 * The part of the canvas no workshop HUD panel covers (minus a margin). Measured from the DOM once,
 * then cached until the window or a HUD panel resizes. Not cached while the HUD is still missing.
 */
export function safeRect(canvas: HTMLElement): PxRect {
  if (cached) return cached
  // The canvas' wrapper, laid out by CSS: right after a window resize the canvas element itself
  // still has its old size until three resizes it, which happens after scene effects run.
  const box = canvas.parentElement ?? canvas
  const c = box.getBoundingClientRect()
  const rect: PxRect = { left: 0, top: 0, right: c.width, bottom: c.height }
  const found: Element[] = []
  for (const [edge, selectors] of Object.entries(HUD_EDGES)) {
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (!el) continue
      found.push(el)
      const r = el.getBoundingClientRect()
      if (edge === 'left') rect.left = Math.max(rect.left, r.right - c.left)
      if (edge === 'right') rect.right = Math.min(rect.right, r.left - c.left)
      if (edge === 'top') rect.top = Math.max(rect.top, r.bottom - c.top)
      if (edge === 'bottom') rect.bottom = Math.min(rect.bottom, r.top - c.top)
    }
  }
  rect.left += MARGIN
  rect.top += MARGIN
  rect.right -= MARGIN
  rect.bottom -= MARGIN
  // A degenerate rect (e.g. a tiny window) falls back to the whole canvas.
  const out = rect.right - rect.left > 80 && rect.bottom - rect.top > 80 ? rect : { left: 0, top: 0, right: c.width, bottom: c.height }
  if (found.length === Object.values(HUD_EDGES).flat().length && typeof ResizeObserver !== 'undefined') {
    observer?.disconnect()
    let first = true
    // The first callback reports the current sizes: only later ones are changes.
    observer = new ResizeObserver(() => {
      if (first) first = false
      else invalidate()
    })
    for (const el of [box, ...found]) observer.observe(el)
    cached = out
  }
  return out
}

/** `rect` (pixels, y down) in normalized device coordinates for a canvas of `width` × `height`. */
export function toNdc(rect: PxRect, width: number, height: number): NdcRect {
  return {
    x0: (rect.left / width) * 2 - 1,
    x1: (rect.right / width) * 2 - 1,
    y0: 1 - (rect.bottom / height) * 2,
    y1: 1 - (rect.top / height) * 2,
  }
}
