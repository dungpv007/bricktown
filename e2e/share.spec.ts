import { expect, test, type Browser, type Page } from '@playwright/test'

interface Cell {
  cx: number
  cz: number
}
interface BtWindow {
  __bt: {
    useGame: {
      getState(): {
        data: {
          blueprints: Array<{ id: string; name: string; templateId?: string }>
          sharedTemplates: Array<{ id: string }>
          mazes: Array<{ id: string; name: string }>
          mazeChallenges: Record<string, { timeMs: number }>
          city: { size: number; roads: string[]; placements: Array<{ source: string }> }
          guided: unknown
          completedTemplates: string[]
        }
        upsertBlueprint(bp: unknown): void
        upsertMaze(maze: unknown): void
        setMazeRecord(key: string, record: unknown): void
        setCity(city: unknown): void
      }
    }
    useGuided: { getState(): { pending(): Array<{ id: string }>; placeGhost(id: string): boolean } }
  }
}

/** A folder for screenshots of the dialogs, for review (optional; e2e has no Node types, hence the cast). */
const SHOTS = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SHARE_SHOTS
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const TOWER = {
  id: 'bp_tower', name: 'Tháp của An', kind: 'building', tags: [], baseplate: { w: 8, d: 8 }, createdAt: 1, updatedAt: 1,
  bricks: [
    { id: 'a', p: 'brick_2x4', x: 0, y: 0, z: 0, r: 0, c: 1 },
    { id: 'b', p: 'brick_2x4', x: 0, y: 3, z: 0, r: 0, c: 4 },
    { id: 'c', p: 'brick_2x2', x: 0, y: 6, z: 0, r: 0, c: 2 },
  ],
}

/** A 7x7 maze: solid outer ring with an entrance on the west and an exit on the east, open inside. */
function playableMaze() {
  const entry: Cell = { cx: 0, cz: 1 }
  const exit: Cell = { cx: 6, cz: 5 }
  const walls: string[] = []
  for (let cz = 0; cz < 7; cz++) {
    for (let cx = 0; cx < 7; cx++) {
      const border = cx === 0 || cz === 0 || cx === 6 || cz === 6
      const door = (cx === entry.cx && cz === entry.cz) || (cx === exit.cx && cz === exit.cz)
      if (border && !door) walls.push(`${cx},${cz}`)
    }
  }
  return { id: 'maze_an', name: 'Mê cung của An', w: 7, h: 7, walls, entry, exit, coins: ['3,3'], wallColor: 6, createdAt: 1, updatedAt: 1 }
}

/** The app open at the main menu, then `seed(arg)` run against the stores. */
async function openWith<A>(page: Page, seed?: (bt: BtWindow['__bt'], arg: A) => void, arg?: A) {
  await page.goto('/')
  await expect(page.getByTestId('main-menu')).toBeVisible()
  if (seed) {
    await page.evaluate(([src, a]) => new Function('bt', 'arg', `(${src})(bt, arg)`)((window as unknown as BtWindow).__bt, a), [seed.toString(), arg] as const)
  }
}

/** A second device: its own browser context (own storage and save), same tablet viewport. */
async function friend(browser: Browser, page: Page, baseURL: string | undefined) {
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    hasTouch: true,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL!,
          localStorage: [
            { name: 'bricktown-onboarded-v2', value: '1' },
            { name: 'bricktown-install-hint-dismissed', value: '1' },
            { name: 'bricktown-prefs', value: JSON.stringify({ state: { musicOn: false, sfxOn: false }, version: 0 }) },
          ],
        },
      ],
    },
  })
  return context.newPage()
}

const shareLinkOf = (page: Page) => page.getByTestId('share-dialog').getAttribute('data-link').then((l) => l!)
const dataOf = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data)

test('share a model with build steps: a friend previews it, imports it and builds it in Guided', async ({ page, browser, baseURL }) => {
  await openWith(page, (bt, bp) => bt.useGame.getState().upsertBlueprint(bp), TOWER)
  await page.getByTestId('menu-workshop').click()
  await page.getByTestId('open-library').click()
  await shot(page, '0-library')
  await page.getByTestId('share-model-bp_tower').click()
  await expect(page.getByTestId('share-dialog')).toBeVisible()
  await expect(page.getByTestId('share-with-steps')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('share-qr')).toBeVisible()
  await expect(page.getByTestId('share-local-hint')).toBeVisible() // localhost: friends need the file
  await shot(page, '1-share-dialog')
  const link = await shareLinkOf(page)
  expect(link).toMatch(/\/#s=[A-Za-z0-9_-]+$/)

  const other = await friend(browser, page, baseURL)
  await other.goto(link)
  const preview = other.getByTestId('import-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('data-kind', 'model')
  await expect(other.getByTestId('import-name')).toHaveText('Tháp của An')
  await expect(other.getByTestId('import-bricks')).toContainText('3')
  await expect(other.getByTestId('import-with-steps')).toBeVisible()
  expect(new URL(other.url()).hash).toBe('') // the link is used once
  expect((await dataOf(other)).blueprints).toEqual([]) // nothing added before ✓
  await shot(other, '2-import-model')

  await other.getByTestId('import-confirm').click()
  await expect(other.getByTestId('import-done')).toBeVisible()
  const after = await dataOf(other)
  expect(after.blueprints.map((b) => b.name)).toEqual(['Tháp của An'])
  expect(after.sharedTemplates).toHaveLength(1)
  const sharedId = after.sharedTemplates[0].id

  await other.getByTestId('import-go').click() // to Guided mode
  await expect(other.getByTestId('guided-shared')).toBeVisible()
  await shot(other, '3-guided-shared')
  await other.getByTestId(`shared-tpl-${sharedId}`).click()
  await expect(other.getByTestId('guided-canvas')).toBeVisible()
  for (let steps = 0; (await dataOf(other)).guided !== null; steps++) {
    expect(steps).toBeLessThan(20)
    const placed = await other.evaluate(() => {
      const g = (window as unknown as BtWindow).__bt.useGuided.getState()
      return g.pending().filter((b) => g.placeGhost(b.id)).length
    })
    expect(placed).toBeGreaterThan(0)
  }
  await expect(other.getByTestId('celebration')).toBeVisible()
  expect((await dataOf(other)).completedTemplates).toContain(sharedId)
  await other.context().close()
})

test('share a maze with the best time: the friend gets it with a challenge badge', async ({ page, browser, baseURL }) => {
  await openWith(
    page,
    (bt, maze) => {
      bt.useGame.getState().upsertMaze(maze)
      bt.useGame.getState().setMazeRecord('maze_an', { timeMs: 42_000, stars: 1, coins: 1 })
    },
    playableMaze(),
  )
  await page.getByTestId('menu-maze').click()
  await page.getByTestId('share-maze-maze_an').click()
  await expect(page.getByTestId('share-qr')).toBeVisible()
  const link = await shareLinkOf(page)

  const other = await friend(browser, page, baseURL)
  await other.goto(link)
  await expect(other.getByTestId('import-preview')).toHaveAttribute('data-kind', 'maze')
  await expect(other.getByTestId('import-challenge')).toContainText('42s')
  await shot(other, '4-import-maze')
  await other.getByTestId('import-confirm').click()
  await other.getByTestId('import-go').click()
  await expect(other.getByTestId('maze-picker')).toBeVisible()
  const [maze] = (await dataOf(other)).mazes
  expect(maze.name).toBe('Mê cung của An')
  expect((await dataOf(other)).mazeChallenges[maze.id]).toEqual({ timeMs: 42_000 })
  await expect(other.getByTestId(`maze-own-${maze.id}`).getByTestId('maze-challenge')).toHaveText('🏁 Vượt 42s?')
  await shot(other, '4b-maze-picker')
  await other.context().close()
})

test('share a city: the friend replaces their own city after a second ✓', async ({ page, browser, baseURL }) => {
  await openWith(
    page,
    (bt, bp) => {
      const game = bt.useGame.getState()
      game.upsertBlueprint(bp)
      game.setCity({
        size: 48,
        roads: ['10,10', '11,10', '12,10'],
        placements: [
          { id: 'p1', source: 'tpl:house_small', cx: 10, cz: 11, rot: 0 },
          { id: 'p2', source: 'bp_tower', cx: 13, cz: 11, rot: 0 },
        ],
      })
    },
    TOWER,
  )
  await page.getByTestId('menu-city').click()
  await page.getByTestId('share-city').click()
  const link = await shareLinkOf(page)

  const other = await friend(browser, page, baseURL)
  await openWith(other, (bt) => bt.useGame.getState().setCity({ size: 48, roads: ['1,1'], placements: [] }))
  await other.goto(link)
  await expect(other.getByTestId('import-preview')).toHaveAttribute('data-kind', 'city')
  await expect(other.getByTestId('import-placements')).toContainText('2')
  await shot(other, '5-import-city')
  await other.getByTestId('import-confirm').click()
  await expect(other.getByTestId('confirm-dialog')).toBeVisible() // the kid's city would be lost
  await other.getByTestId('confirm-yes').click()
  await expect(other.getByTestId('import-done')).toBeVisible()
  const { city, blueprints } = await dataOf(other)
  expect(city.roads).toEqual(['10,10', '11,10', '12,10'])
  expect(city.placements.map((p) => p.source)).toEqual(['tpl:house_small', blueprints[0].id])
  await other.context().close()
})

test('a broken link shows a friendly error card; a picked file is previewed', async ({ page }) => {
  await page.goto('/#s=this-is-not-a-creation')
  await expect(page.getByTestId('import-error')).toBeVisible()
  await shot(page, '6-import-error')
  await page.getByTestId('import-error-ok').click()
  await expect(page.getByTestId('import-error')).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe('')

  const fileText = await page.evaluate(async (bp) => {
    const url = '/src/core/share.ts' // the dev server serves the module itself
    const share = await import(/* @vite-ignore */ url)
    return share.shareFileText(share.buildModelPackage(bp, { withSteps: false })) as string
  }, TOWER)
  await page.getByTestId('menu-import').click()
  // As if picked in the file chooser (built in the page: the specs have no Node Buffer type).
  await page.getByTestId('import-file-input').evaluate((input: HTMLInputElement, text) => {
    const files = new DataTransfer()
    files.items.add(new File([text], 'thap.bricktown', { type: 'application/json' }))
    input.files = files.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, fileText)
  await expect(page.getByTestId('import-name')).toHaveText('Tháp của An')
  await expect(page.getByTestId('import-with-steps')).toHaveCount(0)
})

/** What a chat assistant answers for a photo of a small tower: plain authoring JSON (with one duplicate brick). */
const AUTHORED = {
  format: 'bricktown-authoring',
  version: 1,
  kind: 'model',
  name: 'Tháp từ ảnh',
  blueprintKind: 'building',
  baseplate: { w: 8, d: 8, c: 5 },
  withSteps: true,
  bricks: [
    { p: 'brick_2x4', x: 2, y: 0, z: 2, r: 0, c: 2 },
    { p: 'brick_2x4', x: 2, y: 3, z: 2, r: 0, c: 4 },
    { p: 'brick_2x4', x: 2, y: 3, z: 2, r: 0, c: 4 },
    { p: 'slope_2x2', x: 2, y: 6, z: 4, r: 0, c: 0 },
  ],
}

test('plain authoring JSON pasted into 📥 is checked, repaired, previewed and added to the library', async ({ page }) => {
  await openWith(page)
  await page.getByTestId('menu-import').click()
  await page.getByTestId('import-paste').fill(`\`\`\`json ${JSON.stringify(AUTHORED)} \`\`\``)
  await page.getByTestId('import-paste-go').click()
  await expect(page.getByTestId('import-preview')).toHaveAttribute('data-kind', 'model')
  await expect(page.getByTestId('import-name')).toHaveText('Tháp từ ảnh')
  await expect(page.getByTestId('import-bricks')).toContainText('3')
  await expect(page.getByTestId('import-fixed')).toContainText('1') // the duplicate brick was dropped
  await expect(page.getByTestId('import-with-steps')).toBeVisible()
  await shot(page, '7-import-authoring')
  await page.getByTestId('import-confirm').click()
  await expect(page.getByTestId('import-done')).toBeVisible()
  await page.getByTestId('import-done-ok').click()

  const added = await page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.blueprints.at(-1)!)
  expect(added.name).toBe('Tháp từ ảnh')
  await page.getByTestId('menu-workshop').click()
  await page.getByTestId('open-library').click()
  await expect(page.getByTestId(`blueprint-card-${added.id}`)).toBeVisible()

  // A broken one says what is wrong, brick by brick.
  await page.goto('/')
  await page.getByTestId('menu-import').click()
  await page.getByTestId('import-paste').fill(JSON.stringify({ ...AUTHORED, bricks: [{ p: 'brick_9x9', x: 0, y: 0, z: 0, c: 2 }] }))
  await page.getByTestId('import-paste-go').click()
  await expect(page.getByTestId('import-error')).toBeVisible()
  await expect(page.getByTestId('import-problems')).toContainText('brick_9x9')
  await shot(page, '8-import-authoring-error')
})
