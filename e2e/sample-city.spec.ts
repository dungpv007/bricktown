import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedSlotData } from './support'

interface CityData {
  size: number
  roads: string[]
  placements: Array<{ id: string; source: string; cx: number; cz: number; rot: number; s?: number }>
  terrain?: { water: string[]; pavement: string[]; sand: string[] }
  rails?: string[]
}
interface BtWindow {
  __bt: {
    useGame: { getState(): { data: { city: CityData }; setCity(city: CityData): void } }
    useCityEditor: { getState(): { selectSource(source: string): void; tapGround(x: number, z: number): void } }
    npcCount(): number
  }
}

const cityData = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.city)
const npcCount = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.npcCount())

/** The sample town: its railway loop, its lake and well over a hundred models. */
const isSampleTown = (city: CityData) =>
  (city.rails?.length ?? 0) > 100 &&
  (city.terrain?.water.length ?? 0) > 20 &&
  city.placements.length > 100 &&
  city.placements.some((p) => p.source === 'tpl:sushi_restaurant')

test.describe('a fresh profile', () => {
  // The configs make fresh saves start empty for every other spec (`bricktown-e2e-empty-city`): not here.
  test.use({ storageState: { cookies: [], origins: [] } })
  test.beforeEach(({ page }) =>
    page.addInitScript(() => {
      localStorage.setItem('bricktown-onboarded-v2', '1')
      localStorage.setItem('bricktown-install-hint-dismissed', '1')
      localStorage.setItem('bricktown-prefs', JSON.stringify({ state: { musicOn: false, sfxOn: false }, version: 0 }))
    }),
  )

  test('opens the City on the sample town, alive with cars, a train and people', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.getByTestId('menu-city').click()
    await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()
    expect(isSampleTown(await cityData(page))).toBe(true)
    await expect.poll(() => npcCount(page)).toBeGreaterThan(10)
    // Nothing is written until the kid changes something: the slot stays a fresh one.
    await flushAutosave(page)
    expect(await savedSlotData(page)).toBeNull()
    expect(errors).toEqual([])
  })
})

test('🏙️ replaces an edited city with the sample town after a yes, and undo cannot bring the old one back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()
  expect((await cityData(page)).placements).toHaveLength(0) // this profile starts empty (the e2e flag)

  // The kid's own city: a road and a house (placed with the editor, so there is something to undo).
  await page.evaluate(() => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState()
    game.setCity({ ...game.data.city, roads: ['5,5', '6,5', '7,5'], placements: [] })
  })
  await page.evaluate(() => {
    const ed = (window as unknown as BtWindow).__bt.useCityEditor.getState()
    ed.selectSource('tpl:house_small')
    ed.tapGround(10.5 * 8, 10.5 * 8) // world studs: the middle of cell (10, 10)
  })
  await expect.poll(async () => (await cityData(page)).placements.length).toBe(1)
  await expect(page.getByTestId('city-undo')).toBeEnabled()

  const button = page.getByTestId('city-load-sample')
  await button.click()
  await expect(page.getByTestId('confirm-dialog')).toBeVisible()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  expect((await cityData(page)).placements).toHaveLength(1)

  await button.click()
  await page.getByTestId('confirm-yes').click()
  await expect.poll(async () => isSampleTown(await cityData(page))).toBe(true)
  expect((await cityData(page)).roads).not.toContain('5,5')
  await expect(page.getByTestId('city-undo')).toBeDisabled()
  await expect.poll(() => npcCount(page)).toBeGreaterThan(10)

  // It is the kid's city now: saved like any edit.
  await flushAutosave(page)
  await expect.poll(async () => isSampleTown((await savedSlotData<{ city: CityData }>(page))!.city)).toBe(true)
  expect(errors).toEqual([])
})
