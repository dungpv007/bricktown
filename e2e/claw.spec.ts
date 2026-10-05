import { expect, test, type Page } from '@playwright/test'

interface ClawWindow {
  __btClaw?: {
    state(): { phase: string; tries: number; tray: string | null; trayGift: string | null; owned: number; pile: Array<{ id: number; kind: string; gift: string | null; x: number; z: number }> }
    moveTo(x: number, z: number): boolean
    drop(): boolean
    noSlip(on: boolean): void
    point(name: 'tray' | 'button'): { x: number; y: number } | null
  }
}

const claw = (page: Page) => page.getByTestId('claw')
/** The game's state (dev hook). */
const state = (page: Page) => page.evaluate(() => (window as unknown as ClawWindow).__btClaw!.state())

test('claw machine: steer over a gift box, grab it, open it at the door, and what was inside lands in the cabinet', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-play').click()
  await page.getByTestId('play-game-claw').click()
  await expect(page.getByTestId('mode-play')).toHaveAttribute('data-game', 'claw')
  // The prizes download first (a loading card), then the round's ▶️.
  await page.getByTestId('round-start').click({ timeout: 30_000 })
  await expect(claw(page)).toHaveAttribute('data-phase', 'aim')
  await expect(page.getByTestId('claw-tries')).toHaveAttribute('data-left', '5')
  await expect(page.getByTestId('claw-cabinet-open')).toHaveAttribute('data-count', '0')

  // Steer the claw over a gift box and press the big red button (slips off: the grab holds).
  await page.evaluate(() => (window as unknown as ClawWindow).__btClaw!.noSlip(true))
  const { pile } = await state(page)
  expect(pile.length).toBeGreaterThan(5)
  const target = pile.find((p) => p.gift)!
  expect(target).toBeDefined()
  // The aiming aids: the top-down view is up while aiming.
  await expect(page.getByTestId('claw-topview')).toBeVisible()
  await page.evaluate(([x, z]) => (window as unknown as ClawWindow).__btClaw!.moveTo(x, z), [target.x, target.z])
  await page.getByTestId('claw-drop').click()
  await expect(page.getByTestId('claw-tries')).toHaveAttribute('data-left', '4')

  // The gift comes out of the prize door: tap it, it wobbles, opens, and shows what was inside.
  await expect(claw(page)).toHaveAttribute('data-phase', 'tray', { timeout: 15_000 })
  expect(await state(page)).toMatchObject({ tray: target.kind, trayGift: target.gift })
  const at = (await page.evaluate(() => (window as unknown as ClawWindow).__btClaw!.point('tray')))!
  await page.mouse.click(at.x, at.y)
  await expect(page.getByTestId('claw-reveal')).toHaveAttribute('data-stage', 'box')
  await expect(page.getByTestId('claw-reveal')).toHaveAttribute('data-stage', 'show')
  await expect(page.getByTestId('claw-reveal')).toHaveAttribute('data-kind', target.kind)

  // It flies to the cabinet: one kind owned, saved, and on the shelf.
  await expect(claw(page)).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 })
  await expect(page.getByTestId('claw-cabinet-open')).toHaveAttribute('data-count', '1')
  await expect(claw(page)).toHaveAttribute('data-owned', '1')
  await page.getByTestId('claw-cabinet-open').click()
  await expect(page.getByTestId('claw-cabinet')).toHaveAttribute('data-owned', '1')
  await page.getByTestId('claw-cabinet-back').click()
  await expect(claw(page)).toHaveAttribute('data-view', 'machine')

  // Over the chute (where the claw waits) nothing is near: the claw comes back empty, a try is used.
  await page.keyboard.press('Space')
  await expect(page.getByTestId('claw-tries')).toHaveAttribute('data-left', '3')
  await expect(claw(page)).toHaveAttribute('data-phase', 'aim', { timeout: 10_000 })
  expect((await state(page)).owned).toBe(1)
  expect(errors).toEqual([])
})
