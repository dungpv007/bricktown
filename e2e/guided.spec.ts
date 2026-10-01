import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: {
    useApp: { getState(): { setDifficulty(d: 'easy' | 'normal'): void } }
    useGame: {
      getState(): {
        data: {
          guided: { templateId: string; step: number; placed: string[] } | null
          blueprints: Array<{ templateId?: string }>
          completedTemplates: string[]
          workshop: { bricks: unknown[] }
        }
      }
    }
    useGuided: {
      getState(): {
        pending(): Array<{ id: string; p: string; c: number; x: number; y: number; z: number }>
        placeGhost(id: string): boolean
        errorSeq: number
      }
    }
    plateScreen: { project: ((p: [number, number, number]) => { x: number; y: number }) | null }
    flushAutosave(): Promise<boolean>
  }
}

type Point = { x: number; y: number }

/** Easy mode: taps (via the store) every ghost of the current step; returns how many were placed. */
const placeCurrentStep = (page: Page) =>
  page.evaluate(() => {
    const guided = (window as unknown as BtWindow).__bt.useGuided.getState()
    return guided.pending().filter((b) => guided.placeGhost(b.id)).length
  })

const hasBuild = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.guided !== null)

test('guided: build the tree in easy mode and get a blueprint', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useApp.getState().setDifficulty('easy'))
  await page.getByTestId('menu-guided').click()
  await expect(page.getByTestId('guided-picker')).toBeVisible()
  await page.getByTestId('tpl-tree').click()

  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  await expect(page.getByTestId('step-counter')).toHaveText(/^1\/\d+$/)
  await expect(page.getByTestId('difficulty')).toHaveAttribute('data-value', 'easy')

  let steps = 0
  while (await hasBuild(page)) {
    expect(await placeCurrentStep(page)).toBeGreaterThan(0)
    expect(++steps).toBeLessThan(50)
  }

  await expect(page.getByTestId('celebration')).toBeVisible()
  const state = await page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data)
  expect(state.guided).toBeNull()
  expect(state.blueprints.some((b) => b.templateId === 'tree')).toBe(true)
  expect(state.completedTemplates).toContain('tree')
  expect(state.workshop.bricks).toEqual([])

  await page.getByTestId('celebrate-again').click()
  await expect(page.getByTestId('tpl-tree')).toContainText('✓')
  expect(errors).toEqual([])
})

test('guided: progress survives leaving and coming back', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-lamp').click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  await placeCurrentStep(page)
  await expect(page.getByTestId('step-counter')).toHaveText(/^2\//)

  await page.getByTestId('back').click()
  await page.getByTestId('menu-guided').click()
  await expect(page.getByTestId('step-counter')).toHaveText(/^2\//)
  await page.getByTestId('step-prev').click()
  await expect(page.getByTestId('step-counter')).toHaveText(/^1\//)

  // Saved with the slot: still there after a reload (autosave is debounced, so flush it now).
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__bt.flushAutosave())).toBe(true)
  await page.reload()
  await page.getByTestId('menu-guided').click()
  await expect(page.getByTestId('step-counter')).toHaveText(/^2\//)
})

test('guided: "free edit" opens the finished model in the workshop after confirming', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible() // slot loaded
  await page.evaluate(() => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState() as unknown as {
      data: { workshop: object }
      setWorkshop(w: object): void
    }
    game.setWorkshop({ ...game.data.workshop, bricks: [{ id: 'mine', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }] })
  })
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-tree').click()
  while (await hasBuild(page)) await placeCurrentStep(page)

  await page.getByTestId('celebrate-edit').click()
  await expect(page.getByTestId('confirm-dialog')).toBeVisible()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('confirm-dialog')).toBeHidden()
  await page.getByTestId('celebrate-edit').click()
  await page.getByTestId('confirm-yes').click()

  await expect(page.getByTestId('mode-workshop')).toBeVisible()
  const ws = await page.evaluate(() => {
    const d = (window as unknown as BtWindow).__bt.useGame.getState().data as unknown as {
      workshop: { bricks: unknown[]; editingBlueprintId?: string }
      blueprints: Array<{ id: string; templateId?: string; bricks: unknown[] }>
    }
    const bp = d.blueprints.find((b) => b.templateId === 'tree')
    return { count: d.workshop.bricks.length, editing: d.workshop.editingBlueprintId, bp: bp?.id, bpCount: bp?.bricks.length }
  })
  expect(ws.editing).toBe(ws.bp)
  expect(ws.count).toBe(ws.bpCount)
})

const placedCount = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.guided?.placed.length ?? -1)

test('guided (easy): tapping the pulsing ghost places the first tree brick', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useApp.getState().setDifficulty('easy'))
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-tree').click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  const view = page.viewportSize()
  if (!view) throw new Error('no viewport')
  // The tree trunk (2x2 at the centre of the 8x8 plate) sits in the middle of the view. Poll: the
  // canvas may still be sizing itself.
  await expect
    .poll(async () => {
      await page.mouse.click(view.width / 2, view.height / 2)
      return placedCount(page)
    })
    .toBe(1)
})

/** The first pending brick of the current step: its tray card key and a point inside it (world). */
const nextTarget = (page: Page) =>
  page.evaluate(() => {
    const b = (window as unknown as BtWindow).__bt.useGuided.getState().pending()[0]
    return { key: `${b.p}-${b.c}`, world: [b.x + 0.5, b.y * 0.4 + 0.2, b.z + 0.5] as [number, number, number] }
  })

const screenOf = (page: Page, p: [number, number, number]) =>
  page.evaluate((w) => (window as unknown as BtWindow).__bt.plateScreen.project!(w), p)

async function cardCenter(page: Page, key: string): Promise<Point> {
  const box = await page.getByTestId(`needed-${key}`).boundingBox()
  if (!box) throw new Error(`no card ${key}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * One finger dragging from `from` to `to` (CDP touch events): first straight up (a sideways start
 * would scroll the tray), then across. `beforeRelease` runs while the finger is still down.
 */
async function touchDrag(page: Page, from: Point, to: Point, beforeRelease?: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Point[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id: 1 })) })
  await touch('touchStart', [from])
  const up = { x: from.x, y: from.y - 40 }
  for (let i = 1; i <= 3; i++) {
    await touch('touchMove', [{ x: from.x, y: from.y - (40 * i) / 3 }])
    await page.waitForTimeout(16)
  }
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: up.x + ((to.x - up.x) * i) / 12, y: up.y + ((to.y - up.y) * i) / 12 }])
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(100)
  await beforeRelease?.()
  await touch('touchEnd', [])
  await cdp.detach()
}

async function openTemplate(page: Page, id: string, difficulty: 'easy' | 'normal') {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate((d) => (window as unknown as BtWindow).__bt.useApp.getState().setDifficulty(d), difficulty)
  await page.getByTestId('menu-guided').click()
  await page.getByTestId(`tpl-${id}`).click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__bt.plateScreen.project !== null)).toBe(true)
  await page.waitForTimeout(600) // the camera may still glide to the first step
}

test('guided (easy): the whole tree is built by dragging pieces from the tray onto the model', async ({ page }) => {
  test.setTimeout(60_000) // six touch drags with camera glides in between
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openTemplate(page, 'tree', 'easy')
  await expect(page.getByTestId('drag-hint')).toBeVisible()
  // The hand slides up from the card towards the ghost: catch it on its way.
  await page.waitForFunction(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.bt-drag-hint')!).transform)
    return m.f < -150 && Number(getComputedStyle(document.querySelector('.bt-drag-hint')!).opacity) > 0.9
  }, undefined, { polling: 16 })
  await page.screenshot({ path: 'test-results/g1-tray-hint.png' })

  let first = true
  for (let steps = 0; await hasBuild(page); steps++) {
    expect(steps).toBeLessThan(20)
    const before = await placedCount(page)
    const target = await nextTarget(page)
    // Near the ghost, not on it: the magnet pulls the piece in.
    const at = await screenOf(page, target.world)
    const to = { x: at.x + 12, y: at.y + 10 }
    await touchDrag(page, await cardCenter(page, target.key), to, async () => {
      if (!first) return
      await page.screenshot({ path: 'test-results/g1-mid-drag-snapped.png' })
    })
    if (first) await expect(page.getByTestId('drag-hint')).toHaveCount(0) // gone after the first drop
    first = false
    await expect.poll(() => placedCount(page).then((n) => (n === -1 ? Infinity : n))).toBeGreaterThan(before)
    await page.waitForTimeout(500) // let a new step's camera glide finish
  }
  await expect(page.getByTestId('celebration')).toBeVisible()
  const state = await page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data)
  expect(state.completedTemplates).toContain('tree')
  expect(errors).toEqual([])
})

test('guided (normal): a piece needs the right turn; ↻ turns it and the exact drop places it', async ({ page }) => {
  test.setTimeout(60_000)
  await openTemplate(page, 'bench', 'normal')
  await expect(page.getByTestId('needed-brick_1x2-9')).toContainText('×2')
  await page.screenshot({ path: 'test-results/g1-tray-normal.png' })
  // Step 1 (two 1x2 legs) is placed through the store; step 2 asks for a plate 2x4 turned once.
  await placeCurrentStep(page)
  await expect(page.getByTestId('step-counter')).toHaveText(/^2\//)
  await page.waitForTimeout(600)
  const target = await nextTarget(page)
  expect(target.key).toBe('plate_2x4-10')
  const to = await screenOf(page, target.world)

  // Unturned: rejected, nothing placed, back to the tray.
  await touchDrag(page, await cardCenter(page, target.key), to)
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__bt.useGuided.getState().errorSeq)).toBe(1)
  expect(await placedCount(page)).toBe(2)

  await page.getByTestId(`needed-${target.key}`).click()
  await page.getByTestId('guided-rotate').click()
  await touchDrag(page, await cardCenter(page, target.key), to, () => page.screenshot({ path: 'test-results/g1-normal-aim.png' }).then(() => undefined))
  await expect.poll(() => placedCount(page)).toBe(3)
})
