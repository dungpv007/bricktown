import { expect, test, type Page } from '@playwright/test'

/** The sushi game's dev hook (src/play/sushi/SushiGame.tsx). */
interface SushiState {
  phase: string
  customer: number
  step: string | null
  ready: boolean
  coins: number
  kind: string
  filling: string
}
interface SushiWindow {
  __btSushi?: {
    point(name: string): { x: number; y: number } | null
    state(): SushiState
  }
}

const state = (page: Page) => page.evaluate(() => (window as unknown as SushiWindow).__btSushi?.state() ?? null)

async function point(page: Page, name: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((n) => (window as unknown as SushiWindow).__btSushi?.point(n) ?? null, name)
  if (!p) throw new Error(`no point for ${name}`)
  return p
}

/** Waits until the dish waits for `step` and the kid can act. */
async function waitStep(page: Page, step: string | null) {
  await expect.poll(async () => {
    const s = await state(page)
    return s ? `${s.step}:${s.ready}` : ''
  }).toBe(`${step}:true`)
}

/** Drags with the mouse (pointer events) from one thing to another, like a finger. */
async function drag(page: Page, from: string, to: string) {
  const a = await point(page, from)
  const b = await point(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2 - 30, { steps: 6 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
}

async function tapMat(page: Page) {
  const p = await point(page, 'mat')
  await page.mouse.click(p.x, p.y)
}

/** Makes and serves the current customer's order, by drag and tap. */
async function serveOne(page: Page) {
  const s = await state(page)
  if (!s) throw new Error('no game state')
  if (s.kind === 'maki') {
    await waitStep(page, 'seaweed')
    await drag(page, 'seaweed', 'mat')
    await waitStep(page, 'rice')
    await drag(page, 'rice', 'mat')
    await waitStep(page, 'filling')
    await drag(page, s.filling, 'mat')
    await waitStep(page, 'roll')
    await tapMat(page)
    await waitStep(page, 'cut')
    await tapMat(page)
  } else {
    await waitStep(page, 'rice')
    await drag(page, 'rice', 'mat')
    await waitStep(page, 'filling')
    await drag(page, s.filling, 'mat')
    await waitStep(page, 'press')
    await tapMat(page)
  }
  await waitStep(page, 'serve')
  await drag(page, 'plate', 'customer')
}

test('sushi: make a maki by drag and tap, serve it, and the coins go up', async ({ page }) => {
  test.setTimeout(120_000) // a whole round of four customers, in software WebGL
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-play').click()
  await page.getByTestId('play-game-sushi').click()
  await expect(page.getByTestId('mode-play')).toHaveAttribute('data-game', 'sushi')
  await page.getByTestId('round-start').click()

  // The first customer walks in and orders by picture.
  await expect(page.getByTestId('order-bubble')).toBeVisible()
  await expect(page.getByTestId('sushi-coins')).toHaveAttribute('data-coins', '0')
  const first = await state(page)
  expect(first?.kind).toBe('maki') // the first order teaches the whole recipe

  // A wrong filling only makes the customer shake their head: the dish waits for the right one.
  await waitStep(page, 'seaweed')
  await drag(page, 'seaweed', 'mat')
  await waitStep(page, 'rice')
  await drag(page, 'rice', 'mat')
  await waitStep(page, 'filling')

  // Idle while the kid thinks: render on demand, no frame loop.
  await page.waitForTimeout(1200)
  const frames = () => page.evaluate(() => (window as unknown as { __bt: { renderStats: { frames: number; loopFps(): number } } }).__bt.renderStats)
  const idle = await page.evaluate(() => (window as unknown as { __bt: { renderStats: { loopFps(): number } } }).__bt.renderStats.loopFps())
  expect(idle).toBe(0)
  const f0 = (await frames()).frames
  await page.waitForTimeout(800)
  expect((await frames()).frames - f0).toBeLessThanOrEqual(2)

  const wrong = ['salmon', 'cucumber', 'tuna'].find((f) => f !== first?.filling)!
  await drag(page, wrong, 'mat')
  await page.waitForTimeout(400)
  await waitStep(page, 'filling')
  await drag(page, first!.filling, 'mat')
  await waitStep(page, 'roll')
  await tapMat(page)
  await waitStep(page, 'cut')
  await tapMat(page)
  await waitStep(page, 'serve')
  await drag(page, 'plate', 'customer')

  // The customer eats, coins fly into the round's pill, and the next customer comes.
  await expect(page.getByTestId('sushi-coins')).toHaveAttribute('data-coins', '3')
  await expect(page.getByTestId('play-progress')).toHaveAttribute('data-done', '1')

  // The rest of the round, then the summary pays into the wallet.
  const before = Number(await page.getByTestId('play-coins').getAttribute('data-coins'))
  for (let i = 1; i < 4; i++) {
    await expect.poll(async () => (await state(page))?.customer).toBe(i)
    await expect.poll(async () => (await state(page))?.ready).toBe(true)
    await serveOne(page)
  }
  await expect(page.getByTestId('round-summary')).toBeVisible({ timeout: 20_000 })
  const earned = Number(await page.getByTestId('round-coins').getAttribute('data-coins'))
  expect(earned).toBeGreaterThanOrEqual(12)
  await expect(page.getByTestId('play-coins')).toHaveAttribute('data-coins', String(before + earned))
  await expect(page.getByTestId('sticker-sushi_first')).toBeVisible()
  expect(errors).toEqual([])
})

test('sushi: leaving mid-drag removes the drag listeners, and releasing later changes nothing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('menu-play').click()
  await page.getByTestId('play-game-sushi').click()
  await page.getByTestId('round-start').click()
  await expect(page.getByTestId('order-bubble')).toBeVisible()
  await waitStep(page, 'seaweed')
  const coinsBefore = await page.getByTestId('play-coins').getAttribute('data-coins')
  // Track the window 'pointerup' listeners that are alive.
  await page.evaluate(() => {
    const w = window as unknown as { __up: Set<unknown> }
    w.__up = new Set()
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    window.addEventListener = ((t: string, fn: unknown, ...r: unknown[]) => {
      if (t === 'pointerup') w.__up.add(fn)
      return (add as (...a: unknown[]) => void)(t, fn, ...r)
    }) as typeof window.addEventListener
    window.removeEventListener = ((t: string, fn: unknown, ...r: unknown[]) => {
      if (t === 'pointerup') w.__up.delete(fn)
      return (remove as (...a: unknown[]) => void)(t, fn, ...r)
    }) as typeof window.removeEventListener
  })
  const a = await point(page, 'seaweed')
  const b = await point(page, 'mat')
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 4 })
  // Whatever listeners the drag added, now: they must all be gone after leaving.
  await page.evaluate(() => {
    const w = window as unknown as { __up: Set<unknown>; __held: unknown[] }
    w.__held = [...w.__up]
  })
  expect(await page.evaluate(() => (window as unknown as { __held: unknown[] }).__held.length)).toBeGreaterThan(0)
  // Back with another "finger" while the item is still held.
  await page.getByTestId('back').dispatchEvent('click')
  await expect(page.getByTestId('mode-play')).toHaveCount(0)
  // The 3D scene unmounts a moment after the screen does.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as { __up: Set<unknown>; __held: unknown[] }
        return w.__held.filter((f) => w.__up.has(f)).length
      }),
    )
    .toBe(0)
  await page.mouse.up()
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
  await page.getByTestId('menu-play').click()
  await expect(page.getByTestId('play-coins')).toHaveAttribute('data-coins', coinsBefore ?? '0')
})
