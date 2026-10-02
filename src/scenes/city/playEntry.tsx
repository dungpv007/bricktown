import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import { cityScreen } from './cityScreen'

/**
 * Role-play games started from the City (a placement's ▶️ badge, the 🎮 action): the City view is
 * remembered on the way out and put back when the kid returns, so they land on the same spot.
 */

interface CityView {
  cityId: string
  target: [number, number, number]
  position: [number, number, number]
}

let pending: CityView | null = null

/** The view now (from the live scene's camera), or null without a City scene. */
function currentView(): CityView | null {
  const pose = cityScreen.cameraPose?.()
  if (!pose) return null
  const [tx, ty, tz] = pose.target
  const { distance: r, polar: phi, azimuth: theta } = pose
  return {
    cityId: useGame.getState().data.currentCityId,
    target: [tx, ty, tz],
    position: [tx + r * Math.sin(phi) * Math.sin(theta), ty + r * Math.cos(phi), tz + r * Math.sin(phi) * Math.cos(theta)],
  }
}

/** Opens game `gameId` from placement `placementId`, remembering the City view for the way back. */
export function playFromCity(gameId: string, placementId: string): void {
  pending = currentView()
  useApp.getState().startPlay({ gameId, from: 'city', placementId })
}

/**
 * Inside the City canvas: puts back the view remembered by `playFromCity` once the camera controls
 * exist (only for the same city; any other entry keeps the usual starting view).
 */
export function RestoreCityView() {
  const controls = useThree((s) => s.controls) as MapControlsImpl | null
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !controls) return
    done.current = true
    const view = pending
    pending = null
    if (!view || view.cityId !== useGame.getState().data.currentCityId) return
    camera.position.set(...view.position)
    controls.target.set(...view.target)
    controls.update()
    invalidate()
  }, [controls, camera, invalidate])
  return null
}
