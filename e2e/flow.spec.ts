import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedCity, savedSlotData, sizedBox, type SavedCities } from './support'

interface Saved extends SavedCities<{ roads: string[]; placements: Array<{ source: string }> }> {
  guided: unknown
  completedTemplates: string[]
  blueprints: Array<{ id: string; templateId?: string }>
}
interface BtWindow {
  __bt: {
    useApp: { getState(): { setDifficulty(d: 'easy' | 'normal'): void } }
    useGame: { getState(): { data: Saved } }
    useGuided: { getState(): { pending(): Array<{ id: string }>; placeGhost(id: string): boolean } }
  }
  __btDrive?: { x: number; z: number }
}

const liveData = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data)

test('whole journey: build a tree, place it on a road in the city, drive, reload and find it all saved', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useApp.getState().setDifficulty('easy'))

  // Guided: build the tree to the end (easy mode: every ghost of a step is tapped through the store).
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-tree').click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  for (let steps = 0; (await liveData(page)).guided !== null; steps++) {
    expect(steps).toBeLessThan(50)
    const placed = await page.evaluate(() => {
      const guided = (window as unknown as BtWindow).__bt.useGuided.getState()
      return guided.pending().filter((b) => guided.placeGhost(b.id)).length
    })
    expect(placed).toBeGreaterThan(0)
  }
  await expect(page.getByTestId('celebration')).toBeVisible()
  const treeId = (await liveData(page)).blueprints.find((b) => b.templateId === 'tree')?.id
  expect(treeId).toBeTruthy()

  // City: paint a road across the middle, then place the new blueprint below it.
  await page.getByTestId('back').click()
  await page.getByTestId('menu-city').click()
  const canvas = page.getByTestId('mode-city').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = await sizedBox(canvas)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.getByTestId('city-road-mode').click()
  // The canvas may still be sizing itself right after it appears: repeat the (idempotent) drag until it paints.
  await expect
    .poll(async () => {
      await page.mouse.move(cx - 120, cy)
      await page.mouse.down()
      await page.mouse.move(cx, cy, { steps: 8 })
      await page.mouse.move(cx + 120, cy, { steps: 8 })
      await page.mouse.up()
      return savedCity(await liveData(page))!.roads.length
    })
    .toBeGreaterThan(3)
  await page.getByTestId('city-road-mode').click() // back to selecting and placing
  await page.getByTestId(`src-${treeId}`).click()
  await expect
    .poll(async () => {
      if (savedCity(await liveData(page))!.placements.length === 0) await page.mouse.click(cx, cy + 90)
      return savedCity(await liveData(page))!.placements.map((p) => p.source)
    })
    .toEqual([treeId])

  // Drive: the tree is not a vehicle; take the car and hold gas until it has moved.
  await page.getByTestId('back').click()
  await page.getByTestId('menu-drive').click()
  await expect(page.getByTestId(`veh-${treeId}`)).toHaveCount(0)
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('drive-gas')).toBeVisible()
  const carPos = () => page.evaluate(() => (window as unknown as BtWindow).__btDrive ?? null)
  await expect.poll(carPos).not.toBeNull()
  const start = (await carPos())!
  const gas = (await page.getByTestId('drive-gas').boundingBox())!
  await page.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2)
  await page.mouse.down()
  await expect
    .poll(async () => {
      const p = (await carPos())!
      return Math.hypot(p.x - start.x, p.z - start.z)
    })
    .toBeGreaterThan(3)
  await page.mouse.up()

  // Everything reached IndexedDB (not just memory)...
  await flushAutosave(page)
  await expect
    .poll(async () => {
      const d = await savedSlotData<Saved>(page)
      return d && {
        guided: d.guided,
        completed: d.completedTemplates.includes('tree'),
        blueprint: d.blueprints.some((b) => b.id === treeId),
        road: savedCity(d)!.roads.length > 3,
        placed: savedCity(d)!.placements.map((p) => p.source),
      }
    })
    .toEqual({ guided: null, completed: true, blueprint: true, road: true, placed: [treeId] })

  // ...and a reload brings it all back.
  await page.reload()
  await expect(page.getByTestId('main-menu')).toBeVisible()
  const after = await liveData(page)
  expect(after.guided).toBeNull()
  expect(after.completedTemplates).toContain('tree')
  expect(after.blueprints.some((b) => b.id === treeId && b.templateId === 'tree')).toBe(true)
  expect(savedCity(after)!.roads.length).toBeGreaterThan(3)
  expect(savedCity(after)!.placements.map((p) => p.source)).toEqual([treeId])
  expect(errors).toEqual([])
})
