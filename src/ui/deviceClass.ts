import { useSyncExternalStore } from 'react'

/**
 * Screen size classes, matching the media queries of theme.css: a phone has a shortest side under
 * 600px (smaller controls), portrait when it is at least as tall as it is wide.
 */
export type DeviceClass = 'phonePortrait' | 'phoneLandscape' | 'tablet'

export const DEVICE_CLASSES: readonly DeviceClass[] = ['phonePortrait', 'phoneLandscape', 'tablet']

/** Shortest side (CSS px) from which a screen counts as a tablet. */
const TABLET_MIN = 600

export function deviceClassOf(width: number, height: number): DeviceClass {
  if (Math.min(width, height) >= TABLET_MIN) return 'tablet'
  return height >= width ? 'phonePortrait' : 'phoneLandscape'
}

/** The class of the window right now ('tablet' without a window). */
export function currentDeviceClass(): DeviceClass {
  return typeof window === 'undefined' ? 'tablet' : deviceClassOf(window.innerWidth, window.innerHeight)
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

/** The window's device class, updated when it resizes or the device turns. */
export function useDeviceClass(): DeviceClass {
  return useSyncExternalStore(subscribe, currentDeviceClass, () => 'tablet')
}
