import { useEffect, useRef } from 'react'
import type { PickHit } from '../../core/pick'
import type { Brick } from '../../core/types'
import { gestureIntent, type GestureFacts, type GestureStart } from '../../input/gestureIntent'
import { createGestureTracker, sampleOf, TAP_MAX_PX } from '../../input/tapGesture'

export interface WorkshopGestureHandlers {
  /** What is under client point (x, y), skipping brick `excludeId`; null for the sky / ground. */
  pick: (x: number, y: number, excludeId?: string) => PickHit | null
  /** Lets one finger / the left button turn the camera (off while a press on a brick may move it). */
  setOrbit: (on: boolean) => void
  tapBrick: (brick: Brick) => void
  tapPlate: (hit: PickHit) => void
  tapSky: () => void
  /** A drag that began on `brick` started moving it. */
  dragStart: (brick: Brick) => void
  /** The dragged brick is over `hit` (from a pick that skips the dragged brick), or over nothing. */
  dragMove: (hit: PickHit | null) => void
  /** The drag ended: `drop` true to put the brick down where it was last over, false to cancel. */
  dragEnd: (drop: boolean) => void
  /** Mouse hover with no button held: what the pointer is over (null when it left the view). */
  hover: (hit: PickHit | null) => void
}

interface Gesture {
  pointerId: number
  hit: PickHit | null
  start: GestureStart
  x0: number
  y0: number
  pointers: number
  primary: boolean
  dragging: boolean
}

/**
 * The workshop's canvas gestures (see `gestureIntent`): a tap selects a brick, quick-places on the
 * empty plate or deselects on the sky; one finger dragging from a brick moves it while the camera
 * stays still; any other one-finger drag orbits and two fingers pinch / pan (OrbitControls). The
 * scene is picked with its own raycast at pointerdown, so every decision is made here, before or
 * regardless of R3F's own pointer events.
 */
export function useWorkshopGestures(el: HTMLElement, handlers: WorkshopGestureHandlers): void {
  const h = useRef(handlers)
  useEffect(() => {
    h.current = handlers
  })

  useEffect(() => {
    const tracker = createGestureTracker()
    let g: Gesture | null = null
    const facts = (gesture: Gesture, moved: boolean, tap: boolean): GestureFacts => ({
      start: gesture.start, pointers: gesture.pointers, primary: gesture.primary, moved, tap,
    })
    /** Ends the current gesture's brick drag (if any) and gives the camera back. */
    const finish = (drop: boolean) => {
      if (g?.dragging) h.current.dragEnd(drop)
      g = null
      h.current.setOrbit(true)
    }

    const onDown = (e: PointerEvent) => {
      if (!tracker.down(sampleOf(e))) {
        // A second finger: pinch / pan the camera, whatever the first finger was doing.
        if (g) {
          g.pointers++
          if (g.dragging) h.current.dragEnd(false)
          g.dragging = false
        }
        h.current.setOrbit(true)
        return
      }
      if (g) finish(false) // a lost release: start over
      h.current.hover(null)
      const hit = h.current.pick(e.clientX, e.clientY)
      g = {
        pointerId: e.pointerId,
        hit,
        start: hit ? (hit.brick ? 'brick' : 'plate') : 'sky',
        x0: e.clientX,
        y0: e.clientY,
        pointers: 1,
        primary: e.button === 0,
        dragging: false,
      }
      // Pressing a brick may become a move: the camera must not turn under the finger.
      h.current.setOrbit(gestureIntent(facts(g, false, false)) !== 'hold-brick')
    }

    const onMove = (e: PointerEvent) => {
      if (!g) {
        if (e.pointerType === 'mouse' && e.buttons === 0 && e.target === el) h.current.hover(h.current.pick(e.clientX, e.clientY))
        return
      }
      if (e.pointerId !== g.pointerId) return
      const moved = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= TAP_MAX_PX
      const brick = g.hit?.brick
      if (!g.dragging && brick && gestureIntent(facts(g, moved, false)) === 'drag-brick') {
        g.dragging = true
        h.current.dragStart(brick)
      }
      if (g.dragging && brick) h.current.dragMove(h.current.pick(e.clientX, e.clientY, brick.id))
    }

    const onUp = (e: PointerEvent) => {
      const end = tracker.up(sampleOf(e))
      if (!g || e.pointerId !== g.pointerId) return
      if (g.dragging) {
        const brick = g.hit?.brick
        if (brick) h.current.dragMove(h.current.pick(e.clientX, e.clientY, brick.id))
        finish(true)
        return
      }
      const { hit } = g
      const intent = gestureIntent(facts(g, false, end.tap))
      finish(false)
      if (intent === 'tap-select' && hit?.brick) h.current.tapBrick(hit.brick)
      else if (intent === 'tap-place' && hit) h.current.tapPlate(hit)
      else if (intent === 'tap-deselect') h.current.tapSky()
    }

    const onCancel = (e: PointerEvent) => {
      tracker.cancel(e.pointerId)
      if (g && e.pointerId === g.pointerId) finish(false)
    }

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') h.current.hover(null)
    }

    // pointerdown on the canvas itself (presses on HUD buttons never start a gesture); moves and
    // releases on window, which also sees them outside the canvas (over the HUD).
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      if (g?.dragging) h.current.dragEnd(false)
      h.current.setOrbit(true)
    }
  }, [el])
}
