import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { Bounds } from '../../core/model'
import type { Baseplate } from '../../core/types'
import { GUIDED_HUD, hudFreeRect, hudSettled, toNdc } from '../workshop/safeArea'
import { VIEW_FOV, guidedFrame, stepRefit, type NdcRect, type Vec3, type View } from '../workshop/viewFit'

/** How long the camera glides outwards when a new step is out of view. */
const GLIDE_MS = 450

interface Glide { from: View; to: View; start: number }

/**
 * The Guided camera. Starts with the usual view of the plate unless what is on it (`startBox`: the
 * placed bricks and the current step's ghosts) would not show, then backs off around a target lifted
 * onto the build. After that it moves only when a new step starts (a new `stepBox`: that step's
 * bricks, or the whole model when it is finished) and those bricks are not all in view: then it
 * glides outwards at the player's angles, just far enough. Placing bricks never moves it, and a
 * player who zoomed in keeps their view while the next step shows.
 */
export default function GuidedCamera({
  size,
  startBox,
  stepBox,
  height,
}: {
  size: Baseplate
  startBox: Bounds | null
  stepBox: Bounds | null
  /** Top of the finished model (world units): how far the player may zoom out. */
  height: number
}) {
  const canvas = useThree((s) => s.gl.domElement)
  const view = useThree((s) => s.size)
  const safe = useCallback((): NdcRect => {
    return toNdc(hudFreeRect(canvas, GUIDED_HUD), view.width, view.height)
  }, [canvas, view])
  // Fixed at mount; later steps glide (see below).
  const [initial] = useState(() => guidedFrame(size, startBox, view.width / view.height, safe()))
  const camera = useRef<THREE.PerspectiveCamera>(null)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const glide = useRef<Glide | null>(null)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let cancelled = false
    // The HUD (step card, celebration card) is drawn by react-dom, which may commit after this scene
    // does, and the celebration card pops in with a scale animation: measure once it has settled.
    const frame = requestAnimationFrame(() => {
      void hudSettled(GUIDED_HUD).then(() => {
        const cam = camera.current
        const ctl = controls.current
        if (cancelled || !cam || !ctl) return
        const now: View = { position: [cam.position.x, cam.position.y, cam.position.z], target: [ctl.target.x, ctl.target.y, ctl.target.z] }
        // Measured from where the camera is heading if it is already gliding, so glides never fight.
        const next = stepRefit(size, stepBox, glide.current?.to ?? now, view.width / view.height, safe())
        if (next) {
          glide.current = { from: now, to: next, start: performance.now() }
          invalidate() // render on demand: the glide runs from the frame loop
        }
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [size, stepBox, view, safe, invalidate])

  // A camera drag by the player cancels a glide.
  const cancelGlide = useCallback(() => {
    glide.current = null
  }, [])

  useFrame(() => {
    const g = glide.current
    const cam = camera.current
    const ctl = controls.current
    if (!g || !cam || !ctl) return
    const k = Math.min(1, (performance.now() - g.start) / GLIDE_MS)
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2 // ease in-out
    const mix = (a: Vec3, b: Vec3, i: number) => a[i] + (b[i] - a[i]) * e
    cam.position.set(mix(g.from.position, g.to.position, 0), mix(g.from.position, g.to.position, 1), mix(g.from.position, g.to.position, 2))
    ctl.target.set(mix(g.from.target, g.to.target, 0), mix(g.from.target, g.to.target, 1), mix(g.from.target, g.to.target, 2))
    ctl.update()
    if (k >= 1) glide.current = null
    else invalidate() // the next step of the glide
  })

  const span = Math.max(size.w, size.d)
  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault position={initial.position} fov={VIEW_FOV} near={0.1} far={500} />
      {/* Same controls as the Workshop's CameraRig. */}
      <OrbitControls
        ref={controls}
        makeDefault
        onStart={cancelGlide}
        target={initial.target}
        enableDamping
        dampingFactor={0.12}
        minDistance={4}
        maxDistance={span * 4 + 20 + height * 2}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2 - 0.1}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />
    </>
  )
}
