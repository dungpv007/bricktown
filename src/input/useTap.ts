import { useCallback, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { isTap, type TapDown } from './tapGesture'

/**
 * Tracks pointer gestures on the R3F canvas (must be used inside `<Canvas>`).
 * Returns `consumeTap(pointerId)`: true once, while handling the pointerup that ended a tap with
 * that pointer. Drags (orbit), long presses and pinches are never taps.
 */
export function useTap(): (pointerId: number) => boolean {
  const el = useThree((s) => s.gl.domElement)
  const active = useRef(new Set<number>())
  const down = useRef<(TapDown & { id: number }) | null>(null)
  const multi = useRef(false)
  const tapPointer = useRef<number | null>(null)

  useEffect(() => {
    // pointerdown sits on the canvas itself and pointerup/cancel on window in the capture phase;
    // R3F listens on the canvas' parent, so the verdict is ready when R3F dispatches the same
    // pointerup to scene objects. Window also sees releases outside the canvas (over the UI).
    const onDown = (e: PointerEvent) => {
      tapPointer.current = null
      // A primary pointer starts a fresh gesture, so a pointerup lost earlier (e.g. released
      // outside the window) cannot make every later tap look like a pinch.
      if (e.isPrimary) active.current.clear()
      active.current.add(e.pointerId)
      if (active.current.size === 1) {
        down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, button: e.button }
        multi.current = false
      } else {
        multi.current = true
      }
    }
    const onUp = (e: PointerEvent) => {
      // Any release invalidates an older verdict: only this pointerup may be a tap.
      tapPointer.current = null
      active.current.delete(e.pointerId)
      const d = down.current
      if (d && d.id === e.pointerId) {
        if (isTap(d, { x: e.clientX, y: e.clientY, t: e.timeStamp }, multi.current)) {
          tapPointer.current = e.pointerId
        }
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
