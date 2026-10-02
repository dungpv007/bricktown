/**
 * Automated browsers only (Playwright sets `navigator.webdriver`): animation frames at about 20 a second
 * instead of the display rate. Headless Chromium draws WebGL in software (SwiftShader), and one test tab at
 * 60 fps can take most of the machine's CPU. Real players never take this path.
 */
const FRAME_MS = 50

export function installTestLowPower(): void {
  if (typeof navigator === 'undefined' || navigator.webdriver !== true) return
  const native = window.requestAnimationFrame.bind(window)
  const cancelNative = window.cancelAnimationFrame.bind(window)
  let last = 0
  const timers = new Map<number, number>()
  let nextId = 1
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++
    const wait = Math.max(0, last + FRAME_MS - performance.now())
    const timer = window.setTimeout(() => {
      timers.set(
        id,
        native((t) => {
          timers.delete(id)
          last = t
          cb(t)
        }),
      )
    }, wait)
    timers.set(id, -timer) // negative: still a timeout, not yet a native frame
    return id
  }
  window.cancelAnimationFrame = (id: number): void => {
    const h = timers.get(id)
    if (h === undefined) return
    timers.delete(id)
    if (h < 0) window.clearTimeout(-h)
    else cancelNative(h)
  }
}
