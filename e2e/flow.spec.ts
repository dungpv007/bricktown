import { expect, test, type Page } from '@playwright/test'

interface Saved {
  guided: unknown
  completedTemplates: string[]
  blueprints: Array<{ id: string; templateId?: string }>
  city: { roads: string[]; placements: Array<{ source: string }> }
}
interface BtWindow {
  __bt: {
    useApp: { getState(): { setDifficulty(d: 'easy' | 'normal'): void } }
    useGame: { getState(): { data: Saved } }
    useGuided: { getState(): { pending(): Array<{ id: string }>; placeGhost(id: string): boolean } }
    flushAutosave(): Promise<boolean>
  }
  __btDrive?: { x: number; z: number }
}

/** The saved slot as it is in IndexedDB right now (what a reload would load), or null. */
const savedData = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Saved | null>((resolve, reject) => {
        const open = indexedDB.open('bricktown')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result.transaction('slots').objectStore('slots').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            open.result.close()
            resolve((all.result[0]?.data as Saved | undefined) ?? null)
          }
        }
      }),
  )

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
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.getByTestId('city-tool-road').click()
  await page.mouse.move(cx - 120, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy, { steps: 8 })
  await page.mouse.move(cx + 120, cy, { steps: 8 })
  await page.mouse.up()
  expect((await liveData(page)).city.roads.length).toBeGreaterThan(3)
  await page.getByTestId(`src-${treeId}`).click()
  await page.mouse.click(cx, cy + 90)
  expect((await liveData(page)).city.placements.map((p) => p.source)).toEqual([treeId])

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
  await page.evaluate(() => (window as unknown as BtWindow).__bt.flushAutosave())
  await expect
    .poll(async () => {
      const d = await savedData(page)
      return d && {
        guided: d.guided,
        completed: d.completedTemplates.includes('tree'),
        blueprint: d.blueprints.some((b) => b.id === treeId),
        road: d.city.roads.length > 3,
        placed: d.city.placements.map((p) => p.source),
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
  expect(after.city.roads.length).toBeGreaterThan(3)
  expect(after.city.placements.map((p) => p.source)).toEqual([treeId])
  expect(errors).toEqual([])
})
