import { expect, test, type Page } from '@playwright/test'

interface Body {
  setRotation(q: { x: number; y: number; z: number; w: number }, wake: boolean): void
  setTranslation(t: { x: number; y: number; z: number }, wake: boolean): void
}
interface Telemetry {
  x: number
  y: number
  z: number
  upY: number
  speed: number
  body: Body
}
interface BtWindow {
  __bt: {
    useGame: {
      getState(): {
        data: { city: { size: number } }
        setCity(city: unknown): void
        upsertBlueprint(bp: unknown): void
      }
    }
  }
  __btDrive?: Telemetry
}

const CELL = 8

/** Where the car is (dev-only telemetry published by the vehicle every physics step). */
const carState = (page: Page) =>
  page.evaluate(() => {
    const d = (window as unknown as BtWindow).__btDrive
    return d ? { x: d.x, y: d.y, z: d.z, upY: d.upY, speed: d.speed } : null
  })

/** A straight road going north (-Z) from (20, 26) to (20, 18), plus `placements`. */
async function setUpCity(page: Page, placements: unknown[] = []) {
  await page.evaluate((extra) => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState()
    const roads: string[] = []
    for (let z = 26; z >= 18; z--) roads.push(`20,${z}`)
    game.setCity({ size: 48, roads, placements: extra })
  }, placements)
}

async function startDriving(page: Page, source: string) {
  await page.getByTestId('menu-drive').click()
  await page.getByTestId(`veh-${source}`).click()
  await expect(page.getByTestId('mode-drive').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('drive-gas')).toBeVisible()
  await expect.poll(() => carState(page)).not.toBeNull()
  await page.waitForTimeout(500) // let the car settle on its wheels
}

/** Holds a pedal with the mouse for `ms`. */
async function hold(page: Page, testId: string, ms: number) {
  const box = (await page.getByTestId(testId).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
})

test('drive: pick the car and hold gas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await setUpCity(page)
  await startDriving(page, 'tpl:car')

  const start = (await carState(page))!
  // Spawns on the first road cell with road ahead, facing -Z.
  expect(start.x).toBeCloseTo(20.5 * CELL, 0)
  expect(start.z).toBeCloseTo(26.5 * CELL, 0)

  await hold(page, 'drive-gas', 1000)
  const after = (await carState(page))!
  expect(after.z).toBeLessThan(start.z - 3) // drove forward (-Z)
  expect(Math.abs(after.x - start.x)).toBeLessThan(1)
  expect(after.upY).toBeGreaterThan(0.95)
  await expect(page.getByTestId('mode-drive').locator('canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('drive: a building stops the car at full speed', async ({ page }) => {
  await setUpCity(page, [{ id: 'blocker', source: 'tpl:house_small', cx: 20, cz: 16, rot: 0 }])
  await startDriving(page, 'tpl:car')
  await hold(page, 'drive-gas', 5000)
  await page.waitForTimeout(500)
  const s = (await carState(page))!
  // Stopped south of the house (cells z >= 16): no tunnelling through it.
  expect(s.z).toBeGreaterThan(16 * CELL + 4)
  expect(Math.abs(s.speed)).toBeLessThan(1)
  expect(s.upY).toBeGreaterThan(0.95)
})

test('drive: the stick steers and the flip button rights the car', async ({ page }) => {
  await setUpCity(page)
  await startDriving(page, 'tpl:car')
  const start = (await carState(page))!

  // Right thumb on gas, left thumb pushes the stick right.
  const gas = (await page.getByTestId('drive-gas').boundingBox())!
  const stick = (await page.getByTestId('drive-joystick').boundingBox())!
  const g: [number, number] = [gas.x + gas.width / 2, gas.y + gas.height / 2]
  const s: [number, number] = [stick.x + stick.width / 2, stick.y + stick.height / 2]
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<[number, number]>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
  await touch('touchStart', [g])
  await page.waitForTimeout(600)
  await touch('touchStart', [g, s])
  await touch('touchMove', [g, [s[0] + 90, s[1]]])
  await page.waitForTimeout(1200)
  await touch('touchEnd', [])
  const turned = (await carState(page))!
  expect(turned.x).toBeGreaterThan(start.x + 2) // turned right (+X)

  // Tip it onto its roof, then flip it back.
  await page.evaluate(() => {
    const d = (window as unknown as BtWindow).__btDrive!
    d.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true)
    d.body.setTranslation({ x: d.x, y: 6, z: d.z }, true)
  })
  await expect.poll(async () => (await carState(page))!.upY, { timeout: 5000 }).toBeLessThan(-0.9)
  await page.getByTestId('drive-flip').click()
  await expect.poll(async () => (await carState(page))!.upY, { timeout: 5000 }).toBeGreaterThan(0.95)
  await page.waitForTimeout(1000)
  const flipped = (await carState(page))!
  expect(flipped.upY).toBeGreaterThan(0.95)
  expect(flipped.y).toBeGreaterThan(-0.3)
  expect(flipped.y).toBeLessThan(0.5)
})

test('drive: a vehicle blueprint without wheels cannot be picked', async ({ page }) => {
  await page.evaluate(() => {
    const now = Date.now()
    ;(window as unknown as BtWindow).__bt.useGame.getState().upsertBlueprint({
      id: 'e2e-nowheels',
      name: 'Box',
      kind: 'vehicle',
      tags: [],
      baseplate: { w: 8, d: 8 },
      bricks: [{ id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 }],
      createdAt: now,
      updatedAt: now,
    })
  })
  await page.getByTestId('menu-drive').click()
  const card = page.getByTestId('veh-e2e-nowheels')
  await expect(card).toBeDisabled()
  await expect(card.getByTestId('veh-needs-wheels')).toBeVisible()
  await expect(page.getByTestId('veh-tpl:car')).toBeEnabled()
})
