import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: { cityLight: { sunHex(): string | null }; invalidate(): void }
}

/** The City's sun / moon light colour as drawn now (asks for a frame first: the scene renders on demand). */
const sunHex = (page: Page) =>
  page.evaluate(() => {
    const bt = (window as unknown as BtWindow).__bt
    bt.invalidate()
    return bt.cityLight.sunHex()
  })

async function openCity(page: Page) {
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()
  await expect.poll(() => sunHex(page)).not.toBeNull()
}

test('city time: the time button cycles the presets, the light follows, and the choice survives a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await openCity(page)

  const time = page.getByTestId('city-time')
  // A fresh profile starts at noon: white sunlight.
  await expect(time).toHaveAttribute('data-time', 'noon')
  await expect.poll(() => sunHex(page)).toBe('#ffffff')
  // Cân bằng (the e2e preset) leaves the automatic day off: no toggle on offer.
  await expect(page.getByTestId('city-time-auto')).toHaveCount(0)

  await time.click()
  await expect(time).toHaveAttribute('data-time', 'sunset')
  // The light fades to the warm sunset colour.
  await expect.poll(() => sunHex(page)).toBe('#ffa060')
  await time.click()
  await expect(time).toHaveAttribute('data-time', 'night')
  await expect.poll(() => sunHex(page)).toBe('#9fb6ff')

  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await openCity(page)
  await expect(page.getByTestId('city-time')).toHaveAttribute('data-time', 'night')
  await expect.poll(() => sunHex(page)).toBe('#9fb6ff')

  // Round the cycle: morning, then back to noon.
  await page.getByTestId('city-time').click()
  await expect(page.getByTestId('city-time')).toHaveAttribute('data-time', 'morning')
  await page.getByTestId('city-time').click()
  await expect(page.getByTestId('city-time')).toHaveAttribute('data-time', 'noon')
  await expect.poll(() => sunHex(page)).toBe('#ffffff')
  expect(errors).toEqual([])
})
