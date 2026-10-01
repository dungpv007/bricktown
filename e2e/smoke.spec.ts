import { expect, test } from '@playwright/test'

test('app boots to the main menu without page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await expect(page.getByTestId('menu-workshop')).toBeVisible()
  expect(errors).toEqual([])
})
