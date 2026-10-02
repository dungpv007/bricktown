import { useEffect, useRef } from 'react'
import { cityGestureIntent, type CityGestureFacts, type CityGestureStart } from '../../input/cityGestureIntent'
import { setDragActive } from '../../input/dragActivity'
import { createGestureTracker, sampleOf, TAP_MAX_PX } from '../../input/tapGesture'

/** A point on the ground plane, in world studs. */
export interface GroundPoint {
  x: number
  z: number
}

/** What is under a screen point: the nearest placement (if any) and the ground point (null off the plane). */
export interface CityPick {
  placementId: string | null
  point: GroundPoint | null
  /** `point` lies inside the city grid. */
  inside: boolean
}

export interface CityGestureHandlers {
  pick: (x: number, y: number) => CityPick
  /** Road mode is on (read when a gesture starts). */
  roadMode: () => boolean
  /** Lets one finger / the left button pan the camera (off while a press on a placement may move it). */
  setPan: (on: boolean) => void
  /** A press went down on a placement (it may become a move): stop any camera glide under the finger. */
  pressPlacement: () => void
  tapPlacement: (id: string) => void
  tapGround: (point: GroundPoint) => void
  tapOutside: () => void
  /** A drag that began on placement `id` (at ground point `from`) started moving it. */
  dragStart: (id: string, from: GroundPoint) => void
  /** The dragged placement is over ground point `point` (null: off the ground plane). */
  dragMove: (point: GroundPoint | null) => void
  /** The drag ended: `drop` true to put the placement down where it was last over, false to cancel. */
  dragEnd: (drop: boolean) => void
  /** Road mode: a one-finger stroke started at / moved to `point`. */
  roadStart: (point: GroundPoint) => void
  roadMove: (point: GroundPoint) => void
  /** The stroke ended: `commit` true applies it, false (a second finger, a lost pointer) drops it. */
  roadEnd: (commit: boolean) => void
  /** Mouse hover with no button held: the ground point under the pointer (null when it left the view). */
  hover: (point: GroundPoint | null) => void
}

interface Gesture {
  pointerId: number
  hit: CityPick
  start: CityGestureStart
  roadMode: boolean
  x0: number
  y0: number
  pointers: number
  primary: boolean
  moved: boolean
  dragging: boolean
  painting: boolean
}

/**
 * The city's canvas gestures (see `cityGestureIntent`), following the Workshop's
 * `useWorkshopGestures`: a tap selects a placement, acts on the empty ground (quick-place or
 * deselect) or deselects outside the city; one finger dragging from a placement moves it while the
 * camera stays still; any other one-finger drag pans and two fingers zoom / pan (MapControls).
 * In road mode one finger paints or erases roads instead. A second finger, leaving the app or losing
 * the pointer cancels a move (the placement stays) or a road stroke.
 */
export function useCityGestures(el: HTMLElement, handlers: CityGestureHandlers): void {
  const h = useRef(handlers)
  useEffect(() => {
    h.current = handlers
  })

  useEffect(() => {
    const tracker = createGestureTracker()
    let g: Gesture | null = null
    const facts = (gesture: Gesture, ended: boolean, tap = false): CityGestureFacts => ({
      start: gesture.start,
      roadMode: gesture.roadMode,
      pointers: gesture.pointers,
      primary: gesture.primary,
      moved: gesture.moved,
      tap,
      ended,
    })
    /** Ends the current gesture's placement drag or road stroke (applying it or not), if any. */
    const endEdit = (apply: boolean) => {
      if (g?.dragging) {
        g.dragging = false
        setDragActive('brick', false)
        h.current.dragEnd(apply)
      }
      if (g?.painting) {
        g.painting = false
        h.current.roadEnd(apply)
      }
    }
    /** Ends the current gesture and gives the camera back. */
    const finish = (apply: boolean) => {
      endEdit(apply)
      g = null
      h.current.setPan(true)
    }
    const pointOf = (e: PointerEvent) => h.current.pick(e.clientX, e.clientY).point

    const onDown = (e: PointerEvent) => {
      if (!tracker.down(sampleOf(e))) {
        // A second finger: zoom / pan the camera, whatever the first finger was doing.
        if (g) {
          g.pointers++
          endEdit(false)
        }
        h.current.setPan(true)
        return
      }
      if (g) finish(false) // a lost release: start over
      h.current.hover(null)
      const hit = h.current.pick(e.clientX, e.clientY)
      g = {
        pointerId: e.pointerId,
        hit,
        start: hit.placementId ? 'placement' : hit.inside ? 'ground' : 'outside',
        roadMode: h.current.roadMode(),
        x0: e.clientX,
        y0: e.clientY,
        pointers: 1,
        primary: e.button === 0,
        moved: false,
        dragging: false,
        painting: false,
      }
      const intent = cityGestureIntent(facts(g, false))
      if (intent === 'road' && hit.point) {
        g.painting = true
        h.current.roadStart(hit.point)
      }
      // Pressing a placement may become a move: the camera must not pan (or glide) under the finger.
      const holding = intent === 'hold-placement'
      if (holding) h.current.pressPlacement()
      h.current.setPan(!holding)
    }

    const onMove = (e: PointerEvent) => {
      if (!g) {
        if (e.pointerType === 'mouse' && e.buttons === 0) h.current.hover(e.target === el ? pointOf(e) : null)
        return
      }
      if (e.pointerId !== g.pointerId) return
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= TAP_MAX_PX) g.moved = true
      if (g.painting) {
        const point = pointOf(e)
        if (point) h.current.roadMove(point)
        return
      }
      const id = g.hit.placementId
      if (!g.dragging && id && g.hit.point && cityGestureIntent(facts(g, false)) === 'drag-placement') {
        g.dragging = true
        setDragActive('brick', true)
        h.current.dragStart(id, g.hit.point)
      }
      if (g.dragging) h.current.dragMove(pointOf(e))
    }

    const onUp = (e: PointerEvent) => {
      const end = tracker.up(sampleOf(e))
      if (!g || e.pointerId !== g.pointerId) return
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= TAP_MAX_PX) g.moved = true
      if (g.painting) {
        const point = pointOf(e)
        if (point) h.current.roadMove(point)
        finish(true)
        return
      }
      if (g.dragging) {
        h.current.dragMove(pointOf(e))
        finish(true)
        return
      }
      const { hit } = g
      const intent = cityGestureIntent(facts(g, true, end.tap))
      finish(false)
      if (intent === 'tap-select' && hit.placementId) h.current.tapPlacement(hit.placementId)
      else if (intent === 'tap-ground' && hit.point) h.current.tapGround(hit.point)
      else if (intent === 'tap-deselect') h.current.tapOutside()
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
