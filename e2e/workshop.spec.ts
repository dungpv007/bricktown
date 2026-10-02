import { expect, test, type Page } from '@playwright/test'
import { waitForCameraStill } from './support'

type Vec3 = [number, number, number]
interface Brick { id: string; p: string; x: number; y: number; z: number; r: number; c: number }
interface PxRect { left: number; top: number; right: number; bottom: number }

interface BtWindow {
  __bt: {
    useEditor: {
      getState(): {
        place(x: number, y: number, z: number): void
        setPart(id: string): void
        partId: string | null
        deselect(): void
        selectedId: string | null
        color: number
        canUndo: boolean
      }
    }
    useGame: { getState(): { data: { workshop: { bricks: Brick[] } } } }
    plateScreen: {
      bounds: PxRect | null
      project: ((p: Vec3) => { x: number; y: number }) | null
      cameraPose: (() => { target: number[]; distance: number; azimuth: number; polar: number }) | null
    }
  }
}

const bricks = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop.bricks)
const brickCount = async (page: Page) => (await bricks(page)).length
const selectedId = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().selectedId)

const openWorkshop = async (page: Page) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  // The canvas sizes itself and the camera fits the plate right after it appears.
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__bt.plateScreen.project !== null)).toBe(true)
  await waitForCameraStill(page)
}

/** Places `part` (default 2x4) at (x, y, z) through the store, then clears the selection it makes. */
const placeAt = (page: Page, x: number, y: number, z: number, part = 'brick_2x4') =>
  page.evaluate(
    ([px, py, pz, p]) => {
      const ed = (window as unknown as BtWindow).__bt.useEditor.getState()
      ed.setPart(p)
      ed.place(px, py, pz)
      ed.deselect()
    },
    [x, y, z, part] as const,
  )

/** Where world point `p` is on screen (client pixels). */
const screenOf = (page: Page, p: Vec3) =>
  page.evaluate((w) => (window as unknown as BtWindow).__bt.plateScreen.project!(w), p)

/** The middle of the top of a 2x4 (r = 0) at (x, 0, z): 2 studs along X, 4 along Z, 3 plates tall. */
const top2x4 = (x: number, z: number): Vec3 => [x + 1, 1.2, z + 2]

const plateBounds = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.plateScreen.bounds)

const cameraPose = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.plateScreen.cameraPose!())

/** One finger pressing at `from`, sliding to `to` in small steps, then lifting (CDP touch events). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) })
  await touch('touchStart', [from])
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }])
    await page.waitForTimeout(16)
  }
  await touch('touchEnd', [])
  await cdp.detach()
}

test('workshop: place a brick, then undo it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('undo')).toBeVisible()
  // Editing tools are not modes any more: only the actions for a selected brick.
  await expect(page.getByTestId('tool-place')).toHaveCount(0)
  await expect(page.getByTestId('action-bar')).toHaveCount(0)

  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  expect(await brickCount(page)).toBe(1)

  await page.getByTestId('undo').click()
  expect(await brickCount(page)).toBe(0)
  expect(errors).toEqual([])
})

test('workshop: tapping the baseplate places the current part and selects it', async ({ page }) => {
  await openWorkshop(page)
  const view = page.viewportSize()
  if (!view) throw new Error('no viewport')
  // The camera frames the baseplate centre in the middle of the view.
  await page.touchscreen.tap(view.width / 2, view.height / 2)
  await expect.poll(() => brickCount(page)).toBe(1)
  expect(await selectedId(page)).toBe((await bricks(page))[0].id)
  await expect(page.getByTestId('action-bar')).toBeVisible()
})

test('workshop: tap the selected part again to deselect; the plate then places nothing; a drag still places', async ({ page }) => {
  await openWorkshop(page)
  const view = page.viewportSize()
  if (!view) throw new Error('no viewport')
  const chip = page.getByTestId('part-brick_2x2')
  const partId = () => page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().partId)
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  expect(await partId()).toBeNull()
  await page.touchscreen.tap(view.width / 2, view.height / 2)
  await page.waitForTimeout(300)
  expect(await brickCount(page)).toBe(0)
  // A drag from the chip still places it (and selects the part again).
  const button = await chip.boundingBox()
  if (!button) throw new Error('no part button')
  const from = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
  await touchDrag(page, from, { x: view.width / 2, y: view.height / 2 }, 10)
  await expect.poll(() => brickCount(page)).toBe(1)
  expect(await partId()).toBe('brick_2x2')
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
})

test('workshop: a press that starts on the UI and ends over the plate never places', async ({ page }) => {
  await openWorkshop(page)
  // A tap on empty sky...
  await page.mouse.click(540, 140)
  // ...then a press on a palette button released over the baseplate must not place.
  const button = await page.getByTestId('rotate-current').boundingBox()
  if (!button) throw new Error('no rotate button')
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2)
  await page.mouse.down()
  await page.mouse.move(540, 420)
  await page.mouse.up()
  await waitForCameraStill(page)
  expect(await brickCount(page)).toBe(0)
})

test('workshop: tap a brick to select it, then rotate, duplicate, recolour, delete and deselect', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openWorkshop(page)
  await placeAt(page, 6, 0, 6)
  const [brick] = await bricks(page)
  await expect(page.getByTestId('action-bar')).toHaveCount(0)

  const at = await screenOf(page, top2x4(6, 6))
  await page.touchscreen.tap(at.x, at.y)
  await expect(page.getByTestId('action-bar')).toBeVisible()
  expect(await selectedId(page)).toBe(brick.id)
  // Tapping the selected brick again keeps it selected.
  await page.touchscreen.tap(at.x, at.y)
  expect(await selectedId(page)).toBe(brick.id)
  expect(await brickCount(page)).toBe(1)
  await page.screenshot({ path: 'test-results/w1-selected.png' })

  await page.getByTestId('act-rotate').tap()
  await expect.poll(async () => (await bricks(page))[0].r).toBe(1)

  await page.getByTestId('act-duplicate').tap()
  await expect.poll(() => brickCount(page)).toBe(2)
  const copy = (await bricks(page))[1]
  expect(copy).toMatchObject({ p: 'brick_2x4', x: 6, y: 3, z: 6, r: 1 }) // on top of the original
  expect(await selectedId(page)).toBe(copy.id)

  // 🎨 points at the colour column; a swatch then recolours the selected brick and becomes the
  // colour for new bricks too.
  await page.getByTestId('act-recolor').tap()
  await expect(page.locator('.bt-colors')).toHaveClass(/bt-colors-hint/)
  await page.getByTestId('color-1').tap()
  await expect.poll(async () => (await bricks(page))[1].c).toBe(1)
  expect((await bricks(page))[0].c).toBe(brick.c)
  expect(await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().color)).toBe(1)
  await expect(page.getByTestId('color-1')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('act-delete').tap()
  await expect.poll(() => brickCount(page)).toBe(1)
  await expect(page.getByTestId('action-bar')).toHaveCount(0)

  await page.touchscreen.tap(at.x, at.y)
  await expect(page.getByTestId('action-bar')).toBeVisible()
  await page.getByTestId('act-deselect').tap()
  await expect(page.getByTestId('action-bar')).toHaveCount(0)

  // A tap on the sky deselects too.
  await page.touchscreen.tap(at.x, at.y)
  await expect(page.getByTestId('action-bar')).toBeVisible()
  await page.touchscreen.tap(540, 130)
  await expect(page.getByTestId('action-bar')).toHaveCount(0)
  expect(await brickCount(page)).toBe(1)
  expect(errors).toEqual([])
})

test('workshop: a long still press on a brick selects it', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 6, 0, 6)
  const at = await screenOf(page, top2x4(6, 6))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 1 }] })
  await page.waitForTimeout(700)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await expect(page.getByTestId('action-bar')).toBeVisible()
  expect(await selectedId(page)).toBe((await bricks(page))[0].id)
  expect(await bricks(page)).toMatchObject([{ x: 6, y: 0, z: 6 }])
})

test('workshop: the selected brick stands out in the middle of a wall', async ({ page }) => {
  await openWorkshop(page)
  // A wall 4 bricks wide and 3 high: 2x4s turned to lie along X (4 studs), front face at z = 8.
  await page.evaluate(() => {
    const bt = (window as unknown as BtWindow).__bt
    ;(bt.useEditor as unknown as { setState(s: { rot: number }): void }).setState({ rot: 1 })
    const ed = bt.useEditor.getState()
    ed.setPart('brick_2x4')
    for (let y = 0; y < 9; y += 3) for (let x = 0; x < 16; x += 4) ed.place(x, y, 6)
    ed.deselect()
  })
  expect(await brickCount(page)).toBe(12)
  // Tap the front face of the second brick of the middle row.
  const at = await screenOf(page, [6, 1.8, 8.01])
  await page.touchscreen.tap(at.x, at.y)
  await expect(page.getByTestId('action-bar')).toBeVisible()
  const picked = await page.evaluate(() => {
    const bt = (window as unknown as BtWindow).__bt
    const id = bt.useEditor.getState().selectedId
    return bt.useGame.getState().data.workshop.bricks.find((b) => b.id === id) ?? null
  })
  expect(picked).toMatchObject({ x: 4, y: 3, z: 6 })
  await waitForCameraStill(page)
  await page.screenshot({ path: 'test-results/w1-selected-wall.png' })
})

test('workshop: keyboard acts on the selected brick', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 6, 0, 6)
  const at = await screenOf(page, top2x4(6, 6))
  await page.mouse.click(at.x, at.y)
  await expect(page.getByTestId('action-bar')).toBeVisible()
  await page.keyboard.press('r')
  await expect.poll(async () => (await bricks(page))[0].r).toBe(1)
  await page.keyboard.press('ControlOrMeta+d')
  await expect.poll(() => brickCount(page)).toBe(2)
  await page.keyboard.press('Delete')
  await expect.poll(() => brickCount(page)).toBe(1)
  await page.mouse.click(at.x, at.y)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('action-bar')).toHaveCount(0)
})

test('workshop: arrow keys move the selected brick one stud, space turns it, each as one undo step', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 6, 0, 6)
  const at = await screenOf(page, top2x4(6, 6))
  await page.mouse.click(at.x, at.y)
  await expect(page.getByTestId('action-bar')).toBeVisible()
  // The default view looks along -z: the right arrow is +x.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 8, y: 0, z: 6, r: 0 })
  // Up is away from the viewer (-z), down towards them.
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 8, z: 5 })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 8, z: 6, r: 1 })
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  // One undo step per key press, last first: the turn, the down, the up, then the second right.
  await page.getByTestId('undo').click()
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 8, z: 6, r: 0 })
  await page.getByTestId('undo').click()
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 8, z: 5 })
  await page.getByTestId('undo').click()
  await page.getByTestId('undo').click()
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 7, z: 6 })
  // Nothing selected: the keys do nothing.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('action-bar')).toHaveCount(0)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()) // not a focused button's own Space
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  expect((await bricks(page))[0]).toMatchObject({ x: 7, z: 6, r: 0 })
})

test('workshop: dragging a brick (touch) moves it, as one undo step, without turning the camera', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 2, 0, 2)
  const [brick] = await bricks(page)
  const before = await plateBounds(page)
  const from = await screenOf(page, top2x4(2, 2))
  // Onto the empty plate around cell (10, 10): a 2x4 lands at x = 10, z = 9.
  const to = await screenOf(page, [10.5, 0, 10.5])
  await touchDrag(page, from, to)
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ id: brick.id, x: 10, y: 0, z: 9 })
  expect(await brickCount(page)).toBe(1)
  expect(await selectedId(page)).toBe(brick.id)
  expect(await plateBounds(page)).toEqual(before)

  await page.getByTestId('undo').tap()
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 2, y: 0, z: 2 })
  await page.getByTestId('undo').tap()
  await expect.poll(() => brickCount(page)).toBe(0)
})

test('workshop: dragging a brick with the mouse moves it', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 2, 0, 2)
  const from = await screenOf(page, top2x4(2, 2))
  const to = await screenOf(page, [10.5, 0, 10.5])
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10)
  await page.mouse.up()
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 10, y: 0, z: 9 })
})

test('workshop: a mid-drag ghost follows the finger while the brick stays in the model', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 2, 0, 2)
  const from = await screenOf(page, top2x4(2, 2))
  const to = await screenOf(page, [10.5, 0, 10.5])
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) })
  await touch('touchStart', [from])
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 }])
    await page.waitForTimeout(16)
  }
  await waitForCameraStill(page)
  // Mid-drag the brick is still saved where it was: backgrounding the app now loses nothing.
  expect(await bricks(page)).toMatchObject([{ x: 2, y: 0, z: 2 }])
  await page.screenshot({ path: 'test-results/w1-mid-drag.png' })
  await touch('touchEnd', [])
  await cdp.detach()
  await expect.poll(async () => (await bricks(page))[0]).toMatchObject({ x: 10, z: 9 })
})

test('workshop: a second finger during a brick drag cancels the move and pinches the camera', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 2, 0, 2)
  const bounds = await plateBounds(page)
  const from = await screenOf(page, top2x4(2, 2))
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  await touch('touchStart', [{ ...from, id: 1 }])
  for (let i = 1; i <= 5; i++) {
    await touch('touchMove', [{ x: from.x + 20 * i, y: from.y + 10 * i, id: 1 }])
    await page.waitForTimeout(16)
  }
  const a = { x: from.x + 100, y: from.y + 50, id: 1 }
  const b = { x: from.x + 200, y: from.y + 50, id: 2 }
  await touch('touchStart', [a, b])
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [{ ...a, x: a.x - 20 * i }, { ...b, x: b.x + 20 * i }])
    await page.waitForTimeout(16)
  }
  await touch('touchEnd', [])
  await cdp.detach()
  await waitForCameraStill(page)
  expect(await bricks(page)).toMatchObject([{ x: 2, y: 0, z: 2 }])
  await expect(page.getByTestId('place-error')).toHaveCount(0)
  expect(await plateBounds(page)).not.toEqual(bounds)
})

test('workshop: an invalid drop keeps the brick where it was', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 2, 0, 2)
  const undoBefore = await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().canUndo)
  const from = await screenOf(page, top2x4(2, 2))
  // The last column of the plate: a 2-wide brick would stick out (out of bounds).
  const to = await screenOf(page, [15.5, 0, 8.5])
  await touchDrag(page, from, to)
  await expect(page.getByTestId('place-error')).toBeVisible()
  expect(await bricks(page)).toMatchObject([{ x: 2, y: 0, z: 2 }])
  expect(await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().canUndo)).toBe(undoBefore)
})

test('workshop: dragging on empty space slides the view (same angle) and leaves the bricks alone', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 2, 0, 2)
  const before = await bricks(page)
  const bounds = await plateBounds(page)
  const pose0 = await cameraPose(page)
  const from = await screenOf(page, [12.5, 0, 12.5])
  await touchDrag(page, from, { x: from.x - 200, y: from.y - 40 })
  await waitForCameraStill(page)
  expect(await bricks(page)).toEqual(before)
  expect(await plateBounds(page)).not.toEqual(bounds)
  const pose1 = await cameraPose(page)
  expect(Math.hypot(pose1.target[0] - pose0.target[0], pose1.target[2] - pose0.target[2])).toBeGreaterThan(2)
  expect(pose1.azimuth).toBeCloseTo(pose0.azimuth, 2)
  expect(pose1.polar).toBeCloseTo(pose0.polar, 2)
  expect(await selectedId(page)).toBeNull()
})

test('workshop: dragging a part from the palette onto a brick stacks it there', async ({ page }) => {
  await openWorkshop(page)
  await placeAt(page, 6, 0, 6)
  const button = await page.getByTestId('part-brick_2x2').boundingBox()
  if (!button) throw new Error('no part button')
  const from = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
  // Onto the top of the 2x4 (cells x 6..7, z 6..9): a 2x2 centred on cell (6, 7) lands at (6, 3, 7).
  const to = await screenOf(page, [6.5, 1.2, 7.5])

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) })
  await touch('touchStart', [from])
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }])
    await page.waitForTimeout(16)
  }
  await waitForCameraStill(page)
  await page.screenshot({ path: 'test-results/w1-palette-drag.png' })
  expect(await brickCount(page)).toBe(1) // nothing placed until the finger lifts
  await touch('touchEnd', [])
  await cdp.detach()

  await expect.poll(() => brickCount(page)).toBe(2)
  const added = (await bricks(page))[1]
  expect(added).toMatchObject({ p: 'brick_2x2', x: 6, y: 3, z: 7 })
  expect(await selectedId(page)).toBe(added.id)
})

test('workshop: a palette drag released over the palette or the sky places nothing', async ({ page }) => {
  await openWorkshop(page)
  const button = await page.getByTestId('part-brick_2x2').boundingBox()
  const tabs = await page.getByTestId('category-brick').boundingBox()
  if (!button || !tabs) throw new Error('no palette')
  const from = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
  await touchDrag(page, from, { x: from.x, y: tabs.y + tabs.height / 2 }, 6)
  await touchDrag(page, from, { x: 540, y: 130 }, 10)
  await waitForCameraStill(page)
  expect(await brickCount(page)).toBe(0)
  await expect(page.getByTestId('place-error')).toHaveCount(0)
})

test('workshop: a palette drag lifts the part under the finger, lands it on the plate, or flies it back', async ({ page }) => {
  await openWorkshop(page)
  const avatar = page.getByTestId('drag-avatar')
  await expect(avatar).toBeHidden()
  const button = await page.getByTestId('part-brick_2x2').boundingBox()
  if (!button) throw new Error('no part button')
  const from = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ ...p, id: 1 }] : [] })
  const slide = async (a: { x: number; y: number }, b: { x: number; y: number }, steps = 8) => {
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps })
      await page.waitForTimeout(16)
    }
  }

  // Lifted over the palette: the part floats above the finger.
  await touch('touchStart', from)
  // Upwards (sideways would scroll the row), still over the palette's category tabs.
  const overPalette = { x: from.x + 8, y: from.y - 40 }
  await slide(from, overPalette, 4)
  await expect(avatar).toBeVisible()
  await expect(avatar).toHaveAttribute('data-state', 'lifted')
  const box = await avatar.locator('.bt-drag-avatar-inner').boundingBox()
  expect(box!.y + box!.height).toBeLessThan(overPalette.y) // above the finger, not under it
  // Over the plate it turns into the ghost; released there, the brick lands and the avatar goes.
  const to = await screenOf(page, [8.5, 0, 8.5])
  await slide(overPalette, to, 10)
  await expect(avatar).toHaveAttribute('data-state', 'in-scene')
  await touch('touchEnd')
  await expect.poll(() => brickCount(page)).toBe(1)
  await expect(avatar).toBeHidden()

  // Released over the sky: nothing is placed and the part flies back to its chip, then hides.
  await touch('touchStart', from)
  await slide(from, { x: 540, y: 130 }, 10)
  await expect(avatar).toHaveAttribute('data-state', 'lifted')
  await touch('touchEnd')
  await cdp.detach()
  await expect(avatar).toBeHidden()
  await waitForCameraStill(page)
  expect(await brickCount(page)).toBe(1)
})

test('workshop: a palette drag cancelled by the system (pointercancel) places nothing', async ({ page }) => {
  await openWorkshop(page)
  const button = await page.getByTestId('part-brick_2x2').boundingBox()
  if (!button) throw new Error('no part button')
  const from = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
  const to = await screenOf(page, [8.5, 0, 8.5])
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchCancel', points: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) })
  await touch('touchStart', [from])
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 }])
    await page.waitForTimeout(16)
  }
  await touch('touchCancel', [])
  await cdp.detach()
  await waitForCameraStill(page)
  expect(await brickCount(page)).toBe(0)
  // Nothing is left half-dragged: a tap on the plate still quick-places.
  await page.touchscreen.tap(to.x, to.y)
  await expect.poll(() => brickCount(page)).toBe(1)
})

test('workshop: new model asks before wiping a build', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  expect(await brickCount(page)).toBe(1)

  await page.getByTestId('new-model').click()
  await page.getByTestId('new-model-building-large').click()
  await expect(page.getByTestId('new-model-confirm-step')).toBeVisible()
  expect(await brickCount(page)).toBe(1)
  await page.getByTestId('new-model-cancel').click()
  await expect(page.getByTestId('new-model-building-large')).toBeVisible()
  expect(await brickCount(page)).toBe(1)

  await page.getByTestId('new-model-building-large').click()
  await page.getByTestId('new-model-confirm').click()
  expect(await brickCount(page)).toBe(0)
  const plate = await page.evaluate(
    () => (window as unknown as { __bt: { useGame: { getState(): { data: { workshop: { baseplate: unknown } } } } } })
      .__bt.useGame.getState().data.workshop.baseplate,
  )
  expect(plate).toEqual({ w: 32, d: 32 })

  // An empty model is replaced straight away.
  await page.getByTestId('new-model').click()
  await page.getByTestId('new-model-vehicle').click()
  await expect(page.getByTestId('new-model-confirm-step')).toHaveCount(0)
})

/** A step-up in the middle of the model: a 2x4 at (6,0,6), a 2x2 at (8,0,6) with a plate on top of it (4 plates tall). */
const stepUp = async (page: Page) => {
  await placeAt(page, 6, 0, 6)
  await placeAt(page, 8, 0, 6, 'brick_2x2')
  await placeAt(page, 8, 3, 6, 'plate_2x2')
}

test('workshop: a part dragged from the palette onto occupied studs climbs on top instead of failing', async ({ page }) => {
  await openWorkshop(page)
  await stepUp(page)
  const button = await page.getByTestId('part-brick_2x2').boundingBox()
  if (!button) throw new Error('no part button')
  const from = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
  // The right edge of the 2x4's top: a 2x2 centred on cell (7, 7) at y = 3 would cut into the plate (x 8).
  const to = await screenOf(page, [7.5, 1.2, 7.5])

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) })
  await touch('touchStart', [from])
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }])
    await page.waitForTimeout(16)
  }
  await touch('touchEnd', [])
  await cdp.detach()

  await expect.poll(() => brickCount(page)).toBe(4)
  await expect(page.getByTestId('place-error')).toHaveCount(0)
  const added = (await bricks(page))[3]
  // Same x/z, one level above the plate it first collided with.
  expect(added).toMatchObject({ p: 'brick_2x2', x: 7, y: 4, z: 7 })
})

test('workshop: a brick moved onto occupied studs climbs on top instead of failing', async ({ page }) => {
  await openWorkshop(page)
  await stepUp(page)
  await placeAt(page, 2, 0, 2, 'brick_2x2')
  const mover = (await bricks(page))[3]
  const from = await screenOf(page, [3, 1.2, 3])
  const to = await screenOf(page, [7.5, 1.2, 7.5])
  await touchDrag(page, from, to)

  await expect.poll(async () => (await bricks(page)).find((b) => b.id === mover.id)?.y).toBe(4)
  await expect(page.getByTestId('place-error')).toHaveCount(0)
  expect((await bricks(page)).find((b) => b.id === mover.id)).toMatchObject({ x: 7, y: 4, z: 7 })
  expect(await brickCount(page)).toBe(4)
})

test('workshop: a 1x6 dragged from the palette over the gap between two supports bridges them', async ({ page }) => {
  await openWorkshop(page)
  // Two 2x2 supports 2 studs apart: a short one (3 plates) at x 4..5 and a tall one (6 plates) at x 8..9.
  await placeAt(page, 4, 0, 6, 'brick_2x2')
  await placeAt(page, 8, 0, 6, 'brick_2x2')
  await placeAt(page, 8, 3, 6, 'brick_2x2')
  // The 1x6 turned to lie along X.
  await page.evaluate(() =>
    ((window as unknown as BtWindow).__bt.useEditor as unknown as { setState(s: { rot: number }): void }).setState({ rot: 1 }),
  )
  const button = await page.getByTestId('part-brick_1x6').boundingBox()
  if (!button) throw new Error('no part button')
  const from = { x: button.x + button.width / 2, y: button.y + button.height / 2 }
  // Where the bridge goes: over the gap (cell x 6, row z 6) at the height of the tall support's top.
  const to = await screenOf(page, [6.5, 2.4, 6.5])

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) })
  await touch('touchStart', [from])
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }])
    await page.waitForTimeout(16)
  }
  await waitForCameraStill(page)
  await page.screenshot({ path: 'test-results/w1-bridge.png' })
  await touch('touchEnd', [])
  await cdp.detach()

  await expect.poll(() => brickCount(page)).toBe(4)
  await expect(page.getByTestId('place-error')).toHaveCount(0)
  // Centred on cell x 6: spans x 4..9 and rests on the tall support's top (y = 6), bridging the gap.
  expect((await bricks(page))[3]).toMatchObject({ p: 'brick_1x6', r: 1, x: 4, y: 6, z: 6 })
})

test.describe('workshop on a touch phone', () => {
  test.use({ viewport: { width: 412, height: 891 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })

  test('workshop: one finger pans, a pinch zooms, a twist turns and a side-by-side push tilts the camera', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openWorkshop(page)
    const centre = await screenOf(page, [12.5, 0, 12.5])
    const x = 206
    const y = Math.min(Math.max(centre.y, 300), 500)
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<[number, number]>) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([px, py], id) => ({ x: px, y: py, id })) })
    const settled = async () => {
      await waitForCameraStill(page)
      return cameraPose(page)
    }

    // One finger on the empty plate pans: the target moves, the angle stays.
    const start = await settled()
    await touch('touchStart', [[x, y]])
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[x + i * 8, y + i * 6]])
    await touch('touchEnd', [])
    const panned = await settled()
    expect(Math.hypot(panned.target[0] - start.target[0], panned.target[2] - start.target[2])).toBeGreaterThan(1)
    expect(panned.azimuth).toBeCloseTo(start.azimuth, 2)
    expect(panned.polar).toBeCloseTo(start.polar, 2)
    expect(panned.distance).toBeCloseTo(start.distance, 1)

    // Two fingers spreading zoom in.
    await touch('touchStart', [[x - 40, y]])
    await touch('touchStart', [[x - 40, y], [x + 40, y]])
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[x - 40 - i * 10, y], [x + 40 + i * 10, y]])
    await touch('touchEnd', [])
    const zoomed = await settled()
    expect(zoomed.distance).toBeLessThan(panned.distance - 1)

    // Two fingers twisting turn the view about the vertical.
    const r = 80
    await touch('touchStart', [[x - r, y]])
    await touch('touchStart', [[x - r, y], [x + r, y]])
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * (Math.PI / 3)
      await touch('touchMove', [[x - r * Math.cos(a), y - r * Math.sin(a)], [x + r * Math.cos(a), y + r * Math.sin(a)]])
    }
    await touch('touchEnd', [])
    const turned = await settled()
    expect(Math.abs(turned.azimuth - zoomed.azimuth)).toBeGreaterThan(0.5)

    // Two fingers side by side pushed up tilt the view (no zoom).
    await touch('touchStart', [[x - 60, y + 100]])
    await touch('touchStart', [[x - 60, y + 100], [x + 60, y + 100]])
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[x - 60, y + 100 - i * 8], [x + 60, y + 100 - i * 8]])
    await touch('touchEnd', [])
    const tilted = await settled()
    expect(tilted.polar).toBeGreaterThan(turned.polar + 0.1)
    expect(tilted.distance).toBeCloseTo(turned.distance, 0)
    expect(errors).toEqual([])
  })
})
