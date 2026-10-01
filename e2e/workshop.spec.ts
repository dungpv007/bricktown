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

test('workshop: a press that starts on the UI and ends over the plate never places', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  await page.waitForTimeout(500)
  // A tap on empty sky leaves no hit to consume the tap verdict...
  await page.mouse.click(540, 140)
  // ...then a press on a toolbar button released over the baseplate must not reuse it.
  const tool = await page.getByTestId('tool-place').boundingBox()
  if (!tool) throw new Error('no tool button')
  await page.mouse.move(tool.x + tool.width / 2, tool.y + tool.height / 2)
  await page.mouse.down()
  await page.mouse.move(540, 420)
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await brickCount(page)).toBe(0)
})

test('workshop: new model asks before wiping a build', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  expect(await brickCount(page)).toBe(1)

  await page.getByTestId('new-model').click()
  await page.getByTestId('new-model-building-large').click()
  await expect(page.getByTestId('new-model-confirm-step')).toBeVisible()
  expect(await brickCount(page)).toBe(1)
  await page.getByTestId('new-model-cancel').click()
  await expect(page.getByTestId('new-model-building-large')).toBeVisible()
  expect(await brickCount(page)).toBe(1)

  await page.getByTestId('new-model-building-large').click()
  await page.getByTestId('new-model-confirm').click()
  expect(await brickCount(page)).toBe(0)
  const plate = await page.evaluate(
    () => (window as unknown as { __bt: { useGame: { getState(): { data: { workshop: { baseplate: unknown } } } } } })
      .__bt.useGame.getState().data.workshop.baseplate,
  )
  expect(plate).toEqual({ w: 32, d: 32 })

  // An empty model is replaced straight away.
  await page.getByTestId('new-model').click()
  await page.getByTestId('new-model-vehicle').click()
  await expect(page.getByTestId('new-model-confirm-step')).toHaveCount(0)
})
