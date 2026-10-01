import type { Page } from '@playwright/test'

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
