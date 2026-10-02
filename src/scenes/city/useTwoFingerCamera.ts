import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { classifyTwoFinger, shove, TILT_PER_PX, TURN_START, twist, type TouchPair, type TwoFingerMode } from '../../input/twoFingerCamera'

const UP = new THREE.Vector3(0, 1, 0)
const offset = new THREE.Vector3()
const spherical = new THREE.Spherical()

/**
 * Lets touch screens turn and tilt the city camera (see input/twoFingerCamera): the map controls
 * only pinch-zoom and pan with two fingers, so without this a phone or tablet could never change
 * the view's angle (the mouse turns it with the right button). Turns move the camera directly
 * (no glide); a tilt holds the controls' own pinch / pan while it lasts.
 */
export function useTwoFingerCamera(el: HTMLElement, controls: RefObject<MapControlsImpl | null>): void {
  useEffect(() => {
    const touches = new Map<number, { x: number; y: number }>()
    let start: TouchPair | null = null
    let last: TouchPair | null = null
    let mode: TwoFingerMode = 'undecided'
    let turned = 0

    const pairNow = (): TouchPair | null => {
      if (touches.size !== 2) return null
      const [a, b] = [...touches.values()]
      return { ax: a.x, ay: a.y, bx: b.x, by: b.y }
    }
    const holdControls = (hold: boolean) => {
      const c = controls.current
      if (!c) return
      c.enablePan = !hold
      c.enableZoom = !hold
    }
    const reset = () => {
      if (mode === 'tilt') holdControls(false)
      start = pairNow()
      last = start
      mode = 'undecided'
      turned = 0
    }
    /** Turns the camera around the target (radians about the vertical) and tilts it (radians from straight down). */
    const move = (turn: number, tilt: number) => {
      const c = controls.current
      if (!c || (turn === 0 && tilt === 0)) return
      offset.copy(c.object.position).sub(c.target)
      if (turn !== 0) offset.applyAxisAngle(UP, turn)
      if (tilt !== 0) {
        spherical.setFromVector3(offset)
        spherical.phi = Math.max(Math.max(c.minPolarAngle, 0.05), Math.min(c.maxPolarAngle, spherical.phi + tilt))
        offset.setFromSpherical(spherical)
      }
      c.object.position.copy(c.target).add(offset)
      c.update()
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      reset()
    }
    const onMove = (e: PointerEvent) => {
      const t = touches.get(e.pointerId)
      if (!t) return
      t.x = e.clientX
      t.y = e.clientY
      const now = pairNow()
      if (!now || !start || !last) return
      if (mode === 'undecided') {
        mode = classifyTwoFinger(start, now)
        if (mode === 'tilt') holdControls(true)
      }
      if (mode === 'turn') {
        // The map turns with the fingers once the twist is clearly meant.
        const d = twist(last, now)
        const before = turned
        turned += d
        const over = Math.abs(turned) - TURN_START
        if (over > 0) move(Math.abs(before) >= TURN_START ? d : Math.sign(turned) * over, 0)
      } else if (mode === 'tilt') {
        // Fingers pushed up tip the view towards the horizon.
        move(0, -shove(last, now) * TILT_PER_PX)
      }
      last = now
    }
    const onUp = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return
      reset()
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      if (mode === 'tilt') holdControls(false)
    }
  }, [el, controls])
}
