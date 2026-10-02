import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: {
    renderer(): { getPixelRatio(): number } | null
    renderStats: { frames: number }
  }
}

// A sharp screen (3 device pixels per CSS pixel) on the iPad-sized tablet project: each preset's
// pixel-ratio cap shows (Tiết kiệm pin 1, a tablet's "Vừa" 1.75, Đẹp nhất 2).
test.use({ deviceScaleFactor: 3 })

const pixelRatio = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.renderer()?.getPixelRatio() ?? null)

async function openGraphics(page: Page) {
  await page.getByTestId('audio-settings').click()
  await page.getByTestId('settings-tab-graphics').click()
  await expect(page.getByTestId('graphics-settings')).toBeVisible()
}

/** Opens the Workshop and returns the pixel ratio its canvas draws at. */
async function workshopPixelRatio(page: Page) {
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  await expect.poll(() => pixelRatio(page)).not.toBeNull()
  const ratio = await pixelRatio(page)
  await page.getByTestId('back').click()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  return ratio
}

test('graphics: the chosen preset persists across a reload and sets the canvas pixel ratio', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await openGraphics(page)
  // The e2e storage state picks Cân bằng.
  await expect(page.getByTestId('graphics-preset-balanced')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('graphics-preset-battery').click()
  await expect(page.getByTestId('graphics-preset-battery')).toHaveAttribute('aria-pressed', 'true')
  // The switches under it show what the preset stands for.
  await expect(page.getByTestId('graphics-shadows-off')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('graphics-fps-30')).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await openGraphics(page)
  await expect(page.getByTestId('graphics-preset-battery')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('audio-settings-close').click()
  expect(await workshopPixelRatio(page)).toBe(1)

  // Đẹp nhất: the high cap.
  await openGraphics(page)
  await page.getByTestId('graphics-preset-best').click()
  await page.getByTestId('audio-settings-close').click()
  expect(await workshopPixelRatio(page)).toBe(2)

  // One switch changed: the preset becomes "Tùy chỉnh", kept across a reload.
  await openGraphics(page)
  await page.getByTestId('graphics-resolution-mid').click()
  await expect(page.getByTestId('graphics-custom')).toBeVisible()
  await expect(page.getByTestId('graphics-preset-best')).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await openGraphics(page)
  await expect(page.getByTestId('graphics-custom')).toBeVisible()
  await expect(page.getByTestId('graphics-resolution-mid')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('audio-settings-close').click()
  expect(await workshopPixelRatio(page)).toBe(1.75)
  expect(errors).toEqual([])
})

test('graphics: a still Workshop draws no frames (render on demand)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  await expect.poll(() => pixelRatio(page)).not.toBeNull()
  // Once the first framing has settled, nothing moves: no frames at all for a second.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const stats = (window as unknown as BtWindow).__bt.renderStats
        const before = stats.frames
        await new Promise((r) => setTimeout(r, 1000))
        return stats.frames - before
      }),
    )
    .toBe(0)
})
