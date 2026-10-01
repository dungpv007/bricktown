import { useEffect, useRef } from 'react'
import type { PickHit } from '../../core/pick'
import type { Brick } from '../../core/types'
import { gestureIntent, type GestureFacts, type GestureStart } from '../../input/gestureIntent'
import { setDragActive } from '../../input/dragActivity'
import { createGestureTracker, sampleOf, TAP_MAX_PX } from '../../input/tapGesture'

export interface WorkshopGestureHandlers {
  /** What is under client point (x, y), skipping brick `excludeId`; null for the sky / ground. */
  pick: (x: number, y: number, excludeId?: string) => PickHit | null
  /** Lets one finger / the left button turn the camera (off while a press on a brick may move it). */
  setOrbit: (on: boolean) => void
  /** A press went down on a brick (it may become a move): stop any camera glide under the finger. */
  pressBrick: () => void
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
  /** The pointer has been TAP_MAX_PX or more from where it went down. */
  moved: boolean
  dragging: boolean
}

/**
 * The workshop's canvas gestures (see `gestureIntent`): a tap selects a brick, quick-places on the
 * empty plate or deselects on the sky; one finger dragging from a brick moves it while the camera
 * stays still (a long still press on a brick selects it, like a tap); any other one-finger drag
 * orbits and two fingers pinch / pan (OrbitControls). Leaving the app or losing the pointer
 * cancels a brick drag (the brick stays where it was). The
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
    const facts = (gesture: Gesture, ended: boolean, tap = false): GestureFacts => ({
      start: gesture.start, pointers: gesture.pointers, primary: gesture.primary, moved: gesture.moved, tap, ended,
    })
    /** Ends the current gesture's brick drag (drops or cancels it), if it has one. */
    const endDrag = (drop: boolean) => {
      if (!g?.dragging) return
      g.dragging = false
      setDragActive('brick', false)
      h.current.dragEnd(drop)
    }
    /** Ends the current gesture and gives the camera back. */
    const finish = (drop: boolean) => {
      endDrag(drop)
      g = null
      h.current.setOrbit(true)
    }

    const onDown = (e: PointerEvent) => {
      if (!tracker.down(sampleOf(e))) {
        // A second finger: pinch / pan the camera, whatever the first finger was doing.
        if (g) {
          g.pointers++
          endDrag(false)
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
        moved: false,
        dragging: false,
      }
      // Pressing a brick may become a move: the camera must not turn (or glide) under the finger.
      const holding = gestureIntent(facts(g, false)) === 'hold-brick'
      if (holding) h.current.pressBrick()
      h.current.setOrbit(!holding)
    }

    const onMove = (e: PointerEvent) => {
      if (!g) {
        if (e.pointerType === 'mouse' && e.buttons === 0 && e.target === el) h.current.hover(h.current.pick(e.clientX, e.clientY))
        return
      }
      if (e.pointerId !== g.pointerId) return
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= TAP_MAX_PX) g.moved = true
      const brick = g.hit?.brick
      if (!g.dragging && brick && gestureIntent(facts(g, false)) === 'drag-brick') {
        g.dragging = true
        setDragActive('brick', true)
        h.current.dragStart(brick)
      }
      if (g.dragging && brick) h.current.dragMove(h.current.pick(e.clientX, e.clientY, brick.id))
    }

    const onUp = (e: PointerEvent) => {
      const end = tracker.up(sampleOf(e))
      if (!g || e.pointerId !== g.pointerId) return
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= TAP_MAX_PX) g.moved = true
      if (g.dragging) {
        const brick = g.hit?.brick
        if (brick) h.current.dragMove(h.current.pick(e.clientX, e.clientY, brick.id))
        finish(true)
        return
      }
      const { hit } = g
      const intent = gestureIntent(facts(g, true, end.tap))
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

    // The app lost focus or was hidden, or the pointer was taken away: no release will come.
    const abandon = () => {
      if (!g) return
      tracker.cancel(g.pointerId)
      finish(false)
    }
    const onLostCapture = (e: PointerEvent) => {
      if (g && e.pointerId === g.pointerId) abandon()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') abandon()
    }

    // pointerdown on the canvas itself (presses on HUD buttons never start a gesture); moves and
    // releases on window, which also sees them outside the canvas (over the HUD).
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    el.addEventListener('lostpointercapture', onLostCapture)
    window.addEventListener('blur', abandon)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      el.removeEventListener('lostpointercapture', onLostCapture)
      window.removeEventListener('blur', abandon)
      document.removeEventListener('visibilitychange', onVisibility)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      finish(false)
    }
  }, [el])
}
