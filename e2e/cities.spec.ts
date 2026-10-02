import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedSlotData, sizedBox, type SavedCities } from './support'

interface CityData {
  size: number
  roads: string[]
  placements: Array<{ id: string; source: string; cx: number; cz: number; rot: number }>
}
interface BtWindow {
  __bt: {
    useGame: {
      getState(): {
        setCity(city: CityData): void
        data: { cities: Array<{ id: string; name: string }>; currentCityId: string }
      }
    }
    currentCity(): CityData
  }
}

/** A folder for screenshots of the picker, for review (optional; e2e has no Node types, hence the cast). */
const SHOTS = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .CITIES_SHOTS

const cityData = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.currentCity())
const cities = (page: Page) =>
  page.evaluate(() => {
    const { cities: list, currentCityId } = (window as unknown as BtWindow).__bt.useGame.getState()
      .data
    return { ids: list.map((c) => c.id), names: list.map((c) => c.name), current: currentCityId }
  })

const FIRST_CITY = {
  size: 48,
  roads: ['10,10', '11,10', '12,10'],
  placements: [{ id: 'house', source: 'tpl:house_small', cx: 10, cz: 11, rot: 0 }],
}

test('cities: make a new empty city, paint in it, switch back, rename, reload, delete', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  await page.evaluate(
    (city) => (window as unknown as BtWindow).__bt.useGame.getState().setCity(city),
    FIRST_CITY,
  )
  const first = (await cities(page)).current

  // ➕ → 🟩 empty: a new city, opened right away.
  await page.getByTestId('city-picker').click()
  await expect(page.getByTestId('city-picker-dialog')).toBeVisible()
  await expect(page.getByTestId(`city-card-${first}`)).toHaveAttribute('data-current', 'true')
  await expect(page.getByTestId(`city-card-${first}`).getByTestId('city-delete')).toBeDisabled() // the only city
  await page.getByTestId('city-new').click()
  await page.getByTestId('city-new-empty').click()
  await expect(page.getByTestId('city-picker-dialog')).toHaveCount(0)
  const made = await cities(page)
  expect(made.ids).toHaveLength(2)
  const second = made.current
  expect(second).not.toBe(first)
  expect(made.names[1]).toBe('Thành phố 2')
  expect(await cityData(page)).toEqual({ size: 48, roads: [], placements: [] })

  // Paint a road in it with the road tool.
  const box = await sizedBox(canvas)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.getByTestId('city-road-mode').click()
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<[number, number]>) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([px, py], id) => ({ x: px, y: py, id })),
    })
  await touch('touchStart', [[x - 100, y]])
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[x - 100 + i * 20, y]])
  await touch('touchEnd', [])
  const painted = (await cityData(page)).roads
  expect(painted.length).toBeGreaterThan(3)
  await expect(page.getByTestId('city-undo')).toBeEnabled()
  await page.getByTestId('city-road-mode').click()

  // Back to the first city: its content is intact, and undo cannot reach into the other city.
  await page.getByTestId('city-picker').click()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/picker.png` })
  await expect(page.getByTestId(`city-card-${second}`)).toHaveAttribute('data-current', 'true')
  await page.getByTestId(`city-card-${first}`).click()
  await expect(page.getByTestId('city-picker-dialog')).toHaveCount(0)
  expect((await cities(page)).current).toBe(first)
  expect(await cityData(page)).toEqual(FIRST_CITY)
  await expect(page.getByTestId('city-undo')).toBeDisabled()

  // ✏️ Rename the new city (the name is cleaned: trimmed).
  await page.getByTestId('city-picker').click()
  await page.getByTestId(`city-card-${second}`).getByTestId('city-rename').click()
  await page.getByTestId('city-rename-input').fill('  Phố biển 🌊  ')
  await page.getByTestId('city-rename-ok').click()
  await expect(page.getByTestId(`city-card-${second}`).getByTestId('city-name')).toHaveText(
    'Phố biển 🌊',
  )
  await expect(page.getByTestId(`city-card-${first}`)).toHaveAttribute('data-current', 'true') // renaming does not switch
  await page.getByTestId('city-picker-close').click()

  // Reload: both cities, their names and the current one come back.
  await flushAutosave(page)
  await expect
    .poll(async () => (await savedSlotData<SavedCities<CityData>>(page))?.cities.map((c) => c.name))
    .toEqual(['', 'Phố biển 🌊'])
  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('menu-city').click()
  await expect(canvas).toBeVisible()
  expect(await cities(page)).toEqual({
    ids: [first, second],
    names: ['', 'Phố biển 🌊'],
    current: first,
  })
  expect(await cityData(page)).toEqual(FIRST_CITY)
  await page.getByTestId('city-picker').click()
  await expect(page.getByTestId(`city-card-${first}`).getByTestId('city-name')).toHaveText(
    'Thành phố của bé',
  ) // the default name
  await page.getByTestId(`city-card-${second}`).click()
  expect(new Set((await cityData(page)).roads)).toEqual(new Set(painted))

  // 🗑️ Delete the extra city (it is the current one): asks first, then the first city is current again.
  await page.getByTestId('city-picker').click()
  await page.getByTestId(`city-card-${second}`).getByTestId('city-delete').click()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId(`city-card-${second}`)).toBeVisible()
  await page.getByTestId(`city-card-${second}`).getByTestId('city-delete').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId(`city-card-${second}`)).toHaveCount(0)
  await expect(page.getByTestId(`city-card-${first}`)).toHaveAttribute('data-current', 'true')
  await expect(page.getByTestId(`city-card-${first}`).getByTestId('city-delete')).toBeDisabled()
  expect(await cities(page)).toEqual({ ids: [first], names: [''], current: first })
  expect(await cityData(page)).toEqual(FIRST_CITY)
  await flushAutosave(page)
  await expect
    .poll(async () => (await savedSlotData<SavedCities<CityData>>(page))?.cities.length)
    .toBe(1)
  expect(errors).toEqual([])
})
