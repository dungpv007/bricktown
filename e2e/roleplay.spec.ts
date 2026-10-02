import { expect, test, type Page } from '@playwright/test'
import { cityCanvasBox } from './support'

interface CityData {
  size: number
  roads: string[]
  placements: Array<{ id: string; source: string; cx: number; cz: number; rot: number }>
}
interface BtWindow {
  __bt: {
    useGame: { getState(): { setCity(city: CityData): void } }
    currentCity(): CityData
  }
}

/** Opens the City with a sushi restaurant on the map. */
async function cityWithSushi(page: Page) {
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()
  await page.evaluate(() => {
    const bt = (window as unknown as BtWindow).__bt
    bt.useGame.getState().setCity({
      ...bt.currentCity(),
      roads: ['20,26', '21,26', '22,26', '23,26', '24,26', '25,26', '26,26', '27,26'],
      placements: [{ id: 'e2e-sushi', source: 'tpl:sushi_restaurant', cx: 20, cz: 20, rot: 0 }],
    })
  })
  await cityCanvasBox(page)
}

test('roleplay: the ▶️ over a sushi restaurant opens its game, and Back returns to the City', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await cityWithSushi(page)

  const badge = page.getByTestId('play-badge-e2e-sushi')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('data-game', 'sushi')
  await badge.click()

  const screen = page.getByTestId('mode-play')
  await expect(screen).toBeVisible()
  await expect(screen).toHaveAttribute('data-game', 'sushi')
  // Until the sushi game lands, its coming-soon card; afterwards, the game's own canvas.
  await expect(page.getByTestId('play-coming-soon').or(screen.locator('canvas'))).toBeVisible()
  await expect(page.getByTestId('play-coins')).toBeVisible()

  await page.getByTestId('back').click()
  await expect(page.getByTestId('mode-city')).toBeVisible()
  await cityCanvasBox(page)
  await expect(page.getByTestId('play-badge-e2e-sushi')).toBeVisible()

  // Selecting the shop hides the badges and offers 🎮 in its action bar; the ▶️ toggle hides them all.
  await page.evaluate(() => (window as unknown as { __bt: { useCityEditor: { getState(): { selectPlacement(id: string | null): void } } } }).__bt.useCityEditor.getState().selectPlacement('e2e-sushi'))
  await expect(page.getByTestId('city-act-play')).toBeVisible()
  await expect(page.getByTestId('play-badge-e2e-sushi')).toHaveCount(0)
  await page.getByTestId('city-act-deselect').click()
  await expect(page.getByTestId('play-badge-e2e-sushi')).toBeVisible()
  const toggle = page.getByTestId('city-play-badges')
  if (!(await toggle.isVisible())) await page.getByTestId('topright-more').click()
  await toggle.click()
  await expect(page.getByTestId('play-badge-e2e-sushi')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('roleplay: the 🎮 menu card opens the game picker, the sticker book and the shop', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-play').click()
  const hub = page.getByTestId('play-hub')
  await expect(hub).toBeVisible()
  for (const id of ['sushi', 'bakery', 'grocery', 'rescue']) await expect(page.getByTestId(`play-game-${id}`)).toBeVisible()

  await page.getByTestId('play-tab-stickers').click()
  await expect(page.getByTestId('sticker-book')).toBeVisible()
  await expect(page.getByTestId('sticker-book').locator('.bt-sticker')).toHaveCount(24)
  await expect(page.getByTestId('sticker-count')).toContainText('0 / 24')

  await page.getByTestId('play-tab-shop').click()
  await expect(page.getByTestId('play-shop')).toBeVisible()
  await expect(page.getByTestId('shop-buy-fig_king')).toBeDisabled() // no coins yet

  // The dev-only demo game starts from the picker; Back returns to the menu.
  await page.getByTestId('play-tab-games').click()
  await page.getByTestId('play-game-demo').click()
  await expect(page.getByTestId('mode-play')).toHaveAttribute('data-game', 'demo')
  await expect(page.getByTestId('round-intro')).toBeVisible()
  await page.getByTestId('back').click()
  await expect(page.getByTestId('main-menu')).toBeVisible()
})
