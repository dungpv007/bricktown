import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: {
    usePersistStatus: { getState(): { set(s: { error: 'load' | 'save' | null; writeBlocked?: boolean }): void } }
    useGame: { getState(): { data: { workshop: object; guided: object | null }; setWorkshop(w: object): void } }
    useGuided: { getState(): { pending(): Array<{ id: string }>; placeGhost(id: string): boolean } }
  }
}

const setPersistError = (page: Page, error: 'load' | 'save' | null) =>
  page.evaluate((e) => (window as unknown as BtWindow).__bt.usePersistStatus.getState().set({ error: e }), error)

test('a failing save shows ⚠️ in the top bar of every scene, with a way to export a backup', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop')).toBeVisible()
  await expect(page.getByTestId('save-warning')).toBeHidden()

  await setPersistError(page, 'save')
  await expect(page.getByTestId('save-warning')).toBeVisible()
  await page.getByTestId('save-warning').click()
  const help = page.getByTestId('save-warning-help')
  await expect(help).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('save-warning-help.png') })
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-warning-export').click()])
  expect(download.suggestedFilename()).toMatch(/^bricktown-slot1-\d{4}-\d{2}-\d{2}\.json$/)
  await page.getByTestId('save-warning-close').click()
  await expect(help).toBeHidden()

  for (const mode of ['guided', 'city', 'drive']) {
    await page.getByTestId('back').click()
    await page.getByTestId(`menu-${mode}`).click()
    await expect(page.getByTestId(`mode-${mode}`)).toBeVisible()
    await expect(page.getByTestId('save-warning')).toBeVisible()
  }

  await setPersistError(page, null) // saving works again
  await expect(page.getByTestId('save-warning')).toBeHidden()
})

test('an unreadable slot can be downloaded from its backup in the slot menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('bricktown')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('slots', 'readwrite')
          tx.objectStore('slots').put({ id: 1, name: 'Slot 1', updatedAt: 1, data: { nonsense: true } })
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.reload() // loading the unreadable slot backs it up
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('settings').click()
  const button = page.getByTestId(/^download-backup-\d+$/)
  await expect(button).toHaveCount(1)
  // Keep the downloaded blob so its contents can be read back (e2e has no file system types).
  await page.evaluate(() => {
    const w = window as unknown as { __lastBlob?: Blob }
    const create = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      if (blob instanceof Blob) w.__lastBlob = blob
      return create(blob)
    }
  })
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  expect(download.suggestedFilename()).toMatch(/^bricktown-slot1-backup\d+\.json$/)
  const saved = JSON.parse(await page.evaluate(() => (window as unknown as { __lastBlob: Blob }).__lastBlob.text()))
  expect(saved).toMatchObject({ id: 1, data: { nonsense: true } })
})

test('the celebration question covers the whole screen: tapping outside the card answers "no"', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.evaluate(() => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState()
    game.setWorkshop({ ...game.data.workshop, bricks: [{ id: 'mine', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 0 }] })
  })
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-tree').click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  const finished = await page.evaluate(() => {
    const bt = (window as unknown as BtWindow).__bt
    for (let step = 0; step < 50 && bt.useGame.getState().data.guided; step++) {
      const guided = bt.useGuided.getState()
      for (const b of guided.pending()) guided.placeGhost(b.id)
    }
    return bt.useGame.getState().data.guided === null
  })
  expect(finished).toBe(true)
  await expect(page.getByTestId('celebration')).toBeVisible()

  await page.getByTestId('celebrate-edit').click()
  await expect(page.getByTestId('confirm-dialog')).toBeVisible()
  const view = page.viewportSize()!
  const backdrop = await page.locator('.bt-ask-backdrop').boundingBox()
  expect(backdrop).toEqual({ x: 0, y: 0, width: view.width, height: view.height })
  await page.screenshot({ path: test.info().outputPath('celebration-confirm.png') })

  await page.mouse.click(view.width - 10, view.height / 2) // far outside the card
  await expect(page.getByTestId('confirm-dialog')).toBeHidden()
  await expect(page.getByTestId('celebration')).toBeVisible()
  await expect(page.getByTestId('mode-guided')).toBeVisible()
})
