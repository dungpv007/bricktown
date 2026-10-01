import { expect, test, type Page } from '@playwright/test'
import { waitForCameraStill } from './support'

interface Fig { torso: number; hat: string; face: string; print: string }
interface Brick { id: string; p: string; x: number; y: number; z: number; c: number; fig?: Fig }
interface BtWindow {
  __bt: {
    useEditor: {
      getState(): {
        partId: string
        fig: Fig
        place(x: number, y: number, z: number): void
        setColor(c: number): void
        selectedId: string | null
      }
    }
    useGame: { getState(): { data: { workshop: { bricks: Brick[] } } } }
  }
}

const bricks = (page: Page) =>
  page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.workshop.bricks)
const editorFig = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().fig)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-workshop').click()
  await expect(page.getByTestId('mode-workshop').locator('canvas')).toBeVisible()
})

test('figures: the figure tab lists ready-made figures; one places with its look', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.getByTestId('category-figure').click()
  for (const id of ['police', 'police_chief', 'robber', 'chef', 'waiter', 'firefighter', 'astronaut', 'kid']) {
    await expect(page.getByTestId(`fig-preset-${id}`)).toBeVisible()
  }
  await expect(page.getByTestId('fig-preset-robber').locator('img.bt-part-thumb')).toBeVisible()

  await page.getByTestId('fig-preset-robber').click()
  await expect(page.getByTestId('fig-preset-robber')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().partId)).toBe('minifig')
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(3, 0, 3))
  expect(await bricks(page)).toEqual([
    expect.objectContaining({ p: 'minifig', x: 3, y: 0, z: 3, fig: expect.objectContaining({ print: 'stripes', hat: 'robber_cap' }) }),
  ])
  await waitForCameraStill(page) // a few frames with the figure drawn
  expect(errors).toEqual([])
})

test('figures: ✏️ customises the figure to place, with a live preview', async ({ page }) => {
  test.slow() // renders a full-size figure preview for every look tried, on software GL
  await page.getByTestId('category-figure').click()
  await page.getByTestId('fig-preset-chef').click()
  await page.getByTestId('fig-edit').click()
  const editor = page.getByTestId('fig-editor')
  await expect(editor).toBeVisible()
  await expect(page.getByTestId('fig-preview').locator('img')).toBeVisible()
  const before = await page.getByTestId('fig-preview').getAttribute('data-fig')

  await page.getByTestId('fig-tab-hat').click()
  await page.getByTestId('fig-hat-crown').click()
  await expect(page.getByTestId('fig-hatcolor-29')).toHaveAttribute('aria-pressed', 'true') // gold is a figure colour
  await page.getByTestId('fig-tab-face').click()
  await page.getByTestId('fig-face-wink').click()
  await page.getByTestId('fig-tab-torso').click()
  await page.getByTestId('fig-torso-2').click()
  await page.getByTestId('fig-print-suit').click()
  await expect(page.getByTestId('fig-preview')).not.toHaveAttribute('data-fig', before ?? '')
  expect(await editorFig(page)).toMatchObject({ hat: 'crown', face: 'wink', torso: 2, print: 'suit' })

  await page.getByTestId('fig-editor-done').click()
  await expect(editor).toBeHidden()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(2, 0, 2))
  expect((await bricks(page))[0].fig).toMatchObject({ hat: 'crown', face: 'wink', torso: 2, print: 'suit' })
})

test('figures: recolouring a selected figure paints its torso and opens the editor; edits undo', async ({ page }) => {
  test.slow() // opens the figure editor (full-size preview renders) on software GL
  await page.getByTestId('category-figure').click()
  await page.getByTestId('fig-preset-police').click()
  await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().place(2, 0, 2))
  const id = (await bricks(page))[0].id
  // Placing selects the new figure; a colour swatch then recolours it.
  expect(await page.evaluate(() => (window as unknown as BtWindow).__bt.useEditor.getState().selectedId)).toBe(id)
  await page.getByTestId('color-2').click()
  await expect(page.getByTestId('fig-editor')).toBeVisible()
  expect((await bricks(page))[0].fig?.torso).toBe(2)

  await page.getByTestId('fig-tab-hat').click()
  await page.getByTestId('fig-hat-chef').click()
  expect((await bricks(page))[0].fig?.hat).toBe('chef')
  await page.getByTestId('fig-editor-done').click()

  await page.getByTestId('undo').click()
  expect((await bricks(page))[0].fig?.hat).toBe('police')
  await page.getByTestId('undo').click()
  expect((await bricks(page))[0].fig?.torso).toBe(21)
})
