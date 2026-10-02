import { expect, test, type Page } from '@playwright/test'

interface BtWindow {
  __bt: {
    useEditor: { getState(): { place(x: number, y: number, z: number): void } }
    useApp: { getState(): { setDifficulty(d: 'easy' | 'normal'): void } }
    useGame: { getState(): { setCity(city: unknown): void } }
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
    await page.evaluate(() =>
      (window as unknown as BtWindow).__bt.useGame
        .getState()
        .setCity({ size: 48, roads: ['3,3'], placements: [{ id: 'pl-r', source: 'tpl:house_small', cx: 20, cz: 20, rot: 0 }] }),
    )
    await page.getByTestId('menu-city').click()
    await expect(page.getByTestId('city-drawer')).toBeVisible()
    await expectTidy(page, 'city')
    await page.evaluate(() => (window as unknown as BtWindow).__bt.useCityEditor.getState().selectPlacement('pl-r'))
    await expect(page.getByTestId('city-action-bar')).toBeVisible()
    await expectTidy(page, 'city, building selected')
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
