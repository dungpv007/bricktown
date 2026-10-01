/** What the install tip needs to know about the browser (injectable so it can be unit-tested). */
export interface HintEnv {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** `display-mode` is standalone or fullscreen (the installed PWA). */
  displayModeInstalled: boolean
  /** Safari's non-standard `navigator.standalone` (iOS home-screen launch). */
  navigatorStandalone: boolean | undefined
}

/** iPhone, iPad and iPod, including iPadOS which reports itself as a Mac with a touch screen. */
export function isIos(env: Pick<HintEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1
}

export function isInstalled(env: Pick<HintEnv, 'displayModeInstalled' | 'navigatorStandalone'>): boolean {
  return env.displayModeInstalled || env.navigatorStandalone === true
}

/** iOS keeps browser storage only temporarily, so the tip shows there until installed or dismissed. */
export function shouldShowInstallHint(env: HintEnv, dismissed: boolean): boolean {
  return !dismissed && isIos(env) && !isInstalled(env)
}

export function readHintEnv(): HintEnv {
  const media = (q: string) => {
    try {
      return window.matchMedia(q).matches
    } catch {
      return false
    }
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    displayModeInstalled: media('(display-mode: standalone)') || media('(display-mode: fullscreen)'),
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  }
}
