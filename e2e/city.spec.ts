import { expect, test, type Page } from '@playwright/test'

interface CityData {
  size: number
  roads: string[]
  placements: Array<{ id: string; source: string; cx: number; cz: number; rot: number }>
}
interface BtWindow {
  __bt: {
    useGame: { getState(): { data: { city: CityData }; setCity(city: CityData): void } }
  }
}

const cityData = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.city)

test('city: roads and a template placement persist across a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('src-tpl-house_small')).toBeVisible()

  await page.evaluate(() => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState()
    game.setCity({
      ...game.data.city,
      roads: ['10,10', '11,10', '12,10', '13,10'],
      placements: [{ id: 'e2e-house', source: 'tpl:house_small', cx: 11, cz: 11, rot: 0 }],
    })
  })

  await page.waitForTimeout(2500) // autosave debounce
  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()

  const city = await cityData(page)
  expect(new Set(city.roads)).toEqual(new Set(['10,10', '11,10', '12,10', '13,10']))
  expect(city.placements).toEqual([{ id: 'e2e-house', source: 'tpl:house_small', cx: 11, cz: 11, rot: 0 }])
  expect(errors).toEqual([])
})

test('city: one-finger drag paints roads with the road tool; two fingers do not', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.getByTestId('city-tool-road').click()

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<[number, number]>) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([px, py], id) => ({ x: px, y: py, id })),
    })

  await touch('touchStart', [[x - 100, y]])
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[x - 100 + i * 20, y]])
  await touch('touchEnd', [])
  const painted = (await cityData(page)).roads.length
  expect(painted).toBeGreaterThan(3)

  // A two-finger pinch moves the camera instead.
  await touch('touchStart', [[x - 50, y + 100]])
  await touch('touchStart', [[x - 50, y + 100], [x + 50, y + 100]])
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[x - 50 - i * 10, y + 100], [x + 50 + i * 10, y + 100]])
  await touch('touchEnd', [])
  expect((await cityData(page)).roads.length).toBe(painted)
})

test('city: tools paint a road, place a picked template, undo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // Road tool: drag across the middle of the view.
  await page.getByTestId('city-tool-road').click()
  await page.mouse.move(cx - 120, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy, { steps: 8 })
  await page.mouse.move(cx + 120, cy, { steps: 8 })
  await page.mouse.up()
  const afterRoad = await cityData(page)
  expect(afterRoad.roads.length).toBeGreaterThan(3)

  // Pick a tree from the drawer (switches to the place tool) and tap below the road.
  await page.getByTestId('src-tpl-tree').click()
  await expect(page.getByTestId('city-tool-place')).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.click(cx, cy + 90)
  const afterPlace = await cityData(page)
  expect(afterPlace.placements).toHaveLength(1)
  expect(afterPlace.placements[0].source).toBe('tpl:tree')

  await page.getByTestId('city-undo').click()
  expect((await cityData(page)).placements).toHaveLength(0)
  expect(errors).toEqual([])
})

interface EditBt {
  __bt: {
    useGame: {
      getState(): {
        data: { workshop: { editingBlueprintId?: string; bricks: unknown[] } }
        upsertBlueprint(bp: unknown): void
        setCity(city: unknown): void
        setWorkshop(ws: unknown): void
      }
    }
    useCityEditor: { getState(): { selectPlacement(id: string): void } }
  }
}

test('city: a placed blueprint opens in the workshop, asking before replacing work in progress', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('main-menu').waitFor()
  await page.evaluate(() => {
    const game = (window as unknown as EditBt).__bt.useGame.getState()
    game.upsertBlueprint({
      id: 'bp-e2e',
      name: 'Nhà e2e',
      kind: 'building',
      tags: [],
      baseplate: { w: 16, d: 16 },
      bricks: [{ id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 }],
      createdAt: 1,
      updatedAt: 1,
    })
    game.setCity({ size: 48, roads: [], placements: [{ id: 'pl-e2e', source: 'bp-e2e', cx: 5, cz: 5, rot: 0 }] })
    // Something else is being built in the workshop.
    game.setWorkshop({ ...game.data.workshop, bricks: [{ id: 'w', p: 'brick_1x1', x: 0, y: 0, z: 0, r: 0, c: 1 }] })
  })
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('src-bp-e2e')).toBeVisible()
  await expect(page.getByTestId('city-edit')).toHaveCount(0)
  await page.evaluate(() => (window as unknown as EditBt).__bt.useCityEditor.getState().selectPlacement('pl-e2e'))

  await page.getByTestId('city-edit').click()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('mode-city')).toBeVisible()
  await page.getByTestId('city-edit').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('mode-workshop')).toBeVisible()
  const ws = await page.evaluate(() => (window as unknown as EditBt).__bt.useGame.getState().data.workshop)
  expect(ws.editingBlueprintId).toBe('bp-e2e')
  expect(ws.bricks).toHaveLength(1)
})
