import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __btRescue?: { phase(): string; kind(): string; teleport(): void }
  __btDrive?: { x: number; z: number }
}

const coins = async (page: Page) => Number(await page.getByTestId('play-coins').getAttribute('data-coins'))

test('rescue: answer a fire call, drive there, hold the hose until the fire is out, and get coins', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-play').click()
  await page.getByTestId('play-game-rescue').click()

  const game = page.getByTestId('rescue-game')
  await expect(game).toHaveAttribute('data-phase', 'ringing')
  // A fresh save starts with a fire; the empty e2e city has no building, so the built-in town is used.
  await expect(game).toHaveAttribute('data-kind', 'fire')
  await expect(game).toHaveAttribute('data-builtin', 'true')
  const before = await coins(page)

  await page.getByTestId('rescue-answer').click()
  await expect(page.getByTestId('rescue-call')).toBeVisible()
  await expect(page.getByTestId('rescue-map')).toBeVisible()
  await page.getByTestId('rescue-go').click()

  await expect(game).toHaveAttribute('data-phase', 'drive')
  await expect(page.getByTestId('rescue-canvas').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('drive-ui')).toBeVisible()
  await expect(page.getByTestId('drive-change')).toHaveCount(0)
  // The truck is in the world: put it at the target (dev hook), it arrives.
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__btDrive !== undefined)).toBe(true)
  await page.evaluate(() => (window as unknown as BtWindow).__btRescue!.teleport())
  await expect(game).toHaveAttribute('data-phase', 'action')

  // Hold 💦 until the fire is out.
  const spray = page.getByTestId('rescue-spray')
  await expect(spray).toBeVisible()
  const box = (await spray.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(spray).toHaveAttribute('data-holding', 'true')
  await expect.poll(async () => Number(await spray.getAttribute('data-progress')), { timeout: 20_000 }).toBeGreaterThan(0)
  await expect(game).toHaveAttribute('data-phase', 'cheer', { timeout: 30_000 })
  await page.mouse.up()
  await expect(page.getByTestId('rescue-cheer')).toBeVisible()

  // Back at the station: the summary, coins paid into the wallet, the brave-firefighter sticker.
  const summary = page.getByTestId('round-summary')
  await expect(summary).toBeVisible()
  expect(Number(await page.getByTestId('round-coins').getAttribute('data-coins'))).toBeGreaterThan(0)
  await expect.poll(() => coins(page)).toBeGreaterThan(before)
  await expect(page.getByTestId('sticker-rescue_first')).toBeVisible()

  // Again: the next call is a robber.
  await page.getByTestId('round-again').click()
  await expect(game).toHaveAttribute('data-phase', 'ringing')
  await expect(game).toHaveAttribute('data-kind', 'police')
  expect(errors).toEqual([])
})
