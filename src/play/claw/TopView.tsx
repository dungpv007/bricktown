import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { MACHINE_D, MACHINE_W, ROOF_UNDERSIDE } from './machine'

/**
 * A small picture-in-picture view straight down into the prize pit, in the top right corner: from the
 * front it is hard to see how deep the claw is, from above it is plain. It is a second render pass
 * into a scissored corner of the same canvas, done in the frame the scene draws anyway (render on
 * demand: no extra frames). While mounted this component draws the whole frame (main view first).
 *
 * `topViewRect` gives the corner in CSS pixels; the game draws a frame (HTML) over the same rect.
 */

/** The pit area the top view shows (studs): the inside of the glass box and a little more. */
const VIEW_W = MACHINE_W - 0.4
const VIEW_D = MACHINE_D - 0.4
export const TOP_VIEW_ASPECT = VIEW_W / VIEW_D

/** The corner (CSS px, from the canvas's top left) for a canvas `width` wide. */
export function topViewRect(width: number): { left: number; top: number; width: number; height: number } {
  const w = Math.round(Math.min(260, Math.max(140, width * 0.24)))
  const h = Math.round(w / TOP_VIEW_ASPECT)
  // Phones held upright put the HUD under the top bar: the view goes lower there (see claw.css).
  return { left: width - 16 - w, top: width < 600 ? 150 : 90, width: w, height: h }
}

export default function TopView({ enabled }: { enabled: boolean }) {
  const camera = useMemo(() => {
    const c = new THREE.OrthographicCamera(-VIEW_W / 2, VIEW_W / 2, VIEW_D / 2, -VIEW_D / 2, 0.1, 30)
    // Just under the gantry (so the rails and the roof stay out of the picture), looking down, the
    // kid's side (+z) at the bottom.
    c.position.set(0, ROOF_UNDERSIDE - 0.9, 0)
    c.up.set(0, 0, -1)
    c.lookAt(0, 0, 0)
    c.updateMatrixWorld()
    return c
  }, [])
  const invalidate = useThree((s) => s.invalidate)
  // Turning it on or off needs a frame.
  useEffect(() => invalidate(), [enabled, invalidate])
  useFrame(({ gl, scene, camera: main, size }) => {
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(scene, main)
    if (!enabled) return
    const r = topViewRect(size.width)
    const y = size.height - r.top - r.height // GL counts from the bottom
    gl.setViewport(r.left, y, r.width, r.height)
    gl.setScissor(r.left, y, r.width, r.height)
    gl.setScissorTest(true)
    gl.render(scene, camera)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
  }, 1)
  return null
}
