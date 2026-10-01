import { expect, test, type Page } from '@playwright/test'
import { waitForMazeCameraStill } from './support'

interface Cell {
  cx: number
  cz: number
}
interface Record {
  timeMs: number
  stars: number
  coins: number
}
interface BtWindow {
  __bt: {
    useGame: { getState(): { data: { mazeRecords: { [key: string]: Record } } } }
    mazeScreen: { cellToClient: ((cx: number, cz: number) => { x: number; y: number }) | null }
  }
  __btMaze?: { teleport(cx: number, cz: number): void; path(): Cell[] | null }
}

const run = (page: Page) => page.getByTestId('maze-run-status')
const records = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.mazeRecords)

async function hold(page: Page, testId: string, ms: number) {
  const box = (await page.getByTestId(testId).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

/** From the editor: Drive, pick the car, wait until it stands at the entry. */
async function startDrive(page: Page) {
  await page.getByTestId('maze-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('maze-drive-canvas')).toBeVisible()
  await expect(page.getByTestId('drive-status')).toHaveAttribute('data-controllers', '1')
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__btMaze !== undefined)).toBe(true)
  await expect(run(page)).toHaveAttribute('data-phase', 'ready')
}

/** Sets the car down in each cell of the way to the exit in turn (the run sees each cell). */
async function teleportToExit(page: Page) {
  const path = await page.evaluate(() => (window as unknown as BtWindow).__btMaze!.path())
  expect(path).not.toBeNull()
  for (const cell of path!.slice(1)) {
    await page.evaluate(([cx, cz]) => (window as unknown as BtWindow).__btMaze!.teleport(cx, cz), [cell.cx, cell.cz] as const)
    await expect(run(page)).toHaveAttribute('data-cell', `${cell.cx},${cell.cz}`)
  }
}

test('maze drive: gas starts the clock, hint arrows, camera toggle, coins, finish with stars and a record', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-maze').click()
  await page.getByTestId('maze-tpl-easy').click()
  await expect(page.getByTestId('maze-editor')).toBeVisible()
  await startDrive(page)

  // The car faces into the maze: gas drives it east from the west entry (0, 5).
  await expect(run(page)).toHaveAttribute('data-cell', '0,5')
  await expect(page.getByTestId('maze-timer')).toContainText('0.0s')
  const x0 = Number(await page.getByTestId('drive-status').getAttribute('data-x'))
  await hold(page, 'drive-gas', 700)
  await expect(run(page)).toHaveAttribute('data-phase', 'running')
  await expect.poll(async () => Number(await page.getByTestId('drive-status').getAttribute('data-x'))).toBeGreaterThan(x0 + 2)
  await expect(page.getByTestId('maze-timer')).not.toContainText('0.0s')

  // 💡: arrows along the way for a few seconds, then the button cools down.
  await page.getByTestId('maze-hint').click()
  await expect(run(page)).toHaveAttribute('data-hints', '1')
  await expect.poll(async () => Number(await run(page).getAttribute('data-arrows'))).toBeGreaterThan(0)
  await expect(page.getByTestId('maze-hint')).toHaveAttribute('data-state', 'cooling')
  await expect(page.getByTestId('maze-hint')).toBeDisabled()
  await expect(run(page)).toHaveAttribute('data-arrows', '0', { timeout: 6000 })

  // 📷: top-down follow <-> chase.
  await expect(page.getByTestId('maze-camera')).toHaveAttribute('data-mode', 'top')
  await page.getByTestId('maze-camera').click()
  await expect(page.getByTestId('maze-camera')).toHaveAttribute('data-mode', 'chase')
  await page.getByTestId('maze-camera').click()
  await expect(page.getByTestId('maze-camera')).toHaveAttribute('data-mode', 'top')

  await teleportToExit(page)
  const win = page.getByTestId('maze-win')
  await expect(win).toBeVisible()
  const coins = Number(await run(page).getAttribute('data-coins'))
  expect(coins).toBeGreaterThan(0) // the easy maze has a coin on its shortest way
  await expect(page.getByTestId('maze-win-coins')).toContainText(`${coins}/3`)
  const stars = Number(await page.getByTestId('maze-win-stars').getAttribute('data-stars'))
  expect(stars).toBeLessThanOrEqual(2) // a hint was used
  await expect(page.getByTestId('maze-win-record')).toHaveAttribute('data-new', 'true')
  const saved = (await records(page))['tpl:easy']
  expect(saved).toMatchObject({ stars, coins })
  expect(saved.timeMs).toBeGreaterThan(0)

  // Drive again: a fresh run at the entry.
  await page.getByTestId('maze-retry').click()
  await expect(win).toBeHidden()
  await expect(run(page)).toHaveAttribute('data-phase', 'ready')
  await expect(run(page)).toHaveAttribute('data-coins', '0')
  await expect(page.getByTestId('drive-status')).toHaveAttribute('data-controllers', '1')
  await expect(run(page)).toHaveAttribute('data-cell', '0,5')

  // Finish again (no hint this time): the saved record is this run only if it beats the first.
  await page.waitForTimeout(300) // let the respawned car land before setting it down elsewhere
  await teleportToExit(page)
  await expect(win).toBeVisible()
  const again = Number(await page.getByTestId('maze-win-stars').getAttribute('data-stars'))
  const best = (await records(page))['tpl:easy']
  if ((await page.getByTestId('maze-win-record').getAttribute('data-new')) === 'true') {
    expect(best.stars).toBe(again)
    expect(best).not.toEqual(saved)
  } else {
    expect(best).toEqual(saved)
  }
  expect(best.stars).toBeGreaterThanOrEqual(stars)

  // Back to the editor from the finish card.
  await page.getByTestId('maze-win-edit').click()
  await expect(page.getByTestId('maze-editor')).toBeVisible()
  expect(errors).toEqual([])
})

test('maze drive: a tiny maze built from scratch drives out; menu from the finish card', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-maze').click()
  await page.getByTestId('maze-new').click()
  await page.getByTestId('maze-new-7').click()
  await expect(page.getByTestId('maze-editor')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__bt.mazeScreen.cellToClient !== null)).toBe(true)
  await waitForMazeCameraStill(page)
  const tap = async (cx: number, cz: number) => {
    const p = await page.evaluate(([x, z]) => (window as unknown as BtWindow).__bt.mazeScreen.cellToClient!(x, z), [cx, cz] as const)
    await page.mouse.click(p.x, p.y)
  }
  const drive = page.getByTestId('maze-drive')
  await expect(drive).toBeDisabled()
  await page.getByTestId('maze-tool-entry').click()
  await tap(0, 1)
  await page.getByTestId('maze-tool-exit').click()
  await tap(6, 5)
  await page.getByTestId('maze-tool-wall').click()
  await tap(2, 2)
  await tap(4, 4)
  await expect(drive).toBeEnabled()

  await startDrive(page)
  await expect(run(page)).toHaveAttribute('data-cell', '0,1')
  await expect(run(page)).toHaveAttribute('data-total', '0')
  await expect(page.getByTestId('maze-coins')).toHaveCount(0)
  await teleportToExit(page)
  await expect(page.getByTestId('maze-win')).toBeVisible()
  await expect(page.getByTestId('maze-win-stars')).toHaveAttribute('data-stars', '3')
  await page.getByTestId('maze-win-menu').click()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  // The maze mode opens on the picker again.
  await page.getByTestId('menu-maze').click()
  await expect(page.getByTestId('maze-picker')).toBeVisible()
})
