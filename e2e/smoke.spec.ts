import { expect, test } from '@playwright/test'

test('app loads a WebGL canvas without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  expect(errors).toEqual([])
})
