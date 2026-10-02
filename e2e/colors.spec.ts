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

test('colours: 30 swatches in a two-wide scrolling column; picking silver selects it', async ({ page }) => {
  await openWorkshop(page)
  const swatches = page.locator('.bt-colors .bt-swatch')
  await expect(swatches).toHaveCount(30)
  const first = await swatches.first().boundingBox()
  // Full size on tablets (easy for small fingers): 56px. Phones keep 20px ones (see the next test).
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

test('colours: small swatches on a phone, portrait and landscape', async ({ page }) => {
  for (const [width, height] of [
    [412, 891],
    [891, 412],
  ]) {
    await page.setViewportSize({ width, height })
    await openWorkshop(page)
    // A portrait phone starts with the column folded into its toggle: open it.
    await expect(page.locator('.bt-colors')).toBeVisible()
    if ((await page.locator('.bt-colors').getAttribute('data-collapsed')) === 'true') await page.getByTestId('colors-toggle').click()
    const first = await page.locator('.bt-colors .bt-swatch').first().boundingBox()
    expect(first!.width, `${width}×${height}`).toBeGreaterThanOrEqual(18)
    expect(first!.width, `${width}×${height}`).toBeLessThanOrEqual(22)
  }
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
