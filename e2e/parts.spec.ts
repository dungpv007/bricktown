import { expect, test, type Page } from '@playwright/test'

interface Brick { p: string; x: number; y: number; z: number; c: number }
interface BtWindow {
  __bt: {
    useEditor: { getState(): { partId: string; place(x: number, y: number, z: number): void; setColor(c: number): void } }
    useGame: { getState(): { data: { workshop: { bricks: Brick[] } } } }
  }
}

const bricks = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop.bricks)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
})

test('parts: the decor tab lists the printed tiles with rendered pictures; one places like any brick', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.getByTestId('category-decor').click()
  await expect(page.getByTestId('category-decor')).toHaveAttribute('aria-pressed', 'true')
  for (const id of ['print_police_2x2', 'print_clock_2x2', 'print_menu_1x2', 'print_eyes_1x2', 'print_heart_1x1', 'flag_1x2']) {
    await expect(page.getByTestId(`part-${id}`)).toBeVisible()
  }
  // The palette shows a rendered thumbnail (prints included) once it is ready.
  await expect(page.getByTestId('part-print_clock_2x2').locator('img.bt-part-thumb')).toBeVisible()

  await page.getByTestId('part-print_clock_2x2').click()
  expect(await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().partId)).toBe('print_clock_2x2')
  await page.evaluate(() => {
    const ed = (window as unknown as BtWindow).__bt.useEditor.getState()
    ed.setColor(16) // trans red body: the print keeps its own colours
    ed.place(2, 0, 2)
  })
  expect(await bricks(page)).toEqual([expect.objectContaining({ p: 'print_clock_2x2', x: 2, y: 0, z: 2, c: 16 })])
  await page.waitForTimeout(300) // a few frames with the print drawn
  expect(errors).toEqual([])
})

test('parts: rocket, police and furniture parts sit in their tabs', async ({ page }) => {
  const tabs: Record<string, string[]> = {
    round: ['cone_2x2', 'dish_2x2', 'engine_2x2'],
    slope: ['fin_1x3'],
    door_window: ['bars_1x4x3'],
    furniture: ['steering_1x2', 'computer_1x2', 'bed_2x4'],
    decor: ['antenna_1x1', 'flag_1x2'],
  }
  for (const [tab, ids] of Object.entries(tabs)) {
    await page.getByTestId(`category-${tab}`).click()
    for (const id of ids) await expect(page.getByTestId(`part-${id}`), id).toBeVisible()
  }
})
