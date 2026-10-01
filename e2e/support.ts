import { expect, type Page } from '@playwright/test'

/** The saved slot's data as it is in IndexedDB right now (what a reload would load), or null. */
export const savedSlotData = <T>(page: Page) =>
  page.evaluate(
    () =>
      new Promise<T | null>((resolve, reject) => {
        const open = indexedDB.open('bricktown')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result.transaction('slots').objectStore('slots').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            open.result.close()
            resolve((all.result[0]?.data as T | undefined) ?? null)
          }
        }
      }),
  )

/** Writes pending changes now (dev handle); poll `savedSlotData` afterwards to see them land. */
export const flushAutosave = (page: Page) =>
  page.evaluate(() => (window as unknown as { __bt: { flushAutosave(): Promise<boolean> } }).__bt.flushAutosave())

interface PoseWindow {
  __bt: { plateScreen: { pose: { frame: number; camera: number[] } | null } }
}

/**
 * Waits until the Workshop camera is at rest: its pose (dev handle, rounded) is the same over two
 * rendered frames. Replaces fixed sleeps after a fit, glide, orbit or drag, which are too short
 * when the software GL is busy and needlessly long when it is not.
 */
export const waitForCameraStill = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(() => {
          const screen = (window as unknown as PoseWindow).__bt.plateScreen
          const start = screen.pose
          if (!start) return false
          const key = JSON.stringify(start.camera)
          return new Promise<boolean>((resolve) => {
            const check = () => {
              const now = screen.pose
              if (!now || JSON.stringify(now.camera) !== key) resolve(false)
              else if (now.frame >= start.frame + 2) resolve(true)
              else requestAnimationFrame(check)
            }
            requestAnimationFrame(check)
          })
        }),
      { message: 'the workshop camera comes to rest' },
    )
    .toBe(true)
