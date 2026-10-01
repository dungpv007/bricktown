import { expect, test } from '@playwright/test'

/** Starts each test with exactly these localStorage flags set (works on whatever origin the config serves). */
const useFlags = (...names: string[]) => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test.beforeEach(({ page }) =>
    page.addInitScript((flagNames) => {
      for (const name of flagNames) if (!sessionStorage.getItem('seeded')) localStorage.setItem(name, '1')
      sessionStorage.setItem('seeded', '1')
    }, names),
  )
}

interface BtWindow {
  __bt: {
    useGame: { getState(): { data: { guided: { templateId: string; placed: string[] } | null } } }
    useGuided: { getState(): { pending(): Array<{ id: string }>; placeGhost(id: string): boolean } }
  }
}

test.describe('first launch', () => {
  useFlags('bricktown-install-hint-dismissed')

  test('onboarding walks through three cards and does not return', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('onboarding-card-0')).toBeVisible()
    await page.getByTestId('onboarding-next').click()
    await expect(page.getByTestId('onboarding-card-1')).toBeVisible()
    await page.getByTestId('onboarding-next').click()
    await expect(page.getByTestId('onboarding-card-2')).toBeVisible()
    await page.getByTestId('onboarding-done').click()
    await expect(page.getByTestId('onboarding')).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('main-menu')).toBeVisible()
    await expect(page.getByTestId('onboarding')).toBeHidden()
  })

  test('onboarding can be skipped and stays away', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('onboarding-skip').click()
    await expect(page.getByTestId('onboarding')).toBeHidden()
    await page.getByTestId('menu-workshop').click() // the menu is usable straight away
    await expect(page.getByTestId('mode-workshop')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('main-menu')).toBeVisible()
    await expect(page.getByTestId('onboarding')).toBeHidden()
  })
})

test('mute toggle persists across a reload', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByTestId('mute-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true') // sound on
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'false')
})

test.describe('install tip', () => {
  useFlags('bricktown-onboarded')

  test('shows on iOS in the browser and stays dismissed', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('install-hint')).toBeVisible() // the iPad profile reports an iPad user agent
    await page.getByTestId('install-hint-dismiss').click()
    await expect(page.getByTestId('install-hint')).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('main-menu')).toBeVisible()
    await expect(page.getByTestId('install-hint')).toBeHidden()
  })
})

test('guided picker asks before throwing away the build in progress', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-tree').click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  await page.evaluate(() => {
    const guided = (window as unknown as BtWindow).__bt.useGuided.getState()
    guided.placeGhost(guided.pending()[0].id)
  })
  const state = () =>
    page.evaluate(() => {
      const g = (window as unknown as BtWindow).__bt.useGame.getState().data.guided
      return g ? { id: g.templateId, placed: g.placed.length } : null
    })
  expect(await state()).toEqual({ id: 'tree', placed: 1 })

  await page.getByTestId('guided-list').click()
  await page.getByTestId('tpl-lamp').click()
  await expect(page.getByTestId('confirm-no')).toBeVisible()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('guided-picker')).toBeVisible()
  expect(await state()).toEqual({ id: 'tree', placed: 1 })

  await page.getByTestId('tpl-lamp').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
  expect(await state()).toEqual({ id: 'lamp', placed: 0 })
})

test('guided picker resumes the build in progress without asking', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-guided').click()
  await page.getByTestId('tpl-tree').click()
  await page.getByTestId('guided-list').click()
  await page.getByTestId('tpl-tree').click()
  await expect(page.getByTestId('confirm-yes')).toBeHidden()
  await expect(page.getByTestId('guided-canvas')).toBeVisible()
})

test('controls stay inside the safe area (notch, rounded corners, home indicator)', async ({ page }) => {
  const insets = { top: 20, left: 47, right: 47, bottom: 21 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets })
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  const view = page.viewportSize()!
  const inside = async (testId: string) => {
    const b = (await page.getByTestId(testId).boundingBox())!
    expect(b.x, testId).toBeGreaterThanOrEqual(insets.left)
    expect(b.y, testId).toBeGreaterThanOrEqual(insets.top)
    expect(b.x + b.width, testId).toBeLessThanOrEqual(view.width - insets.right)
    expect(b.y + b.height, testId).toBeLessThanOrEqual(view.height - insets.bottom)
  }

  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('workshop-canvas')).toBeVisible()
  for (const id of ['back', 'tool-place', 'new-model', 'undo']) await inside(id)
  const palette = (await page.locator('.bt-palette').boundingBox())!
  expect(palette.x).toBeGreaterThanOrEqual(insets.left)
  expect(palette.y + palette.height).toBeLessThanOrEqual(view.height - insets.bottom)
  await page.getByTestId('back').click()

  await page.getByTestId('menu-drive').click()
  await page.getByTestId('veh-tpl:car').click()
  await expect(page.getByTestId('drive-gas')).toBeVisible()
  for (const id of ['back', 'drive-joystick', 'drive-gas', 'drive-flip']) await inside(id)
})
