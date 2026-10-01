import { useCallback, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'

/** Tap = pointer down -> up within 250 ms and < 8 px of movement, with no second finger involved. */
export const TAP_MAX_MS = 250
export const TAP_MAX_PX = 8

interface Down {
  id: number
  x: number
  y: number
  t: number
}

/**
 * Tracks pointer gestures on the R3F canvas (must be used inside `<Canvas>`).
 * Returns `consumeTap(pointerId)`: true once, while handling the pointerup that ended a tap with
 * that pointer. Drags (orbit), long presses and pinches are never taps.
 */
export function useTap(): (pointerId: number) => boolean {
  const el = useThree((s) => s.gl.domElement)
  const active = useRef(new Set<number>())
  const down = useRef<Down | null>(null)
  const multi = useRef(false)
  const tapPointer = useRef<number | null>(null)

  useEffect(() => {
    // pointerdown sits on the canvas itself and pointerup/cancel on window in the capture phase;
    // R3F listens on the canvas' parent, so the verdict is ready when R3F dispatches the same
    // pointerup to scene objects. Window also sees releases outside the canvas (over the UI).
    const onDown = (e: PointerEvent) => {
      tapPointer.current = null
      active.current.add(e.pointerId)
      if (active.current.size === 1) {
        down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
        // Only the primary mouse button taps; right/middle drag pans the camera.
        multi.current = e.button !== 0
      } else {
        multi.current = true
      }
    }
    const onUp = (e: PointerEvent) => {
      active.current.delete(e.pointerId)
      const d = down.current
      if (d && d.id === e.pointerId) {
        const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
        const quick = e.timeStamp - d.t <= TAP_MAX_MS
        tapPointer.current = !multi.current && quick && moved < TAP_MAX_PX ? e.pointerId : null
        down.current = null
      }
    }
    const onCancel = (e: PointerEvent) => {
      active.current.delete(e.pointerId)
      if (down.current?.id === e.pointerId) down.current = null
      tapPointer.current = null
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
    }
  }, [el])

  return useCallback((pointerId: number) => {
    if (tapPointer.current !== pointerId) return false
    tapPointer.current = null
    return true
  }, [])
}
