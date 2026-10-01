import { describe, expect, it } from 'vitest'
import { isIos, isInstalled, shouldShowInstallHint, type HintEnv } from './installTip'

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'

const env = (over: Partial<HintEnv> = {}): HintEnv => ({
  userAgent: IPAD_UA,
  platform: 'iPad',
  maxTouchPoints: 5,
  displayModeInstalled: false,
  navigatorStandalone: false,
  ...over,
})

describe('isIos', () => {
  it('recognises iPhone and iPad user agents', () => {
    expect(isIos(env())).toBe(true)
    expect(isIos(env({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }))).toBe(true)
  })
  it('recognises iPadOS desktop mode (a touch-screen Mac)', () => {
    expect(isIos(env({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 }))).toBe(true)
  })
  it('rejects a real Mac and Android', () => {
    expect(isIos(env({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 }))).toBe(false)
    expect(isIos(env({ userAgent: ANDROID_UA, platform: 'Linux armv81', maxTouchPoints: 5 }))).toBe(false)
  })
})

describe('isInstalled', () => {
  it('is true for the standalone/fullscreen display mode or navigator.standalone', () => {
    expect(isInstalled(env())).toBe(false)
    expect(isInstalled(env({ displayModeInstalled: true }))).toBe(true)
    expect(isInstalled(env({ navigatorStandalone: true }))).toBe(true)
    expect(isInstalled(env({ navigatorStandalone: undefined }))).toBe(false)
  })
})

describe('shouldShowInstallHint', () => {
  it('shows on iOS in the browser until dismissed', () => {
    expect(shouldShowInstallHint(env(), false)).toBe(true)
    expect(shouldShowInstallHint(env(), true)).toBe(false)
  })
  it('hides when installed or not on iOS', () => {
    expect(shouldShowInstallHint(env({ navigatorStandalone: true }), false)).toBe(false)
    expect(shouldShowInstallHint(env({ displayModeInstalled: true }), false)).toBe(false)
    expect(shouldShowInstallHint(env({ userAgent: ANDROID_UA, platform: 'Linux armv81' }), false)).toBe(false)
  })
})
