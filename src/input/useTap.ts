import { useCallback, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { createGestureTracker, sampleOf } from './tapGesture'

/**
 * Tracks pointer gestures on the R3F canvas (must be used inside `<Canvas>`).
 * Returns `consumeTap(pointerId)`: true once, while handling the pointerup that ended a tap with
 * that pointer. Drags (orbit), long presses and pinches are never taps.
 */
export function useTap(): (pointerId: number) => boolean {
  const el = useThree((s) => s.gl.domElement)
  const tapPointer = useRef<number | null>(null)

  useEffect(() => {
    const gestures = createGestureTracker()
    // pointerdown sits on the canvas itself and pointerup/cancel on window in the capture phase;
    // R3F listens on the canvas' parent, so the verdict is ready when R3F dispatches the same
    // pointerup to scene objects. Window also sees releases outside the canvas (over the UI).
    const onDown = (e: PointerEvent) => {
      tapPointer.current = null
      gestures.down(sampleOf(e))
    }
    const onUp = (e: PointerEvent) => {
      // Any release invalidates an older verdict: only this pointerup may be a tap.
      tapPointer.current = gestures.up(sampleOf(e)).tap ? e.pointerId : null
    }
    const onCancel = (e: PointerEvent) => {
      gestures.cancel(e.pointerId)
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
