import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: {
    useEditor: { getState(): { place(x: number, y: number, z: number): void; setPart(id: string): void } }
    useGame: {
      getState(): { data: { blueprints: Array<{ id: string; name: string; bricks: unknown[] }>; workshop: { bricks: unknown[] } } }
    }
  }
}

const blueprints = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.blueprints)

async function buildSmallModel(page: Page) {
  await page.evaluate(() => {
    const ed = (window as unknown as BtWindow).__bt.useEditor.getState()
    ed.place(0, 0, 0)
    ed.place(4, 0, 0)
    ed.setPart('slope_2x2')
    ed.place(0, 3, 0)
  })
}

test('blueprints: save, rename-free update, open from the library with a thumbnail', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('save-blueprint')).toBeDisabled()

  await buildSmallModel(page)
  await page.getByTestId('save-blueprint').click()
  await expect(page.getByTestId('save-blueprint-name')).toHaveValue(/1$/)
  await page.getByTestId('save-blueprint-confirm').click()
  const saved = await blueprints(page)
  expect(saved).toHaveLength(1)
  expect(saved[0].bricks).toHaveLength(3)

  // Saving again from the same workshop updates the blueprint instead of adding a copy.
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(8, 0, 0))
  await page.getByTestId('save-blueprint').click()
  await page.getByTestId('save-blueprint-confirm').click()
  const updated = await blueprints(page)
  expect(updated).toHaveLength(1)
  expect(updated[0].id).toBe(saved[0].id)
  expect(updated[0].bricks).toHaveLength(4)

  await page.getByTestId('open-library').click()
  const card = page.getByTestId(`blueprint-card-${saved[0].id}`)
  await expect(card).toBeVisible()
  await expect(card.locator('img.bt-thumb')).toHaveAttribute('src', /^data:image\/png/)
  expect(errors).toEqual([])
})

test('blueprints: opening asks before replacing the model in progress; delete asks too', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  await buildSmallModel(page)
  await page.getByTestId('save-blueprint').click()
  await page.getByTestId('save-blueprint-confirm').click()
  const [bp] = await blueprints(page)

  // A different model is in progress: opening the saved one needs a check mark.
  await page.getByTestId('new-model').click()
  await page.getByTestId('new-model-prop').click()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  await page.getByTestId('open-library').click()
  await page.getByTestId(`blueprint-card-${bp.id}`).click()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('blueprint-library')).toBeVisible()
  await page.getByTestId(`blueprint-card-${bp.id}`).click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('blueprint-library')).toHaveCount(0)
  const bricks = await page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop.bricks.length)
  expect(bricks).toBe(3)

  // Delete from the library.
  await page.getByTestId('open-library').click()
  await page.getByTestId(`blueprint-delete-${bp.id}`).click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('blueprint-library-empty')).toBeVisible()
  expect(await blueprints(page)).toHaveLength(0)
})
