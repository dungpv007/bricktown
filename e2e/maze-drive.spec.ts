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
  __btMaze?: { teleport(cx: number, cz: number): void; path(): Cell[] | null; stepping(): boolean }
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
  // The car's driver (block steps in the top-down view, physics in the chase view) takes over one
  // physics step after a 📷 switch; a teleport requested before that is dropped.
  const top = (await page.getByTestId('maze-camera').getAttribute('data-mode')) === 'top'
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__btMaze!.stepping())).toBe(top)
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

  // The top-down view (block steps, a D-pad) is the default; the chase view drives with stick and pedals.
  await expect(run(page)).toHaveAttribute('data-cell', '0,5')
  await expect(page.getByTestId('maze-timer')).toContainText('0.0s')
  await expect(page.getByTestId('maze-camera')).toHaveAttribute('data-mode', 'top')
  await expect(page.getByTestId('maze-step-up')).toBeVisible()
  await expect(page.getByTestId('drive-gas')).toHaveCount(0)
  await page.getByTestId('maze-camera').click()
  await expect(page.getByTestId('maze-camera')).toHaveAttribute('data-mode', 'chase')
  await expect(page.getByTestId('maze-steppad')).toHaveCount(0)
  await expect(page.getByTestId('drive-gas')).toBeVisible()
  await page.waitForTimeout(300) // the car is back on its wheels (physics) before the gas

  // The car faces into the maze: gas drives it east from the west entry (0, 5).
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

  // 📷: chase -> top-down (block steps) -> chase -> top-down.
  await page.getByTestId('maze-camera').click()
  await expect(page.getByTestId('maze-camera')).toHaveAttribute('data-mode', 'top')
  await expect(page.getByTestId('maze-step-up')).toBeVisible()
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

const KEY_FOR: { [dir: string]: string } = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }

/** The screen direction (top-down view: up is north, -Z) from a cell to its neighbour. */
function dirOf(a: Cell, b: Cell): 'up' | 'down' | 'left' | 'right' {
  if (b.cx > a.cx) return 'right'
  if (b.cx < a.cx) return 'left'
  return b.cz < a.cz ? 'up' : 'down'
}

const carXZ = async (page: Page) => {
  const s = page.getByTestId('drive-status')
  return { x: Number(await s.getAttribute('data-x')), z: Number(await s.getAttribute('data-z')) }
}

test('maze drive, top-down view: block steps with the D-pad and the arrow keys to the exit, a wall stops the car', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-maze').click()
  await page.getByTestId('maze-tpl-easy').click()
  await expect(page.getByTestId('maze-editor')).toBeVisible()
  await startDrive(page)
  await expect(page.getByTestId('maze-camera')).toHaveAttribute('data-mode', 'top')
  await expect(run(page)).toHaveAttribute('data-cell', '0,5')

  // Up from the entry (0, 5) is a wall: a bump, the car stays in the middle of its cell and the clock waits.
  const centre = { x: 0.5 * 13, z: 5.5 * 13 }
  await expect.poll(() => carXZ(page)).toEqual(centre)
  await page.getByTestId('maze-step-up').click()
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(500)
  await expect(run(page)).toHaveAttribute('data-cell', '0,5')
  await expect.poll(() => carXZ(page)).toEqual(centre)
  await expect(run(page)).toHaveAttribute('data-phase', 'ready')
  // Modified arrows are not steps.
  await page.keyboard.press('Control+ArrowRight')
  await page.waitForTimeout(400)
  await expect(run(page)).toHaveAttribute('data-cell', '0,5')

  const path = (await page.evaluate(() => (window as unknown as BtWindow).__btMaze!.path()))!
  expect(path[1]).toEqual({ cx: 1, cz: 5 })
  // One step east (the D-pad): the clock starts.
  await page.getByTestId('maze-step-right').click()
  await expect(run(page)).toHaveAttribute('data-cell', '1,5')
  await expect(run(page)).toHaveAttribute('data-phase', 'running')
  await expect.poll(() => carXZ(page)).toEqual({ x: 1.5 * 13, z: 5.5 * 13 })

  // Holding ▲ steps on, cell after cell, up the corridor to (1, 1), where a wall stops it.
  expect(path.slice(2, 6)).toEqual([1, 2, 3, 4].map((i) => ({ cx: 1, cz: 5 - i })))
  const up = (await page.getByTestId('maze-step-up').boundingBox())!
  await page.mouse.move(up.x + up.width / 2, up.y + up.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('maze-step-up')).toHaveAttribute('data-held', 'true')
  await expect(run(page)).toHaveAttribute('data-cell', '1,1')
  await page.waitForTimeout(400)
  await page.mouse.up()
  await expect(run(page)).toHaveAttribute('data-cell', '1,1')

  // The rest of the way: the arrow keys and the D-pad in turn.
  for (let i = 6; i < path.length; i++) {
    const dir = dirOf(path[i - 1], path[i])
    if (i % 2 === 0) await page.keyboard.press(KEY_FOR[dir])
    else await page.getByTestId(`maze-step-${dir}`).click()
    if (i < path.length - 1) await expect(run(page)).toHaveAttribute('data-cell', `${path[i].cx},${path[i].cz}`)
  }
  await expect(page.getByTestId('maze-win')).toBeVisible()
  await expect(run(page)).toHaveAttribute('data-phase', 'won')
  const coins = Number(await run(page).getAttribute('data-coins'))
  expect(coins).toBe(1) // the coin at (1, 3) on the way
  await expect(page.getByTestId('maze-win-record')).toHaveAttribute('data-new', 'true')
  const stars = Number(await page.getByTestId('maze-win-stars').getAttribute('data-stars'))
  const saved = (await records(page))['tpl:easy']
  expect(saved).toMatchObject({ stars, coins })
  expect(saved.timeMs).toBeGreaterThan(0)
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

test('maze vehicle picker: a vehicle too wide for the corridors is greyed out there, not in the city', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await expect.poll(() => page.evaluate(() => 'useGame' in ((window as unknown as { __bt?: object }).__bt ?? {}))).toBe(true)
  // A car with a 16-stud wing plate: drivable, but wider than a maze corridor allows.
  await page.evaluate(() => {
    const brick = (id: string, p: string, x: number, y: number, z: number, r: number, c: number) => ({ id, p, x, y, z, r, c })
    const now = Date.now()
    const game = (window as unknown as { __bt: { useGame: { getState(): { upsertBlueprint(bp: unknown): void } } } }).__bt.useGame
    game.getState().upsertBlueprint({
      id: 'bp_wide', name: 'Wide', kind: 'vehicle', tags: ['vehicle'], baseplate: { w: 16, d: 16 }, createdAt: now, updatedAt: now,
      bricks: [
        brick('w1', 'wheel_small', 6, 0, 4, 0, 1), brick('w2', 'wheel_small', 9, 0, 4, 0, 1),
        brick('w3', 'wheel_small', 6, 0, 10, 0, 1), brick('w4', 'wheel_small', 9, 0, 10, 0, 1),
        brick('p1', 'plate_4x8', 0, 5, 4, 1, 8), brick('p2', 'plate_4x8', 8, 5, 4, 1, 8),
        brick('p3', 'plate_4x8', 6, 5, 3, 0, 8),
      ],
    })
  })
  await page.getByTestId('menu-maze').click()
  await page.getByTestId('maze-tpl-easy').click()
  await page.getByTestId('maze-drive').click()
  const wide = page.getByTestId('veh-bp_wide')
  await expect(wide).toBeDisabled()
  await expect(wide.getByTestId('veh-too-wide')).toBeVisible()
  for (const tpl of ['car', 'police_car', 'truck', 'fire_truck']) await expect(page.getByTestId(`veh-tpl:${tpl}`)).toBeEnabled()

  // Same vehicle, city drive: no corridor, no limit.
  await page.evaluate(() => (window as unknown as { __bt: { flushAutosave(): Promise<boolean> } }).__bt.flushAutosave())
  await page.goto('/')
  await page.getByTestId('menu-drive').click()
  await expect(page.getByTestId('veh-bp_wide')).toBeEnabled()
  await expect(page.getByTestId('veh-bp_wide').getByTestId('veh-too-wide')).toHaveCount(0)
})
