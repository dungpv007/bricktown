import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: {
    useEditor: { getState(): { place(x: number, y: number, z: number): void } }
    useGame: { getState(): { data: { workshop: { bricks: unknown[] } } } }
  }
}

const brickCount = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop.bricks.length)

test('workshop: place a brick, then undo it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('tool-place')).toBeVisible()

  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  expect(await brickCount(page)).toBe(1)

  await page.getByTestId('undo').click()
  expect(await brickCount(page)).toBe(0)
  expect(errors).toEqual([])
})

test('workshop: tapping the baseplate places the current part', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  const view = page.viewportSize()
  if (!view) throw new Error('no viewport')
  // The camera frames the baseplate centre in the middle of the view. Poll because the canvas
  // may still be sizing itself right after it appears.
  await expect
    .poll(async () => {
      await page.mouse.click(view.width / 2, view.height / 2)
      return brickCount(page)
    })
    .toBe(1)
})
