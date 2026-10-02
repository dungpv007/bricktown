import { expect, test, type Page } from '@playwright/test'

interface Point {
  x: number
  y: number
}
interface GroceryHandle {
  items(): Array<Point & { state: string }>
  scanner(): Point
}

const handle = <T,>(page: Page, fn: (h: GroceryHandle) => T) =>
  page.evaluate(`(${fn.toString()})(window.__btGrocery)`) as Promise<T>

/** Drags the item at `from` over the scanner with a few pointer moves, like a finger would. */
async function dragTo(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  await page.mouse.up()
}

/** Serves the customer at the till (Bé nhỏ): scans every item on the belt, then taps pay. */
async function serveCustomer(page: Page) {
  const till = page.getByTestId('grocery-till')
  await expect(till).toBeVisible()
  // Wait until all the goods are on the belt.
  await expect(till).toHaveAttribute('data-step', 'scan')
  const count = await handle(page, (h) => h.items().length)
  expect(count).toBeGreaterThanOrEqual(2)
  let total = 0
  for (let i = 0; i < count; i++) {
    const item = await handle(page, (h) => h.items().find((it) => it.state === 'belt') ?? null)
    expect(item).not.toBeNull()
    const scanner = await handle(page, (h) => h.scanner())
    await dragTo(page, item!, scanner)
    // Beep: the till adds its price.
    await expect.poll(async () => Number(await page.getByTestId('grocery-total').getAttribute('data-total'))).toBeGreaterThan(total)
    total = Number(await page.getByTestId('grocery-total').getAttribute('data-total'))
  }
  await expect(till).toHaveAttribute('data-step', 'pay')
  await page.getByTestId('grocery-pay').click()
  await expect(page.getByTestId('grocery-happy')).toBeVisible()
}

test('grocery: scan a customer’s goods, take the payment, and the coins go up at the end of the round', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-play').click()
  await page.getByTestId('play-game-grocery').click()
  const screen = page.getByTestId('mode-play')
  await expect(screen).toHaveAttribute('data-game', 'grocery')
  await expect(screen.locator('canvas')).toBeVisible()
  const coins = page.getByTestId('play-coins')
  const before = Number(await coins.getAttribute('data-coins'))

  await page.getByTestId('grocery-level-small').click()
  const progress = page.getByTestId('play-progress')
  for (let served = 0; served < 4; served++) {
    await serveCustomer(page)
    if (served < 3) await expect(progress).toHaveAttribute('data-done', String(served + 1))
  }

  await expect(page.getByTestId('round-summary')).toBeVisible()
  await expect(page.getByTestId('round-coins')).toHaveAttribute('data-coins', '12')
  await expect.poll(async () => Number(await coins.getAttribute('data-coins'))).toBe(before + 12)
  await expect(page.getByTestId('sticker-grocery_first')).toBeVisible()
  expect(errors).toEqual([])
})
