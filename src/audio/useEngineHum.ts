import { useEffect } from 'react'
import { DRIVE } from '../core/drive'
import { useApp } from '../state/useApp'
import { useDriveStatus } from '../state/useDriveStatus'
import { startEngine, type EngineHum } from './sfx'

/**
 * A subtle engine hum while a drive scene is mounted: its pitch and level follow the car's speed
 * (published by the vehicle a few times per second). It stops when the drive closes, when sound
 * effects are switched off and while the page is hidden.
 */
export function useEngineHum(): void {
  useEffect(() => {
    let hum: EngineHum | null = null
    const speed = () => Math.min(1, Math.abs(useDriveStatus.getState().speed) / DRIVE.MAX_SPEED)
    const sync = () => {
      const want = useApp.getState().sfxOn && document.visibilityState !== 'hidden'
      if (want && !hum) {
        hum = startEngine()
        hum?.setSpeed(speed())
      } else if (!want && hum) {
        hum.stop()
        hum = null
      }
    }
    const stopSpeed = useDriveStatus.subscribe((s, prev) => {
      if (s.speed !== prev.speed) hum?.setSpeed(speed())
    })
    const stopPrefs = useApp.subscribe((s, prev) => {
      if (s.sfxOn !== prev.sfxOn) sync()
    })
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      stopSpeed()
      stopPrefs()
      document.removeEventListener('visibilitychange', sync)
      hum?.stop()
      hum = null
    }
  }, [])
}
