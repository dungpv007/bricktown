import { expect, type Locator, type Page } from '@playwright/test'

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

/** A save slot's cities as stored (schema v4): many cities, one of them current. */
export interface SavedCities<C> {
  cities: Array<{ id: string; name: string; city: C }>
  currentCityId: string
}

/** The current city of saved slot data (from `savedSlotData`), or undefined when nothing is saved. */
export const savedCity = <C>(data: SavedCities<C> | null | undefined): C | undefined =>
  data?.cities.find((c) => c.id === data.currentCityId)?.city

/**
 * A 3D canvas's box once it has its real size. A canvas shows at the browser's default 300×150
 * for a moment before the renderer sizes it to its screen; a box read then puts every "centre"
 * tap in the wrong place (it happens with a warm dev-server cache, when the scene mounts fast).
 */
export async function sizedBox(canvas: Locator) {
  await expect
    .poll(() => canvas.evaluate((c) => {
      const r = c.getBoundingClientRect()
      const p = c.parentElement!.getBoundingClientRect()
      return r.width > 0 && Math.abs(r.width - p.width) < 2 && Math.abs(r.height - p.height) < 2
    }), { message: 'the canvas is sized to its screen' })
    .toBe(true)
  return (await canvas.boundingBox())!
}

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

interface MazeScreenWindow {
  __bt: { mazeScreen: { cellToClient: ((cx: number, cz: number) => { x: number; y: number }) | null } }
}

/**
 * Waits until the maze editor camera is at rest: two cells project to the same screen pixels over
 * two rendered frames. The maze counterpart of `waitForCameraStill` (after the framing glide, a
 * pan or a pinch), instead of fixed sleeps.
 */
export const waitForMazeCameraStill = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(() => {
          const screen = (window as unknown as MazeScreenWindow).__bt.mazeScreen
          const probe = () => {
            const at = screen.cellToClient
            if (!at) return null
            return JSON.stringify([at(0, 0), at(1, 1)].map((p) => [Math.round(p.x), Math.round(p.y)]))
          }
          const start = probe()
          if (!start) return false
          return new Promise<boolean>((resolve) => {
            let frames = 0
            const check = () => {
              if (probe() !== start) resolve(false)
              else if (++frames >= 2) resolve(true)
              else requestAnimationFrame(check)
            }
            requestAnimationFrame(check)
          })
        }),
      { message: 'the maze camera comes to rest' },
    )
    .toBe(true)

interface CityScreenWindow {
  __bt: { cityScreen: { cellToClient: ((cx: number, cz: number) => { x: number; y: number }) | null } }
}

/**
 * Waits until the City view is live and still, then returns the canvas box to aim at. Right after
 * the City opens, its `<canvas>` is visible at the browser's default 300 x 150 before the scene has
 * measured, sized and mounted (no camera, no gesture listeners yet): a box measured then puts every
 * "centre of the canvas" tap in the top-left corner of the real view. Live = the scene set its dev
 * handle; still = two cells project to the same pixels over two rendered frames (no resize, no glide).
 */
export const cityCanvasBox = async (page: Page) => {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const screen = (window as unknown as CityScreenWindow).__bt.cityScreen
          const probe = () => {
            const at = screen.cellToClient
            if (!at) return null
            return JSON.stringify([at(0, 0), at(10, 10)].map((p) => [Math.round(p.x), Math.round(p.y)]))
          }
          const start = probe()
          if (!start) return false
          return new Promise<boolean>((resolve) => {
            let frames = 0
            const check = () => {
              if (probe() !== start) resolve(false)
              else if (++frames >= 2) resolve(true)
              else requestAnimationFrame(check)
            }
            requestAnimationFrame(check)
          })
        }),
      { message: 'the city view is live and its camera at rest' },
    )
    .toBe(true)
  return (await page.getByTestId('mode-city').locator('canvas').boundingBox())!
}
