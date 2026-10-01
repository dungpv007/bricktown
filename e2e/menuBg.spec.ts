import { expect, test } from '@playwright/test'

test('main menu: the town poster shows at once, then the live town fades in and leaves with the menu', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()

  const poster = page.getByTestId('menu-bg-poster')
  await expect(poster).toBeVisible()
  await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

  // The 3D town loads after the menu is up, draws, then fades in over the poster.
  await expect(page.getByTestId('menu-bg-canvas').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('menu-bg-live')).toHaveAttribute('data-ready', 'true')
  await expect(page.getByTestId('menu-workshop')).toBeVisible()

  // Taps still reach the menu over the town; the game scene does not keep it around.
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('workshop-canvas')).toBeVisible()
  await expect(page.getByTestId('menu-bg-canvas')).toHaveCount(0)
  expect(errors).toEqual([])
})
