import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { setDragActive } from './dragActivity'
import { TAP_MAX_PX } from './tapGesture'

export interface ClientPoint { x: number; y: number }

/** Where parts dragged out of the palette can go (the workshop view registers itself). */
export interface PaletteDropTarget {
  /** The dragged part is over (x, y) on screen; null when the drag was cancelled. */
  hover(p: ClientPoint | null): void
  /** Released at (x, y): places the part there when it fits. */
  drop(p: ClientPoint): void
}

let target: PaletteDropTarget | null = null

/** Makes `t` the drop target for palette drags; returns a function that removes it again. */
export function registerPaletteDropTarget(t: PaletteDropTarget): () => void {
  target = t
  return () => {
    if (target === t) target = null
  }
}

/**
 * Lets a palette button be dragged onto the 3D view, when a drop target is registered (otherwise,
 * e.g. in Guided Build, the button only clicks). The button captures the pointer and the moves /
 * release are followed on the document, so touch drags work too. `begin` runs once the press has
 * moved far enough to be a drag (it makes the button's part the current one); a press that does
 * not move stays a normal click. Losing the pointer (pointercancel, lost capture), the window
 * losing focus or the page being hidden cancels the drag.
 */
export function usePaletteDrag(begin: () => void): (e: ReactPointerEvent<HTMLElement>) => void {
  const beginRef = useRef(begin)
  useEffect(() => {
    beginRef.current = begin
  }, [begin])
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  return useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!target || e.button !== 0 || !e.isPrimary) return
    stop.current?.()
    const id = e.pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    const button = e.currentTarget
    try {
      button.setPointerCapture(id)
    } catch {
      /* the pointer is already gone */
    }
    let dragging = false
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) >= TAP_MAX_PX) {
        dragging = true
        setDragActive('palette', true)
        beginRef.current()
      }
      if (dragging) target?.hover({ x: ev.clientX, y: ev.clientY })
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      cleanup()
      if (dragging) target?.drop({ x: ev.clientX, y: ev.clientY })
    }
    const cancel = () => {
      cleanup()
      if (dragging) target?.hover(null)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === id) cancel()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancel()
    }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      button.removeEventListener('lostpointercapture', onCancel)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', onVisibility)
      setDragActive('palette', false)
      stop.current = null
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    // Fires after pointerup too, but by then the release has already cleaned up.
    button.addEventListener('lostpointercapture', onCancel)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', onVisibility)
    stop.current = cancel
  }, [])
}
