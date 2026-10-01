import { expect, test, type Page } from '@playwright/test'

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
  }
}

const workshop = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop)

const openWorkshop = async (page: Page) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
}

/** Every ➕ / ➖ must be at least 64px, fully on screen and clear of the HUD panels. */
async function expectButtonsClearOfHud(page: Page) {
  const { buttons, hud, view } = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const hudSel = '.bt-toolbar, .bt-palette, .bt-colors, .bt-topright, .bt-topbar-title'
    return {
      buttons: [...document.querySelectorAll('.bt-plate-btn')].map((el) => ({ id: el.getAttribute('data-testid'), ...box(el) })),
      hud: [...document.querySelectorAll(hudSel)].map(box),
      view: { width: window.innerWidth, height: window.innerHeight },
    }
  })
  expect(buttons.length).toBeGreaterThan(0)
  for (const b of buttons) {
    expect(b.width, b.id ?? '').toBeGreaterThanOrEqual(64)
    expect(b.height, b.id ?? '').toBeGreaterThanOrEqual(64)
    expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= view.width && b.y + b.height <= view.height, `${b.id} off screen`).toBe(true)
    for (const h of hud) {
      const overlaps = b.x < h.x + h.width && h.x < b.x + b.width && b.y < h.y + h.height && h.y < b.y + b.height
      expect(overlaps, `${b.id} overlaps HUD`).toBe(false)
    }
  }
}

test('baseplate: ➕ on the W edge grows the plate and keeps the brick on its studs; undo restores', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openWorkshop(page)
  expect(await workshop(page)).toMatchObject({ kind: 'building', baseplate: { w: 16, d: 16 } })

  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(0, 0, 0))
  await page.getByTestId('plate-grow-W').click()
  let ws = await workshop(page)
  expect(ws.baseplate).toEqual({ w: 24, d: 16 })
  expect(ws.bricks).toHaveLength(1)
  expect(ws.bricks[0].x).toBe(8)
  // Pressing the button must not also place a brick on the plate behind it.
  await page.waitForTimeout(200)
  expect((await workshop(page)).bricks).toHaveLength(1)

  await page.getByTestId('undo').click()
  ws = await workshop(page)
  expect(ws.baseplate).toEqual({ w: 16, d: 16 })
  expect(ws.bricks[0].x).toBe(0)

  await page.getByTestId('redo').click()
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

  await page.getByTestId('plate-shrink-E').click()
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
  await expect(() => expectButtonsClearOfHud(page)).toPass({ timeout: 10_000 })
  await page.screenshot({ path: info.outputPath('baseplate-ipad-16.png') })

  for (const [kind, w, d] of [['prop', 8, 8], ['vehicle', 8, 16], ['building', 32, 32]] as const) {
    await page.evaluate(
      ([k, pw, pd]) => (window as unknown as BtWindow).__bt.useEditor.getState().newModel(k, { w: pw, d: pd }),
      [kind, w, d] as const,
    )
    // Positions follow the camera frame by frame: retry until they settle.
    await expect(() => expectButtonsClearOfHud(page)).toPass({ timeout: 10_000 })
    await page.screenshot({ path: info.outputPath(`baseplate-ipad-${kind}-${w}x${d}.png`) })
  }
})

test('baseplate: a 48×48 plate on a wide screen shows only ➖ buttons, all on screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 2000, height: 960 })
  await openWorkshop(page)
  await page.evaluate(() =>
    (window as unknown as BtWindow).__bt.useEditor.getState().newModel('building', { w: 48, d: 48 }),
  )
  await expect(page.getByTestId('plate-shrink-W')).toBeVisible()
  await expect(page.locator('[data-testid^="plate-grow-"]')).toHaveCount(0)
  await expect(() => expectButtonsClearOfHud(page)).toPass({ timeout: 10_000 })
  await page.screenshot({ path: info.outputPath('baseplate-wide-48.png') })
})
