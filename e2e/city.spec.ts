import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedSlotData } from './support'

interface CityData {
  size: number
  roads: string[]
  placements: Array<{ id: string; source: string; cx: number; cz: number; rot: number; s?: number }>
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

  await flushAutosave(page)
  await expect
    .poll(async () => (await savedSlotData<{ city: CityData }>(page))?.city.placements.map((p) => p.id))
    .toEqual(['e2e-house'])
  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('mode-city').locator('canvas')).toBeVisible()

  const city = await cityData(page)
  expect(new Set(city.roads)).toEqual(new Set(['10,10', '11,10', '12,10', '13,10']))
  expect(city.placements).toEqual([{ id: 'e2e-house', source: 'tpl:house_small', cx: 11, cz: 11, rot: 0 }])
  expect(errors).toEqual([])
})

test('city: in road mode one finger paints roads (two fingers do not) and the eraser erases them', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
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
  const painted = (await cityData(page)).roads.length
  expect(painted).toBeGreaterThan(3)

  // The eraser takes the same stroke back off in one undo step.
  await page.getByTestId('city-road-eraser').click()
  await touch('touchStart', [[x - 100, y]])
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[x - 100 + i * 20, y]])
  await touch('touchEnd', [])
  expect((await cityData(page)).roads).toEqual([])
  await page.getByTestId('city-undo').click()
  expect((await cityData(page)).roads.length).toBe(painted)

  // A two-finger pinch moves the camera instead.
  await touch('touchStart', [[x - 50, y + 100]])
  await touch('touchStart', [[x - 50, y + 100], [x + 50, y + 100]])
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[x - 50 - i * 10, y + 100], [x + 50 + i * 10, y + 100]])
  await touch('touchEnd', [])
  expect((await cityData(page)).roads.length).toBe(painted)
})

test('city: tap selects (rotate, delete), a placement drags to a new cell, a Kho card drags onto the map', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('main-menu').waitFor()
  // The camera starts centred on what is built: one house in the middle of the view.
  await page.evaluate(() => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState()
    game.setCity({ size: 48, roads: [], placements: [{ id: 'house', source: 'tpl:house_small', cx: 20, cz: 20, rot: 0 }] })
  })
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const house = async () => (await cityData(page)).placements.find((p) => p.id === 'house')

  // Tap: the action bar appears; rotate turns the house.
  await expect(page.getByTestId('city-action-bar')).toHaveCount(0)
  await expect.poll(async () => {
    await page.mouse.click(cx, cy) // the canvas may still be sizing itself right after it appears
    return page.getByTestId('city-action-bar').count()
  }).toBe(1)
  await expect(page.getByTestId('city-act-edit')).toHaveCount(0) // a template: not editable
  await page.getByTestId('city-act-rotate').click()
  expect((await house())?.rot).toBe(1)

  // Drag the house to the right: it moves (one undo step), the camera does not.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 80, cy, { steps: 6 })
  await page.mouse.move(cx + 160, cy, { steps: 6 })
  await page.mouse.up()
  const moved = await house()
  expect(moved?.cx).toBeGreaterThan(21)
  expect(moved?.cz).toBe(20)
  await page.getByTestId('city-undo').click()
  expect((await house())?.cx).toBe(20)
  await page.getByTestId('city-redo').click()
  expect((await house())?.cx).toBe(moved?.cx)

  // Tap it where it is now and delete it.
  await page.mouse.click(cx + 160, cy)
  await page.getByTestId('city-act-delete').click()
  expect((await cityData(page)).placements).toEqual([])
  await expect(page.getByTestId('city-action-bar')).toHaveCount(0)

  // Drag a tree out of the Kho onto the middle of the map: it is placed there and selected.
  const card = (await page.getByTestId('src-tpl-tree').boundingBox())!
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2)
  await page.mouse.down()
  await page.mouse.move(card.x + card.width / 2, card.y - 60, { steps: 6 })
  await page.mouse.move(cx, cy, { steps: 10 })
  await page.mouse.up()
  const city = await cityData(page)
  expect(city.placements.map((p) => p.source)).toEqual(['tpl:tree'])
  await expect(page.getByTestId('city-action-bar')).toBeVisible()
  // The drag did not also pick the card for quick-placing.
  await expect(page.getByTestId('src-tpl-tree')).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('city: a picked Kho card quick-places where the ground is tapped; undo / redo', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.getByTestId('src-tpl-tree').click()
  await expect(page.getByTestId('src-tpl-tree')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => {
    if ((await cityData(page)).placements.length === 0) await page.mouse.click(cx, cy + 90)
    return (await cityData(page)).placements.map((p) => p.source)
  }).toEqual(['tpl:tree'])
  await expect(page.getByTestId('city-action-bar')).toBeVisible()

  await page.getByTestId('city-undo').click()
  expect((await cityData(page)).placements).toHaveLength(0)
  await page.getByTestId('city-redo').click()
  expect((await cityData(page)).placements).toHaveLength(1)
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
  await expect(page.getByTestId('city-act-edit')).toHaveCount(0)
  await page.evaluate(() => (window as unknown as EditBt).__bt.useCityEditor.getState().selectPlacement('pl-e2e'))

  await page.getByTestId('city-act-edit').click()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('mode-city')).toBeVisible()
  await page.getByTestId('city-act-edit').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('mode-workshop')).toBeVisible()
  const ws = await page.evaluate(() => (window as unknown as EditBt).__bt.useGame.getState().data.workshop)
  expect(ws.editingBlueprintId).toBe('bp-e2e')
  expect(ws.bricks).toHaveLength(1)
})

test('city: placements whose blueprint is gone or broken show as blocks that can be selected and deleted', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('main-menu').waitFor()
  // The camera starts centred on what is built: here, one placement whose blueprint no longer exists.
  await page.evaluate(() => {
    const game = (window as unknown as EditBt).__bt.useGame.getState()
    game.setCity({ size: 48, roads: [], placements: [{ id: 'gone', source: 'deleted-bp', cx: 20, cz: 20, rot: 0 }] })
  })
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await expect.poll(async () => {
    await page.mouse.click(centre.x, centre.y) // the canvas may still be sizing itself right after it appears
    return page.getByTestId('city-action-bar').count()
  }).toBe(1)
  await page.getByTestId('city-act-delete').click()
  expect((await cityData(page)).placements).toHaveLength(0)

  // A blueprint using a part id this version does not know: still no crash, still erasable.
  await page.evaluate(() => {
    const game = (window as unknown as EditBt).__bt.useGame.getState()
    game.upsertBlueprint({
      id: 'bp-broken',
      name: 'broken',
      kind: 'prop',
      tags: [],
      baseplate: { w: 8, d: 8 },
      bricks: [{ id: 'a', p: 'part_from_the_future', x: 0, y: 0, z: 0, r: 0, c: 1 }],
      createdAt: 1,
      updatedAt: 1,
    })
    game.setCity({ size: 48, roads: [], placements: [{ id: 'broken', source: 'bp-broken', cx: 20, cz: 20, rot: 0 }] })
  })
  await expect(page.getByTestId('src-bp-broken')).toBeVisible()
  await page.mouse.click(centre.x, centre.y)
  await page.getByTestId('city-act-delete').click()
  expect((await cityData(page)).placements).toHaveLength(0)
  expect(errors).toEqual([])
})

test('city: a finger whose release got lost does not block later taps', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // A second (non-primary) finger goes down and its pointerup never arrives (e.g. lifted off-screen).
  await page.evaluate(([x, y]) => {
    const el = document.querySelector('[data-testid="mode-city"] canvas')!
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, isPrimary: false, clientX: x, clientY: y, bubbles: true }))
  }, [cx + 60, cy + 90])

  await page.getByTestId('src-tpl-tree').click()
  await page.mouse.click(cx, cy + 90)
  const city = await cityData(page)
  expect(city.placements).toHaveLength(1)
  expect(city.placements[0].source).toBe('tpl:tree')
})

test('city: the size control scales the selected model (one undo step each) and the size persists', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('main-menu').waitFor()
  // The camera starts centred on what is built: one rocket in the middle of the view.
  await page.evaluate(() => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState()
    game.setCity({ size: 48, roads: [], placements: [{ id: 'rocket', source: 'tpl:rocket', cx: 20, cz: 20, rot: 0 }] })
  })
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  await expect.poll(async () => {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2) // the canvas may still be sizing itself
    return page.getByTestId('city-action-bar').count()
  }).toBe(1)
  const label = page.getByTestId('city-scale-label')
  const rocketSize = async () => (await cityData(page)).placements.find((p) => p.id === 'rocket')?.s
  await expect(label).toHaveText('×1')
  await expect(page.getByTestId('city-scale-down')).toBeDisabled()

  await page.getByTestId('city-scale-up').click()
  await page.getByTestId('city-scale-up').click()
  await expect(label).toHaveText('×3')
  expect(await rocketSize()).toBe(3)

  // Undo takes one size step back and keeps the model selected; redo puts it back.
  await page.getByTestId('city-undo').click()
  await expect(label).toHaveText('×2')
  expect(await rocketSize()).toBe(2)
  await page.getByTestId('city-redo').click()
  await expect(label).toHaveText('×3')

  // The size is saved: after a reload the rocket is still x3 (undo history is per visit, so the
  // undo after the reload takes back a step made after it).
  await flushAutosave(page)
  await expect.poll(async () => (await savedSlotData<{ city: CityData }>(page))?.city.placements[0]?.s).toBe(3)
  await page.reload()
  await page.getByTestId('menu-city').click()
  await expect(canvas).toBeVisible()
  expect(await rocketSize()).toBe(3)
  await page.evaluate(() => (window as unknown as EditBt).__bt.useCityEditor.getState().selectPlacement('rocket'))
  await expect(label).toHaveText('×3')
  await page.getByTestId('city-scale-down').click()
  await expect(label).toHaveText('×2')
  await page.getByTestId('city-undo').click()
  await expect(label).toHaveText('×3')
  expect(errors).toEqual([])
})
