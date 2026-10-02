import { expect, test, type Page } from '@playwright/test'

interface BakeryWindow {
  __btBakery?: { at(name: string): { x: number; y: number } | null }
}

/** A stage point of the bakery in page pixels (dev handle). */
async function at(page: Page, name: string) {
  let p: { x: number; y: number } | null = null
  await expect
    .poll(async () => {
      p = await page.evaluate((n) => (window as unknown as BakeryWindow).__btBakery?.at(n) ?? null, name)
      return p
    })
    .not.toBeNull()
  return p as unknown as { x: number; y: number }
}

const bakery = (page: Page) => page.getByTestId('bakery')

/**
 * Drags from one named stage point to another with the mouse, until the game shows `attr` = `value`
 * (a piece that has just appeared may not be drawn yet: then the drag is simply tried again).
 */
async function drag(page: Page, from: string, to: string, attr: string, value: string) {
  await expect(async () => {
    const a = await at(page, from)
    const b = await at(page, to)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 })
    await page.mouse.move(b.x, b.y, { steps: 6 })
    await page.mouse.up()
    await expect(bakery(page)).toHaveAttribute(attr, value, { timeout: 1500 })
  }).toPass({ timeout: 20_000 })
}

test('bakery: bake, frost and decorate one cake for a customer, and coins come in', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-play').click()
  await page.getByTestId('play-game-bakery').click()
  await expect(page.getByTestId('mode-play')).toHaveAttribute('data-game', 'bakery')
  await page.getByTestId('round-start').click()

  // The customer walks in and shows the cake they want.
  await expect(page.getByTestId('order-bubble')).toBeVisible()
  await expect(bakery(page)).toHaveAttribute('data-ready', 'true')
  await expect(page.getByTestId('bakery-round-coins')).toHaveAttribute('data-coins', '0')

  await drag(page, 'flour', 'bowl', 'data-added', '1')
  await drag(page, 'egg', 'bowl', 'data-added', '2')
  await drag(page, 'milk', 'bowl', 'data-added', '3')
  await expect(bakery(page)).toHaveAttribute('data-step', 'mix')

  const bowl = await at(page, 'bowl')
  for (let i = 0; i < 5; i++) await page.mouse.click(bowl.x, bowl.y)
  await expect(bakery(page)).toHaveAttribute('data-step', 'pour')

  await drag(page, 'bowl', 'round', 'data-step', 'oven')
  await drag(page, 'round', 'oven', 'data-step', 'baking')
  await expect(page.getByTestId('bakery-timer')).toBeVisible()

  // Ding: out of the oven, then the frosting.
  await expect(page.getByTestId('bakery-palette')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('bakery-frost-pink').click()
  await expect(bakery(page)).toHaveAttribute('data-step', 'decorate')

  await drag(page, 'strawberry', 'cake', 'data-toppings', '1')
  await drag(page, 'candle', 'cake', 'data-toppings', '2')
  await drag(page, 'cake', 'customer', 'data-step', 'served')

  // Coins fly to the round's tally; the next customer comes in.
  await expect
    .poll(async () => Number(await page.getByTestId('bakery-round-coins').getAttribute('data-coins')))
    .toBeGreaterThanOrEqual(3)
  await expect(page.getByTestId('play-progress')).toHaveAttribute('data-done', '1')
  await expect(bakery(page)).toHaveAttribute('data-step', 'ingredients')
  expect(errors).toEqual([])
})
