/** One-time UI flags kept in localStorage. Every access is guarded: storage may be missing or blocked. */

/**
 * Versioned: bump the suffix when the first-launch tour changes enough that returning players
 * should see it again (v2: the selection-first Workshop). Older keys are ignored.
 */
export const ONBOARDED_KEY = 'bricktown-onboarded-v2'
export const INSTALL_HINT_KEY = 'bricktown-install-hint-dismissed'

export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* storage blocked or full: the flag only lasts for this session */
  }
}
