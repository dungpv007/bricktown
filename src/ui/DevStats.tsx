import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/** Asked for with `?stats` in the address (any build, so it works on a real phone too). */
export const statsRequested = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('stats')
  } catch {
    return false
  }
}

/**
 * Renderer numbers over the scene (inside a `<Canvas>`): frames actually drawn per second (close to
 * 0 for a still scene rendering on demand), draw calls and triangles of the last frame (shadow pass
 * included), the pixel ratio and the canvas size in pixels.
 */
export default function DevStats() {
  const gl = useThree((s) => s.gl)
  const frames = useRef(0)
  const last = useRef({ calls: 0, triangles: 0 })
  // After the frame is drawn (priority would take over rendering, so read on the next frame instead).
  useFrame(() => {
    frames.current += 1
    last.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }
  })
  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'bt-stats'
    el.setAttribute('aria-hidden', 'true')
    el.dataset.testid = 'dev-stats'
    document.body.appendChild(el)
    let shown = 0
    let at = performance.now()
    const update = () => {
      const now = performance.now()
      const fps = ((frames.current - shown) * 1000) / Math.max(1, now - at)
      shown = frames.current
      at = now
      const c = gl.domElement
      el.textContent = `${fps.toFixed(0)} fps · ${last.current.calls} calls · ${(last.current.triangles / 1000).toFixed(1)}k tris · dpr ${gl
        .getPixelRatio()
        .toFixed(2)} · ${c.width}×${c.height}`
    }
    update()
    const timer = window.setInterval(update, 500)
    return () => {
      window.clearInterval(timer)
      el.remove()
    }
  }, [gl])
  return null
}
