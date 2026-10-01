import { expect, test, type Page } from '@playwright/test'

type Bt = {
  useGame: {
    getState: () => {
      data: { workshop: { bricks: unknown[] } }
      setWorkshop: (w: unknown) => void
    }
  }
}

const brickCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __bt: Bt }).__bt.useGame.getState().data.workshop.bricks.length)

test('a brick added in the workshop survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop')).toBeVisible()

  await page.evaluate(() => {
    const game = (window as unknown as { __bt: Bt }).__bt.useGame.getState()
    game.setWorkshop({
      ...game.data.workshop,
      bricks: [{ id: 'e2e1', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }],
    })
  })
  expect(await brickCount(page)).toBe(1)

  await page.waitForTimeout(2500)
  await page.reload()

  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop')).toBeVisible()
  expect(await brickCount(page)).toBe(1)
})
