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
    useGuided: { getState(): { pending(): Array<{ id: string }>; placeGhost(id: string): boolean } }
    flushAutosave(): Promise<boolean>
  }
}

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

for (const difficulty of ['easy', 'normal'] as const) {
  test(`guided (${difficulty}): tapping the pulsing ghost places the first tree brick`, async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('main-menu')).toBeVisible()
    await page.evaluate((d) => (window as unknown as BtWindow).__bt.useApp.getState().setDifficulty(d), difficulty)
    await page.getByTestId('menu-guided').click()
    await page.getByTestId('tpl-tree').click()
    await expect(page.getByTestId('guided-canvas')).toBeVisible()
    if (difficulty === 'normal') await expect(page.getByTestId('part-brick_2x2')).toBeVisible()
    const view = page.viewportSize()
    if (!view) throw new Error('no viewport')
    // The tree trunk (2x2 at the centre of the 8x8 plate) sits in the middle of the view; the
    // first step's part and colour are pre-selected. Poll: the canvas may still be sizing itself.
    await expect
      .poll(async () => {
        await page.mouse.click(view.width / 2, view.height / 2)
        return placedCount(page)
      })
      .toBe(1)
  })
}
