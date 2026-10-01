import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedSlotData } from './support'

interface Plate { w: number; d: number; c?: number }
interface BtWindow {
  __bt: {
    useEditor: { getState(): { color: number } }
    useGame: { getState(): { data: { workshop: { baseplate: Plate } } } }
  }
}

const plate = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop.baseplate)

async function openWorkshop(page: Page) {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
}

test('colours: 30 big swatches in a two-wide scrolling column; picking silver selects it', async ({ page }) => {
  await openWorkshop(page)
  const swatches = page.locator('.bt-colors .bt-swatch')
  await expect(swatches).toHaveCount(30)
  const first = await swatches.first().boundingBox()
  expect(first!.width).toBeGreaterThanOrEqual(56)
  expect(first!.height).toBeGreaterThanOrEqual(56)
  const lefts = await swatches.evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).offsetLeft))])
  expect(lefts).toHaveLength(2)
  await expect(page.getByTestId('color-17')).toHaveClass(/bt-swatch-trans/)
  await expect(page.getByTestId('color-28')).toHaveClass(/bt-swatch-metal/)

  await page.getByTestId('color-28').scrollIntoViewIfNeeded()
  await page.getByTestId('color-28').click()
  await expect(page.getByTestId('color-28')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().color)).toBe(28)
})

test('baseplate colour: pick gray, undo back to green, redo; saved with the workshop', async ({ page }) => {
  await openWorkshop(page)
  expect((await plate(page)).c).toBeUndefined()

  await page.getByTestId('plate-color').click()
  for (const c of [24, 5, 3, 10, 0]) await expect(page.getByTestId(`plate-color-${c}`)).toBeVisible()
  await expect(page.getByTestId('plate-color-5')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('plate-color-24').click()
  await expect(page.getByTestId('plate-color-24')).toBeHidden()
  expect((await plate(page)).c).toBe(24)

  await page.getByTestId('undo').click()
  expect((await plate(page)).c).toBeUndefined()
  await page.getByTestId('redo').click()
  expect((await plate(page)).c).toBe(24)

  await flushAutosave(page)
  await expect
    .poll(async () => {
      const saved = await savedSlotData<{ schemaVersion: number; workshop: { baseplate: Plate } }>(page)
      return saved && { v: saved.schemaVersion, c: saved.workshop.baseplate.c }
    })
    .toEqual({ v: 2, c: 24 })
})
