import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { useFrameRequest } from './frameDriver'
import { selectionGlowMaterial, selectionRimMaterial } from './materials'

const SHAKE_SECONDS = 0.35

/**
 * Drives a selection highlight drawn with the shared `selectionGlowMaterial` / `selectionRimMaterial`:
 * pulses their opacity every frame and, each time `shakeKey` changes (an action was rejected), shakes
 * the returned group ref (attach it to the highlight's group) sideways by up to `amplitude` around
 * x = `baseX` for a moment. Only one highlight is shown at a time, so writing the shared materials
 * is safe. While `active` (a highlight is shown) the pulse keeps frames coming at the ambient rate;
 * a shake at the full rate.
 */
export function useHighlightPulse(shakeKey: number, amplitude: number, baseX = 0, active = true): RefObject<THREE.Group | null> {
  const group = useRef<THREE.Group>(null)
  const shakeStart = useRef<number | null>(null)
  const firstShakeKey = useRef(shakeKey)
  const invalidate = useThree((s) => s.invalidate)
  useFrameRequest(active, 'ambient')
  useEffect(() => {
    if (shakeKey === firstShakeKey.current) return
    shakeStart.current = performance.now()
    invalidate()
  }, [shakeKey, invalidate])

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6)
    selectionGlowMaterial.opacity = 0.35 + 0.45 * pulse
    selectionRimMaterial.opacity = 0.2 + 0.2 * pulse
    let offset = 0
    if (shakeStart.current !== null) {
      const t = (performance.now() - shakeStart.current) / 1000
      if (t < SHAKE_SECONDS) {
        offset = Math.sin(t * 60) * amplitude * (1 - t / SHAKE_SECONDS)
        invalidate()
      } else shakeStart.current = null
    }
    g.position.x = baseX + offset
  })
  return group
}
