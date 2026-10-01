import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedSlotData } from './support'

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

  await flushAutosave(page)
  await expect
    .poll(async () => (await savedSlotData<{ workshop: { bricks: unknown[] } }>(page))?.workshop.bricks.length)
    .toBe(1)
  await page.reload()

  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop')).toBeVisible()
  expect(await brickCount(page)).toBe(1)
})

test('deleting a save slot asks with the shared check/cross question (cross on the left)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate(() => {
    const game = (window as unknown as { __bt: Bt }).__bt.useGame.getState()
    game.setWorkshop({ ...game.data.workshop, bricks: [{ id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 1 }] })
  })
  await page.getByTestId('settings').click()
  await page.getByTestId('delete-slot-1').click()
  const dialog = page.getByTestId('confirm-dialog')
  await expect(dialog).toBeVisible()
  const no = (await dialog.getByTestId('confirm-no').boundingBox())!
  const yes = (await dialog.getByTestId('confirm-yes').boundingBox())!
  expect(no.x).toBeLessThan(yes.x)
  await expect(dialog.getByTestId('confirm-yes')).toHaveAttribute('aria-label', /.+/)

  await dialog.getByTestId('confirm-no').click()
  await expect(dialog).toBeHidden()
  expect(await brickCount(page)).toBe(1)
  await page.getByTestId('delete-slot-1').click()
  await page.getByTestId('confirm-yes').click()
  await expect.poll(() => brickCount(page)).toBe(0)
})
