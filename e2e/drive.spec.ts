import { expect, test, type Page, type Route } from '@playwright/test'

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

/**
 * Polls until the car is at rest: forward speed near zero and no vertical movement between two
 * samples (it has settled on its wheels, or has stopped against a wall).
 */
async function waitUntilStill(page: Page) {
  let last = await carState(page)
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(100)
        const now = await carState(page)
        const still = now !== null && last !== null && Math.abs(now.speed) < 0.2 && Math.abs(now.y - last.y) < 0.005
        last = now
        return still
      },
      { timeout: 10_000 },
    )
    .toBe(true)
}

async function startDriving(page: Page, source: string) {
  await page.getByTestId('menu-drive').click()
  await page.getByTestId(`veh-${source}`).click()
  await expect(page.getByTestId('mode-drive').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('drive-gas')).toBeVisible()
  await expect.poll(() => carState(page)).not.toBeNull()
  await waitUntilStill(page) // let the car settle on its wheels
}

/** Holds a pedal with the mouse for `ms`. */
async function hold(page: Page, testId: string, ms: number) {
  const box = (await page.getByTestId(testId).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

interface Finger {
  x: number
  y: number
  id: number
}

/**
 * Multi-touch through CDP: `touchStart` / `touchMove` list every finger on the screen, `touchEnd`
 * lists the fingers that lift (none = all of them).
 */
async function touchScreen(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: Finger[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
}

async function centerOf(page: Page, testId: string) {
  const box = (await page.getByTestId(testId).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const speedOf = async (page: Page) => (await carState(page))!.speed

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
  // StrictMode mounts effects twice in dev: still exactly one vehicle controller, built once.
  const status = page.getByTestId('drive-status')
  await expect(status).toHaveAttribute('data-controllers', '1')
  await expect(status).toHaveAttribute('data-builds', '1')
  await expect(page.getByTestId('mode-drive').locator('canvas')).toBeVisible()
  expect(errors).toEqual([])
})

test('drive: a building stops the car at full speed', async ({ page }) => {
  await setUpCity(page, [{ id: 'blocker', source: 'tpl:house_small', cx: 20, cz: 16, rot: 0 }])
  await startDriving(page, 'tpl:car')
  await hold(page, 'drive-gas', 5000)
  await waitUntilStill(page)
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
  await waitUntilStill(page)
  const flipped = (await carState(page))!
  expect(flipped.upY).toBeGreaterThan(0.95)
  expect(flipped.y).toBeGreaterThan(-0.3)
  expect(flipped.y).toBeLessThan(0.5)
})

test('drive: lifting one of two fingers on the gas keeps driving', async ({ page }) => {
  await setUpCity(page)
  await startDriving(page, 'tpl:car')
  const touch = await touchScreen(page)
  const g = await centerOf(page, 'drive-gas')
  const a = { ...g, id: 1 }
  const b = { x: g.x + 12, y: g.y + 12, id: 2 }
  await touch('touchStart', [a])
  await touch('touchStart', [a, b])
  await page.waitForTimeout(500)
  await touch('touchEnd', [a]) // finger a lifts, b still holds the pedal
  const atLift = await speedOf(page)
  await page.waitForTimeout(700)
  expect(await speedOf(page)).toBeGreaterThan(atLift + 1) // still accelerating
  await touch('touchEnd', [])
})

test('drive: flip fires on finger lift while the other thumb holds gas', async ({ page }) => {
  await setUpCity(page)
  await startDriving(page, 'tpl:car')
  await page.evaluate(() => {
    const d = (window as unknown as BtWindow).__btDrive!
    d.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true)
    d.body.setTranslation({ x: d.x, y: 6, z: d.z }, true)
  })
  await expect.poll(async () => (await carState(page))!.upY, { timeout: 5000 }).toBeLessThan(-0.9)

  const touch = await touchScreen(page)
  const gas = { ...(await centerOf(page, 'drive-gas')), id: 1 }
  const flip = { ...(await centerOf(page, 'drive-flip')), id: 2 }
  await touch('touchStart', [gas])
  await touch('touchStart', [gas, flip])
  await touch('touchEnd', [flip]) // the flip finger lifts (Chrome sends no click for it); gas stays held
  await expect.poll(async () => (await carState(page))!.upY, { timeout: 5000 }).toBeGreaterThan(0.95)
  await touch('touchEnd', [])
})

test('drive: switching away from the app lets go of the gas and the stick', async ({ page }) => {
  await setUpCity(page)
  await startDriving(page, 'tpl:car')
  const touch = await touchScreen(page)
  const gas = { ...(await centerOf(page, 'drive-gas')), id: 1 }

  // Gas held, then the window loses focus before the finger lifts (its pointerup never arrives).
  await touch('touchStart', [gas])
  await page.waitForTimeout(800)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  const atBlur = await speedOf(page)
  await page.waitForTimeout(1000)
  expect(await speedOf(page)).toBeLessThan(atBlur) // coasting, no longer driven
  await touch('touchEnd', []) // the lost finger finally lifts: changes nothing
  // A fresh press still drives.
  const before = await speedOf(page)
  await hold(page, 'drive-gas', 800)
  expect(await speedOf(page)).toBeGreaterThan(before + 3)

  // Stick pushed right, then the page is hidden (home button / app switcher).
  const joystick = page.getByTestId('drive-joystick')
  const s = await centerOf(page, 'drive-joystick')
  await touch('touchStart', [{ ...s, id: 3 }])
  await touch('touchMove', [{ x: s.x + 90, y: s.y, id: 3 }])
  await expect(joystick).toHaveAttribute('aria-valuenow', '1')
  const setVisibility = (state: string) =>
    page.evaluate((v) => {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  await setVisibility('hidden')
  await expect(joystick).toHaveAttribute('aria-valuenow', '0')
  await setVisibility('visible')
  // The stick takes a new thumb even though the old one never lifted.
  await touch('touchStart', [{ x: s.x + 90, y: s.y, id: 3 }, { ...s, id: 4 }])
  await touch('touchMove', [{ x: s.x + 90, y: s.y, id: 3 }, { x: s.x - 90, y: s.y, id: 4 }])
  await expect(joystick).toHaveAttribute('aria-valuenow', '-1')
  await touch('touchEnd', [])
})

test('drive: a scene that fails to load reloads once, then shows a friendly screen; home retries', async ({ page }) => {
  const block = (route: Route) => route.abort()
  await page.route('**/src/scenes/drive/DriveScene.tsx*', block)
  await page.getByTestId('menu-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  // Retried, then the app reloads itself once (a chunk that vanished after an update): back at the menu.
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('bricktown-chunk-reload'))).toBe('1')
  await expect(page.getByTestId('main-menu')).toBeVisible()

  // Still failing after the reload: no reload loop, the friendly error screen instead.
  await page.getByTestId('menu-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('scene-error')).toBeVisible()
  await expect(page.getByTestId('scene-error-reload')).toBeVisible()
  await page.getByTestId('scene-error-menu').click()
  await expect(page.getByTestId('main-menu')).toBeVisible()

  // The network is back: home forgot the failed load, so entering again works.
  await page.unroute('**/src/scenes/drive/DriveScene.tsx*', block)
  await page.getByTestId('menu-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('drive-gas')).toBeVisible()
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

const blueprint = (id: string, bricks: unknown[]) => {
  const now = Date.now()
  return { id, name: id, kind: 'vehicle', tags: [], baseplate: { w: 8, d: 16 }, bricks, createdAt: now, updatedAt: now }
}

test("drive: a kid's car with the wheels standing on its chassis plate drives", async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.evaluate(
    (bp) => (window as unknown as BtWindow).__bt.useGame.getState().upsertBlueprint(bp),
    blueprint('e2e-onplate', [
      { id: 'plate', p: 'plate_4x8', x: 0, y: 0, z: 0, r: 0, c: 8 },
      { id: 'w1', p: 'wheel_small', x: 0, y: 1, z: 0, r: 0, c: 1 },
      { id: 'w2', p: 'wheel_small', x: 3, y: 1, z: 0, r: 0, c: 1 },
      { id: 'w3', p: 'wheel_small', x: 0, y: 1, z: 6, r: 0, c: 1 },
      { id: 'w4', p: 'wheel_small', x: 3, y: 1, z: 6, r: 0, c: 1 },
      { id: 'seat', p: 'brick_2x4', x: 1, y: 1, z: 2, r: 0, c: 2 },
    ]),
  )
  await setUpCity(page)
  await startDriving(page, 'e2e-onplate')
  const start = (await carState(page))!
  await hold(page, 'drive-gas', 1000)
  const after = (await carState(page))!
  expect(after.z).toBeLessThan(start.z - 3) // drove forward (-Z)
  expect(after.upY).toBeGreaterThan(0.95)
  expect(errors).toEqual([])
})

test('drive: sideways wheels and wheels on top of a tall body get their own hints', async ({ page }) => {
  await page.evaluate(
    (bps) => bps.forEach((bp) => (window as unknown as BtWindow).__bt.useGame.getState().upsertBlueprint(bp)),
    [
      blueprint('e2e-sideways', [
        { id: 'w1', p: 'wheel_small', x: 0, y: 0, z: 0, r: 1, c: 1 },
        { id: 'w2', p: 'wheel_small', x: 0, y: 0, z: 6, r: 1, c: 1 },
        { id: 'plate', p: 'plate_4x8', x: 0, y: 5, z: 0, r: 0, c: 8 },
      ]),
      blueprint('e2e-ontop', [
        { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 1, c: 2 },
        { id: 'b', p: 'brick_2x4', x: 0, y: 0, z: 6, r: 1, c: 2 },
        { id: 'w1', p: 'wheel_small', x: 0, y: 3, z: 0, r: 0, c: 1 },
        { id: 'w2', p: 'wheel_small', x: 0, y: 3, z: 6, r: 0, c: 1 },
      ]),
    ],
  )
  await page.getByTestId('menu-drive').click()
  const sideways = page.getByTestId('veh-e2e-sideways')
  await expect(sideways).toBeDisabled()
  await expect(sideways.getByTestId('veh-turn-wheels')).toBeVisible()
  const onTop = page.getByTestId('veh-e2e-ontop')
  await expect(onTop).toBeDisabled()
  await expect(onTop.getByTestId('veh-wheels-low')).toBeVisible()
})

test('drive: a blueprint with an unknown part neither crashes the city nor the picker', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.evaluate(
    (bp) => (window as unknown as BtWindow).__bt.useGame.getState().upsertBlueprint(bp),
    { ...blueprint('e2e-future', [{ id: 'x', p: 'jetpack_9000', x: 0, y: 0, z: 0, r: 0, c: 1 }]), baseplate: { w: 8, d: 8 } },
  )
  await setUpCity(page, [{ id: 'future', source: 'e2e-future', cx: 22, cz: 22, rot: 0 }])
  await page.getByTestId('menu-drive').click()
  await expect(page.getByTestId('veh-e2e-future').getByTestId('veh-unknown-part')).toBeVisible()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('drive-gas')).toBeVisible()
  await expect.poll(() => carState(page)).not.toBeNull()
  await hold(page, 'drive-gas', 500)
  await expect(page.getByTestId('scene-error')).toHaveCount(0)
  expect(errors).toEqual([])
})
