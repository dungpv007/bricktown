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

  const loaded: string[] = []
  page.on('request', (r) => loaded.push(new URL(r.url()).pathname))

  // First visit online: the service worker installs, precaches everything, then takes control.
  // Reduced motion keeps the menu's live 3D backdrop (which loads three.js after the menu is up) out of the
  // way, so the check below sees exactly what the menu itself needs.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  // The menu's first paint needs no 3D code: three.js, r3f and the physics engine load with their scenes.
  expect(loaded.filter((p) => /\/assets\/(three|r3f|rapier)-/.test(p))).toEqual([])
  await expect(page.getByTestId('menu-bg-poster')).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  await context.setOffline(true)
  failed.length = 0
  fromCache.length = 0
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  // The menu's poster and its live town (lazy chunk + three.js) come from the precache too.
  await expect(page.getByTestId('menu-bg-canvas').locator('canvas')).toBeVisible({ timeout: 20_000 })

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
  expect(fromCache).toContain('/menu-bg.webp')
  expect(fromCache.some((p) => /\/assets\/MenuBackground-.*\.js$/.test(p))).toBe(true)
  expect(failed).toEqual([])
  expect(errors).toEqual([])
})
