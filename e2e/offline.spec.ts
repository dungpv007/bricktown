import { expect, test } from '@playwright/test'

test('offline: after one visit, menu, workshop and drive (Rapier WASM) work without a network', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const failed: string[] = []
  page.on('requestfailed', (r) => failed.push(r.url()))
  const fromCache: string[] = []
  page.on('response', (r) => {
    if (r.fromServiceWorker()) fromCache.push(new URL(r.url()).pathname)
  })

  // First visit online: the service worker installs, precaches everything, then takes control.
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  await context.setOffline(true)
  failed.length = 0
  fromCache.length = 0
  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()

  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('workshop-canvas')).toBeVisible()
  await page.getByTestId('back').click()

  await page.getByTestId('menu-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('mode-drive').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('drive-gas')).toBeVisible() // only rendered once the physics scene is up

  // The lazy drive chunk and the physics engine (WASM inlined in the rapier chunk) came from the precache.
  expect(fromCache.some((p) => /\/assets\/DriveScene-.*\.js$/.test(p))).toBe(true)
  expect(fromCache.some((p) => /\/assets\/rapier-.*\.js$/.test(p))).toBe(true)
  expect(failed).toEqual([])
  expect(errors).toEqual([])
})
