/** What decides between the moving town and the still poster behind the main menu. */
export interface MenuBgEnv {
  reducedMotion: boolean
  /** `navigator.hardwareConcurrency` (absent or 0 when unknown). */
  cores?: number
  /** `navigator.deviceMemory` in GB (Chromium only). */
  memoryGb?: number
}

/**
 * The 3D town only plays when motion is welcome and the device is not a low-power one (4 cores or
 * fewer, 2 GB of memory or less); otherwise the poster stays. Unknown values do not count against it.
 */
export function canAnimateMenuBg({ reducedMotion, cores, memoryGb }: MenuBgEnv): boolean {
  if (reducedMotion) return false
  if (cores !== undefined && cores > 0 && cores <= 4) return false
  if (memoryGb !== undefined && memoryGb > 0 && memoryGb <= 2) return false
  return true
}

/** The browser's answer to `canAnimateMenuBg`. */
export function browserCanAnimateMenuBg(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return canAnimateMenuBg({
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
  })
}
