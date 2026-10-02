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

test('colours: 30 small swatches in a two-wide scrolling column; picking silver selects it', async ({ page }) => {
  await openWorkshop(page)
  const swatches = page.locator('.bt-colors .bt-swatch')
  await expect(swatches).toHaveCount(30)
  const first = await swatches.first().boundingBox()
  // Swatches are half of the old 56px (user request): 28px on tablets.
  expect(first!.width).toBeGreaterThanOrEqual(28)
  expect(first!.height).toBeGreaterThanOrEqual(28)
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
  for (const c of [24, 5, 3, 10, 0, 8]) await expect(page.getByTestId(`plate-color-${c}`)).toBeVisible()
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
    .toEqual({ v: 4, c: 24 })
})

test('colours: a scroll cue shows while swatches hide below, and goes at the end', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 700 }) // short screen: the column overflows
  await openWorkshop(page)
  const panel = page.locator('.bt-colors')
  await expect(page.getByTestId('colors-more')).toBeVisible()
  await panel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await expect(page.getByTestId('colors-more')).toHaveCount(0)
  await panel.evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(page.getByTestId('colors-more')).toBeVisible()
  // Taps go through the cue to the swatch under it.
  expect(await page.getByTestId('colors-more').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
})
