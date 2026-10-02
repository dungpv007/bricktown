import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedCity, savedSlotData, type SavedCities } from './support'

interface CityData {
  size: number
  roads: string[]
  placements: Array<{ id: string; source: string; cx: number; cz: number; rot: number; s?: number }>
  terrain?: { water: string[]; pavement: string[]; sand: string[] }
  rails?: string[]
}
interface BtWindow {
  __bt: {
    useGame: { getState(): { setCity(city: CityData): void; data: { cities: Array<{ id: string }>; currentCityId: string } } }
    useCityEditor: { getState(): { selectSource(source: string): void; tapGround(x: number, z: number): void } }
    currentCity(): CityData
    npcCount(): number
  }
}

const cityData = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.currentCity())
const npcCount = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.npcCount())
const cityIds = (page: Page) =>
  page.evaluate(() => {
    const { cities, currentCityId } = (window as unknown as BtWindow).__bt.useGame.getState().data
    return { ids: cities.map((c) => c.id), current: currentCityId }
  })

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

test('🏙️ ➕ adds a copy of the sample town as a new city: the kid\'s own city stays, undo starts fresh', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()
  expect((await cityData(page)).placements).toHaveLength(0) // this profile starts empty (the e2e flag)

  // The kid's own city: a road and a house (placed with the editor, so there is something to undo).
  await page.evaluate(() => {
    const bt = (window as unknown as BtWindow).__bt
    bt.useGame.getState().setCity({ ...bt.currentCity(), roads: ['5,5', '6,5', '7,5'], placements: [] })
  })
  await page.evaluate(() => {
    const ed = (window as unknown as BtWindow).__bt.useCityEditor.getState()
    ed.selectSource('tpl:house_small')
    ed.tapGround(10.5 * 8, 10.5 * 8) // world studs: the middle of cell (10, 10)
  })
  await expect.poll(async () => (await cityData(page)).placements.length).toBe(1)
  await expect(page.getByTestId('city-undo')).toBeEnabled()
  const own = await cityIds(page)

  await page.getByTestId('city-picker').click()
  await page.getByTestId('city-new').click()
  await page.getByTestId('city-new-sample').click()
  await expect(page.getByTestId('city-picker-dialog')).toHaveCount(0)
  await expect.poll(async () => isSampleTown(await cityData(page))).toBe(true)
  const after = await cityIds(page)
  expect(after.ids).toHaveLength(2)
  expect(after.current).not.toBe(own.current)
  await expect(page.getByTestId('city-undo')).toBeDisabled()
  await expect.poll(() => npcCount(page)).toBeGreaterThan(10)

  // Saved like any edit, the kid's own city kept beside it.
  await flushAutosave(page)
  await expect.poll(async () => isSampleTown(savedCity(await savedSlotData<SavedCities<CityData>>(page))!)).toBe(true)
  const saved = (await savedSlotData<SavedCities<CityData>>(page))!
  expect(saved.cities.find((c) => c.id === own.current)!.city.roads).toEqual(['5,5', '6,5', '7,5'])
  expect(errors).toEqual([])
})
