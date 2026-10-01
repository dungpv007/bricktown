import { expect, test, type Page } from '@playwright/test'

// Runs against the PRODUCTION build (`vite build` + `vite preview`, see playwright.offline.config.ts):
// no StrictMode double effects and no dev-only `window.__btDrive`, so the car is observed through
// the hidden `drive-status` element. Regression for the vehicle controller never being created in
// production because the rigid body did not exist yet when the vehicle mounted.

test.use({ serviceWorkers: 'block' })

interface Status {
  x: number
  z: number
  controllers: number
  builds: number
}

const status = async (page: Page): Promise<Status> => {
  const el = page.getByTestId('drive-status')
  const num = async (name: string) => Number(await el.getAttribute(`data-${name}`))
  return { x: await num('x'), z: await num('z'), controllers: await num('controllers'), builds: await num('builds') }
}

/** Holds a pedal with the mouse for `ms`. */
async function hold(page: Page, testId: string, ms: number) {
  const box = (await page.getByTestId(testId).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

/** From the menu: drive the car template forward and check it moved with exactly one controller. */
async function driveOnce(page: Page, entry: number) {
  await page.getByTestId('menu-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('mode-drive').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('drive-gas')).toBeVisible()
  // One controller per drive session, built once (no rebuilds), and the previous one was removed.
  await expect.poll(async () => (await status(page)).builds, { timeout: 10_000 }).toBe(entry)
  await page.waitForTimeout(500) // let the car settle on its wheels
  const start = await status(page)
  expect(start.controllers).toBe(1)

  await hold(page, 'drive-gas', 1500)
  await page.waitForTimeout(200) // the status is published a few times per second
  const after = await status(page)
  const moved = Math.hypot(after.x - start.x, after.z - start.z)
  expect(moved).toBeGreaterThan(3)
  expect(after.z).toBeLessThan(start.z) // forward is -Z
  expect(after.controllers).toBe(1)
  expect(after.builds).toBe(entry)

  await page.getByTestId('back').click()
  await expect(page.getByTestId('main-menu')).toBeVisible()
}

test('production build: holding gas drives the car, across leaving and re-entering drive mode', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  for (const entry of [1, 2, 3]) await driveOnce(page, entry)
  expect(errors).toEqual([])
})
