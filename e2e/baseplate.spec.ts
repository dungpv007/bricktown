import { expect, test, type Page } from '@playwright/test'
import { waitForCameraStill } from './support'

interface Workshop {
  kind: string
  baseplate: { w: number; d: number }
  bricks: Array<{ x: number; z: number }>
}

interface BtWindow {
  __bt: {
    useEditor: {
      getState(): {
        place(x: number, y: number, z: number): void
        newModel(kind: string, baseplate: { w: number; d: number }): void
      }
    }
    useGame: { getState(): { data: { workshop: Workshop } } }
    plateScreen: { bounds: { left: number; top: number; right: number; bottom: number } | null }
  }
}

const workshop = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop)

const openWorkshop = async (page: Page) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
}

const HUD = '.bt-toolbar, .bt-palette, .bt-colors, .bt-topright, .bt-topbar-title'

/**
 * Every ➕ / ➖ is at least 64px, fully on screen and clear of the HUD panels, and the plate itself
 * (its screen bounding box) is on screen and clear of the HUD too.
 */
async function expectClearOfHud(page: Page) {
  const { buttons, plate, hud, view } = await page.evaluate((hudSel) => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const canvas = document.querySelector('[data-testid="mode-workshop"] canvas')!.getBoundingClientRect()
    const b = (window as unknown as BtWindow).__bt.plateScreen.bounds
    return {
      buttons: [...document.querySelectorAll('.bt-plate-btn')].map((el) => ({ id: el.getAttribute('data-testid') ?? '', ...box(el) })),
      plate: b && { id: 'plate', x: canvas.x + b.left, y: canvas.y + b.top, width: b.right - b.left, height: b.bottom - b.top },
      hud: [...document.querySelectorAll(hudSel)].map(box),
      view: { width: window.innerWidth, height: window.innerHeight },
    }
  }, HUD)
  expect(buttons.length).toBeGreaterThan(0)
  if (!plate) throw new Error('plate not drawn yet')
  for (const b of [...buttons, plate]) {
    if (b.id !== 'plate') {
      expect(b.width, b.id).toBeGreaterThanOrEqual(64)
      expect(b.height, b.id).toBeGreaterThanOrEqual(64)
    }
    expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= view.width && b.y + b.height <= view.height, `${b.id} off screen`).toBe(true)
    for (const h of hud) {
      const overlaps = b.x < h.x + h.width && h.x < b.x + b.width && b.y < h.y + h.height && h.y < b.y + b.height
      expect(overlaps, `${b.id} overlaps HUD`).toBe(false)
    }
  }
}

/** Positions follow the camera frame by frame (and glide after a resize): retry until they settle. */
const expectSettledClearOfHud = (page: Page) => expect(() => expectClearOfHud(page)).toPass({ timeout: 10_000 })

test('baseplate: ➕ on the W edge grows the plate and keeps the brick on its studs; undo restores', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openWorkshop(page)
  expect(await workshop(page)).toMatchObject({ kind: 'building', baseplate: { w: 16, d: 16 } })

  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  await page.getByTestId('plate-grow-W').tap()
  let ws = await workshop(page)
  expect(ws.baseplate).toEqual({ w: 24, d: 16 })
  expect(ws.bricks).toHaveLength(1)
  expect(ws.bricks[0].x).toBe(8)
  // Pressing the button must not also place a brick on the plate behind it.
  await waitForCameraStill(page)
  expect((await workshop(page)).bricks).toHaveLength(1)

  await page.getByTestId('undo').tap()
  ws = await workshop(page)
  expect(ws.baseplate).toEqual({ w: 16, d: 16 })
  expect(ws.bricks[0].x).toBe(0)

  await page.getByTestId('redo').tap()
  expect((await workshop(page)).baseplate).toEqual({ w: 24, d: 16 })
  expect(errors).toEqual([])
})

test('baseplate: ➖ shows only on edges whose strip has no bricks', async ({ page }) => {
  await openWorkshop(page)
  // Empty 16×16: every edge can shrink.
  for (const side of ['N', 'E', 'S', 'W']) await expect(page.getByTestId(`plate-shrink-${side}`)).toBeVisible()

  // A 2×4 in the N/W corner fills part of the N and W strips.
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  await expect(page.getByTestId('plate-shrink-W')).toHaveCount(0)
  await expect(page.getByTestId('plate-shrink-N')).toHaveCount(0)
  await expect(page.getByTestId('plate-shrink-E')).toBeVisible()
  await expect(page.getByTestId('plate-shrink-S')).toBeVisible()

  await page.getByTestId('plate-shrink-E').tap()
  expect((await workshop(page)).baseplate).toEqual({ w: 8, d: 16 })
  // At the minimum width neither side of that axis can shrink any more.
  await expect(page.getByTestId('plate-shrink-E')).toHaveCount(0)
  await expect(page.getByTestId('plate-shrink-S')).toBeVisible()
})

test('baseplate: guided build has no resize buttons', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-tree').click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  await expect(page.getByTestId('step-counter')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.locator('[data-testid^="plate-grow-"]')).toHaveCount(0)
})

test('baseplate: buttons frame every starting plate on an iPad, clear of the HUD', async ({ page }, info) => {
  await openWorkshop(page)
  await expect(page.getByTestId('plate-grow-W')).toBeVisible()
  await expectSettledClearOfHud(page)
  await page.screenshot({ path: info.outputPath('baseplate-ipad-16.png') })

  for (const [kind, w, d] of [['prop', 8, 8], ['vehicle', 8, 16], ['building', 32, 32]] as const) {
    await page.evaluate(
      ([k, pw, pd]) => (window as unknown as BtWindow).__bt.useEditor.getState().newModel(k, { w: pw, d: pd }),
      [kind, w, d] as const,
    )
    await expectSettledClearOfHud(page)
    await page.screenshot({ path: info.outputPath(`baseplate-ipad-${kind}-${w}x${d}.png`) })
  }
})

test('baseplate: a 48×48 plate on a wide screen is framed clear of the HUD, with only ➖ buttons', async ({ page }, info) => {
  await page.setViewportSize({ width: 2000, height: 960 })
  await openWorkshop(page)
  await page.evaluate(() =>
    (window as unknown as BtWindow).__bt.useEditor.getState().newModel('building', { w: 48, d: 48 }),
  )
  await expect(page.getByTestId('plate-shrink-W')).toBeVisible()
  await expect(page.locator('[data-testid^="plate-grow-"]')).toHaveCount(0)
  await expectSettledClearOfHud(page)
  await page.screenshot({ path: info.outputPath('baseplate-wide-48.png') })
})

test('baseplate: growing toward the camera keeps the plate and every button reachable', async ({ page }, info) => {
  test.setTimeout(90_000) // six resizes, each waiting for the camera to settle
  await openWorkshop(page)
  await expectSettledClearOfHud(page)
  let expected = { w: 16, d: 16 }
  for (const side of ['S', 'S', 'E', 'E', 'S', 'E'] as const) {
    await page.getByTestId(`plate-grow-${side}`).tap()
    expected = side === 'S' ? { ...expected, d: expected.d + 8 } : { ...expected, w: expected.w + 8 }
    expect((await workshop(page)).baseplate).toEqual(expected)
    await expectSettledClearOfHud(page)
    await page.screenshot({ path: info.outputPath(`baseplate-ipad-grown-${expected.w}x${expected.d}.png`) })
  }
})

test('baseplate: rotating the tablet re-frames a fully shown plate for the new screen', async ({ page }, info) => {
  await openWorkshop(page)
  await expectSettledClearOfHud(page)
  const plateWidth = () => page.evaluate(() => {
    const b = (window as unknown as BtWindow).__bt.plateScreen.bounds
    return b ? b.right - b.left : 0
  })
  const landscape = await plateWidth()

  await page.setViewportSize({ width: 810, height: 1080 }) // portrait
  await expectSettledClearOfHud(page)
  await page.screenshot({ path: info.outputPath('baseplate-portrait.png') })

  await page.setViewportSize({ width: 1080, height: 810 }) // and back
  await expectSettledClearOfHud(page)
  // Framed again for the wide screen, not left at the narrower portrait size.
  await expect.poll(plateWidth, { timeout: 10_000 }).toBeGreaterThan(landscape * 0.9)
})
