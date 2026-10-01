import { expect, test, type Page } from '@playwright/test'
import { savedSlotData } from './support'

// Runs against the PRODUCTION build (see playwright.offline.config.ts): no StrictMode, no dev
// handle. The car is driven with the real pedals, then set down cell by cell along the way out
// through `window.__btMaze`, which the production build only installs under the test flag.

test.use({ serviceWorkers: 'block' })

interface Cell {
  cx: number
  cz: number
}
interface W {
  __btMaze?: { teleport(cx: number, cz: number): void; path(): Cell[] | null }
}

const run = (page: Page) => page.getByTestId('maze-run-status')

async function hold(page: Page, testId: string, ms: number) {
  const box = (await page.getByTestId(testId).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('production build: drive out of a ready-made maze, the best run is saved', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.addInitScript(() => localStorage.setItem('bricktown-e2e', '1'))

  await page.goto('/')
  await page.getByTestId('menu-maze').click()
  await page.getByTestId('maze-tpl-easy').click()
  await page.getByTestId('maze-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('drive-status')).toHaveAttribute('data-controllers', '1', { timeout: 15_000 })
  await expect(run(page)).toHaveAttribute('data-phase', 'ready')
  await expect(run(page)).toHaveAttribute('data-cell', '0,5')
  await page.waitForTimeout(500) // let the car settle on its wheels

  // The real pedals move the car into the maze (east from the west entry) and start the clock.
  const x0 = Number(await page.getByTestId('drive-status').getAttribute('data-x'))
  await hold(page, 'drive-gas', 800)
  await expect(run(page)).toHaveAttribute('data-phase', 'running')
  await expect.poll(async () => Number(await page.getByTestId('drive-status').getAttribute('data-x'))).toBeGreaterThan(x0 + 2)

  const path = await page.evaluate(() => (window as unknown as W).__btMaze!.path())
  expect(path).not.toBeNull()
  for (const cell of path!.slice(1)) {
    await page.evaluate(([cx, cz]) => (window as unknown as W).__btMaze!.teleport(cx, cz), [cell.cx, cell.cz] as const)
    await expect(run(page)).toHaveAttribute('data-cell', `${cell.cx},${cell.cz}`)
  }
  await expect(page.getByTestId('maze-win')).toBeVisible()
  await expect(page.getByTestId('maze-win-record')).toHaveAttribute('data-new', 'true')
  const stars = Number(await page.getByTestId('maze-win-stars').getAttribute('data-stars'))
  expect(stars).toBeGreaterThanOrEqual(1)

  // Autosave writes the record to IndexedDB.
  await expect
    .poll(async () => (await savedSlotData<{ mazeRecords: Record<string, { stars: number }> }>(page))?.mazeRecords['tpl:easy']?.stars, {
      timeout: 10_000,
    })
    .toBe(stars)
  expect(errors).toEqual([])
})
