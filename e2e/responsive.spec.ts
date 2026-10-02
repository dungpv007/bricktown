import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: {
    useEditor: { getState(): { place(x: number, y: number, z: number): void } }
    useApp: { getState(): { setDifficulty(d: 'easy' | 'normal'): void } }
    useGame: { getState(): { setCity(city: unknown): void; upsertBlueprint(bp: unknown): void } }
    useCityEditor: { getState(): { selectPlacement(id: string | null): void } }
  }
}

interface Box { name: string; x: number; y: number; w: number; h: number }

/**
 * The HUD on screen now: every visible control (buttons, the title, chips, the stick...), each
 * standing for the scrolling strip it sits in if any (a palette row, the colour column: their
 * content runs past the screen on purpose). In a scrolling page (a picker) a control counts as
 * far as it shows. Returns pairs of them that overlap, and those not fully on screen.
 */
async function hudProblems(page: Page): Promise<{ overlaps: string[]; offscreen: string[] }> {
  return page.evaluate(() => {
    const CONTROLS =
      'button, [role="status"], .bt-topbar-title, .bt-maze-chip, .bt-step-counter, .bt-maze-name, .bt-joystick, .bt-tray-title'
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false
      }
      return true
    }
    const scroller = (el: Element): Element | null => {
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) && e.scrollWidth + e.scrollHeight > e.clientWidth + e.clientHeight)
          return e
      }
      return null
    }
    const label = (el: Element) =>
      el.getAttribute('data-testid') ?? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`
    const boxes: Array<Box & { el: Element }> = []
    const strips = new Set<Element>()
    for (const el of document.querySelectorAll(CONTROLS)) {
      if (!visible(el)) continue
      const s = scroller(el)
      const sr = s?.getBoundingClientRect()
      if (s && sr && sr.width * sr.height < 0.5 * innerWidth * innerHeight) {
        strips.add(s)
        continue
      }
      const r = el.getBoundingClientRect()
      const left = Math.max(r.left, sr?.left ?? -Infinity)
      const top = Math.max(r.top, sr?.top ?? -Infinity)
      const right = Math.min(r.right, sr?.right ?? Infinity)
      const bottom = Math.min(r.bottom, sr?.bottom ?? Infinity)
      if (right - left < 1 || bottom - top < 1) continue // scrolled out of its page
      boxes.push({ el, name: label(el), x: left, y: top, w: right - left, h: bottom - top })
    }
    for (const el of strips) {
      const r = el.getBoundingClientRect()
      boxes.push({ el, name: label(el), x: r.x, y: r.y, w: r.width, h: r.height })
    }
    const overlaps: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (ix > 1 && iy > 1) overlaps.push(`${a.name} × ${b.name}`)
      }
    }
    // A hidden title must be one TopBar hid on purpose (no room), not one lost some other way.
    const title = document.querySelector('[data-testid="mode-title"]')
    if (title && !visible(title) && title.getAttribute('data-squeezed') !== 'true') overlaps.push('mode-title hidden but not squeezed')
    const offscreen = boxes
      .filter((b: Box) => b.x < -1 || b.y < -1 || b.x + b.w > innerWidth + 1 || b.y + b.h > innerHeight + 1)
      .map((b) => b.name)
    return { overlaps, offscreen }
  })
}

/** Samples taken per check; a layout that flips between frames fails at least one of them. */
const SAMPLES = 6

/**
 * The HUD is tidy now and stays tidy: several samples a few frames apart (with a window resize
 * event in the middle, which makes the measuring components look again) must all be clean.
 * Lazy screens, folding and measuring may take a moment to settle first.
 */
async function expectTidy(page: Page, screen: string) {
  const samples = async () => {
    const seen: string[] = []
    for (let i = 0; i < SAMPLES; i++) {
      if (i === SAMPLES / 2) await page.evaluate(() => window.dispatchEvent(new Event('resize')))
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      await page.waitForTimeout(60)
      const { overlaps, offscreen } = await hudProblems(page)
      seen.push(...overlaps, ...offscreen.map((n) => `${n} off screen`))
    }
    return [...new Set(seen)]
  }
  await expect.poll(samples, { message: `${screen}: HUD overlaps or leaves the screen`, timeout: 20_000 }).toEqual([])
}

const devHandle = (page: Page) => page.waitForFunction(() => (window as unknown as { __bt?: unknown }).__bt !== undefined)

/** The main menu's settings row sits on one line: every button of it has (about) the same top edge. */
async function expectMenuRowOneLine(page: Page) {
  const tops = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="music-toggle"]')?.parentElement
    return [...(row?.querySelectorAll('button') ?? [])].map((b) => ({
      id: b.getAttribute('data-testid'),
      top: Math.round(b.getBoundingClientRect().top),
      right: Math.round(b.getBoundingClientRect().right),
    }))
  })
  expect(tops.map((t) => t.id)).toContain('audio-settings')
  expect(Math.max(...tops.map((t) => t.top)) - Math.min(...tops.map((t) => t.top)), `menu row wraps: ${JSON.stringify(tops)}`).toBeLessThanOrEqual(2)
}

/** The Sound dialog is open: its panel is on screen, nothing in it overlaps, and the sliders are fat enough to grab. */
async function expectAudioDialogFits(page: Page) {
  const r = await page.evaluate(() => {
    const box = (el: Element) => {
      const b = el.getBoundingClientRect()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    }
    const panel = document.querySelector('[data-testid="audio-settings-dialog"] .bt-panel')
    if (!panel) return null
    const parts = [...panel.querySelectorAll('button, input[type="range"]')].map((e) => ({
      name: e.getAttribute('data-testid') ?? e.tagName,
      ...box(e),
    }))
    return { panel: box(panel), parts, scrolls: panel.scrollHeight > panel.clientHeight + 1, vw: innerWidth, vh: innerHeight }
  })
  expect(r, 'audio dialog is open').not.toBeNull()
  if (!r) return
  expect(r.panel.x).toBeGreaterThanOrEqual(-1)
  expect(r.panel.y).toBeGreaterThanOrEqual(-1)
  expect(r.panel.x + r.panel.w).toBeLessThanOrEqual(r.vw + 1)
  expect(r.panel.y + r.panel.h).toBeLessThanOrEqual(r.vh + 1)
  expect(r.scrolls, 'the dialog fits without scrolling').toBe(false)
  for (const a of r.parts) {
    expect(a.x, a.name).toBeGreaterThanOrEqual(r.panel.x - 1)
    expect(a.x + a.w, a.name).toBeLessThanOrEqual(r.panel.x + r.panel.w + 1)
    expect(a.h, `${a.name} is a big touch target`).toBeGreaterThanOrEqual(44)
  }
  for (let i = 0; i < r.parts.length; i++) {
    for (let j = i + 1; j < r.parts.length; j++) {
      const a = r.parts[i]
      const b = r.parts[j]
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      expect(ix > 1 && iy > 1, `${a.name} overlaps ${b.name}`).toBe(false)
    }
  }
}

/**
 * The City selection: every action and the size control (− ×N +) show in full (neither panel
 * scrolls, so the ✕ is never pushed out of view), on screen, as big touch targets, none overlapping.
 */
async function expectCityActionsFit(page: Page) {
  const r = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="city-action-bar"]')
    if (!bar) return null
    const panels = [...bar.querySelectorAll('.bt-actionbar')].map((p) => ({
      overflows: p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1,
    }))
    const parts = [...bar.querySelectorAll('button, [data-testid="city-scale-label"]')].map((e) => {
      const b = e.getBoundingClientRect()
      return { name: e.getAttribute('data-testid') ?? e.tagName, x: b.x, y: b.y, w: b.width, h: b.height, button: e.tagName === 'BUTTON' }
    })
    return { panels, parts, vw: innerWidth, vh: innerHeight }
  })
  expect(r, 'city action bar is open').not.toBeNull()
  if (!r) return
  expect(r.panels).toHaveLength(2)
  for (const p of r.panels) expect(p.overflows, 'a city action panel scrolls').toBe(false)
  const names = r.parts.map((p) => p.name)
  for (const id of ['city-act-deselect', 'city-scale-down', 'city-scale-label', 'city-scale-up']) expect(names).toContain(id)
  for (const a of r.parts) {
    expect(a.x, `${a.name} on screen`).toBeGreaterThanOrEqual(-1)
    expect(a.y, `${a.name} on screen`).toBeGreaterThanOrEqual(-1)
    expect(a.x + a.w, `${a.name} on screen`).toBeLessThanOrEqual(r.vw + 1)
    expect(a.y + a.h, `${a.name} on screen`).toBeLessThanOrEqual(r.vh + 1)
    // Action buttons are half the HUD button size (user request): 32px on tablets, 22px on phones.
    if (a.button) expect(Math.min(a.w, a.h), `${a.name} is still tappable`).toBeGreaterThanOrEqual(22)
  }
  for (let i = 0; i < r.parts.length; i++) {
    for (let j = i + 1; j < r.parts.length; j++) {
      const a = r.parts[i]
      const b = r.parts[j]
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      expect(ix > 1 && iy > 1, `${a.name} overlaps ${b.name}`).toBe(false)
    }
  }
}

/** Opens the Sound dialog on the menu, checks it, and closes it with a backdrop tap. */
async function checkAudioDialog(page: Page) {
  await page.getByTestId('audio-settings').click()
  await expect(page.getByTestId('audio-settings-dialog')).toBeVisible()
  // Music is off in the e2e storage state: switch it on so the slider is live.
  await page.getByTestId('audio-music-on').click()
  await expect(page.getByTestId('music-volume')).toBeEnabled()
  await expectAudioDialogFits(page)
  await page.getByTestId('audio-settings-dialog').click({ position: { x: 4, y: 4 } })
  await expect(page.getByTestId('audio-settings-dialog')).toBeHidden()
}

for (const [width, height] of [
  [412, 891],
  [891, 412],
]) {
  test(`phone ${width}×${height}: no HUD control overlaps another or leaves the screen`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByTestId('main-menu')).toBeVisible()
    await expectTidy(page, 'menu')
    await expectMenuRowOneLine(page)
    await checkAudioDialog(page)

    // Workshop with a selected brick (the action bar), then with the colour picker toggled.
    await page.getByTestId('menu-workshop').click()
    await expect(page.getByTestId('workshop-canvas')).toBeVisible()
    await devHandle(page)
    await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(3, 0, 3))
    await expect(page.getByTestId('action-bar')).toBeVisible()
    await expectTidy(page, 'workshop')
    await page.getByTestId('colors-toggle').click()
    await expectTidy(page, 'workshop, colours toggled')
    await page.getByTestId('colors-toggle').click()
    await page.getByTestId('back').click()

    // Guided in normal mode: the piece tray.
    await page.evaluate(() => (window as unknown as BtWindow).__bt.useApp.getState().setDifficulty('normal'))
    await page.getByTestId('menu-guided').click()
    await expectTidy(page, 'guided picker')
    await page.getByTestId('tpl-tree').click()
    await expect(page.getByTestId('guided-canvas')).toBeVisible()
    await expectTidy(page, 'guided')
    await page.getByTestId('back').click()

    // City: a building (so 🔗 is enabled), then selected (its action bar), then road mode (its eraser).
    await page.evaluate(() => {
      const game = (window as unknown as BtWindow).__bt.useGame.getState()
      game.upsertBlueprint({
        id: 'bp-r', name: 'Nhà', kind: 'building', tags: [], baseplate: { w: 8, d: 8 },
        bricks: [{ id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 }], createdAt: 1, updatedAt: 1,
      })
      game.setCity({
        size: 48,
        roads: ['3,3'],
        placements: [
          { id: 'pl-r', source: 'tpl:house_small', cx: 20, cz: 20, rot: 0 },
          { id: 'pl-bp', source: 'bp-r', cx: 26, cz: 20, rot: 0 },
        ],
      })
    })
    await page.getByTestId('menu-city').click()
    await expect(page.getByTestId('city-drawer')).toBeVisible()
    await expectTidy(page, 'city')
    await page.evaluate(() => (window as unknown as BtWindow).__bt.useCityEditor.getState().selectPlacement('pl-r'))
    await expect(page.getByTestId('city-action-bar')).toBeVisible()
    await expectTidy(page, 'city, building selected')
    await expectCityActionsFit(page)
    // The size control works from here and still fits at x2.
    await page.getByTestId('city-scale-up').click()
    await expect(page.getByTestId('city-scale-label')).toHaveText('×2')
    await expectCityActionsFit(page)
    // The kid's own model: ✏️ too, the longest action bar.
    await page.evaluate(() => (window as unknown as BtWindow).__bt.useCityEditor.getState().selectPlacement('pl-bp'))
    await expect(page.getByTestId('city-act-edit')).toBeVisible()
    await expectTidy(page, 'city, own model selected')
    await expectCityActionsFit(page)
    await page.getByTestId('city-road-mode').click()
    await expect(page.getByTestId('city-road-eraser')).toBeVisible()
    await expectTidy(page, 'city, road mode')
    await page.getByTestId('back').click()

    await page.getByTestId('menu-drive').click()
    await expectTidy(page, 'vehicle picker')
    await page.getByTestId('veh-tpl:car').click()
    await expect(page.getByTestId('drive-gas')).toBeVisible()
    await expectTidy(page, 'drive')
    await page.getByTestId('back').click()

    await page.getByTestId('menu-maze').click()
    await expectTidy(page, 'maze picker')
    await page.getByTestId('maze-tpl-easy').click()
    await expect(page.getByTestId('maze-editor')).toBeVisible()
    await expectTidy(page, 'maze editor')
    await page.getByTestId('maze-drive').click()
    await page.getByTestId('veh-tpl:car').click()
    await expect(page.getByTestId('maze-hud')).toBeVisible()
    await expectTidy(page, 'maze drive')
  })
}

test('tablet 1080×810: the menu row stays on one line and the Sound dialog fits', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  await expectTidy(page, 'menu')
  await expectMenuRowOneLine(page)
  await checkAudioDialog(page)

  // City: the action bar column and the size control column beside it, ✕ in view.
  await devHandle(page)
  await page.evaluate(() => {
    const game = (window as unknown as BtWindow).__bt.useGame.getState()
    game.upsertBlueprint({
      id: 'bp-t', name: 'Nhà', kind: 'building', tags: [], baseplate: { w: 8, d: 8 },
      bricks: [{ id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 2 }], createdAt: 1, updatedAt: 1,
    })
    game.setCity({ size: 48, roads: [], placements: [{ id: 'pl-t', source: 'bp-t', cx: 20, cz: 20, rot: 0 }] })
  })
  await page.getByTestId('menu-city').click()
  await expect(page.getByTestId('city-drawer')).toBeVisible()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useCityEditor.getState().selectPlacement('pl-t'))
  await expect(page.getByTestId('city-act-edit')).toBeVisible()
  await expectTidy(page, 'city, own model selected')
  await expectCityActionsFit(page)
})
