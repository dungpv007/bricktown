import { expect, test, type Page } from '@playwright/test'
import { flushAutosave, savedSlotData } from './support'

interface Cell {
  cx: number
  cz: number
}
interface MazeData {
  id: string
  name: string
  w: number
  h: number
  walls: string[]
  entry: Cell | null
  exit: Cell | null
  coins: string[]
  templateId?: string
}
interface BtWindow {
  __bt: {
    useGame: { getState(): { data: { mazes: MazeData[] } } }
    useMazeEditor: { getState(): { mazeId: string | null; templateMaze: MazeData | null } }
    mazeScreen: { cellToClient: ((cx: number, cz: number) => { x: number; y: number }) | null }
  }
}

/** The maze open in the editor, as the store has it. */
const openMaze = (page: Page) =>
  page.evaluate(() => {
    const bt = (window as unknown as BtWindow).__bt
    const { mazeId, templateMaze } = bt.useMazeEditor.getState()
    return templateMaze ?? bt.useGame.getState().data.mazes.find((m) => m.id === mazeId) ?? null
  })

const savedMazes = (page: Page) => page.evaluate(() => (window as unknown as BtWindow).__bt.useGame.getState().data.mazes)

/** Screen point of a cell's floor centre. */
async function at(page: Page, cx: number, cz: number) {
  await expect.poll(() => page.evaluate(() => (window as unknown as BtWindow).__bt.mazeScreen.cellToClient !== null)).toBe(true)
  return page.evaluate(([x, z]) => (window as unknown as BtWindow).__bt.mazeScreen.cellToClient!(x, z), [cx, cz] as const)
}

async function tapCell(page: Page, cx: number, cz: number) {
  const p = await at(page, cx, cz)
  await page.mouse.click(p.x, p.y)
}

async function dragCells(page: Page, from: Cell, to: Cell) {
  const a = await at(page, from.cx, from.cz)
  const b = await at(page, to.cx, to.cz)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 12 })
  await page.mouse.up()
}

async function openPicker(page: Page) {
  await page.goto('/')
  await page.getByTestId('menu-maze').click()
  await expect(page.getByTestId('maze-picker')).toBeVisible()
}

/** Waits for the canvas and for the camera to settle on the framed maze. */
async function waitForEditor(page: Page) {
  await expect(page.getByTestId('maze-editor')).toBeVisible()
  await expect(page.getByTestId('mode-maze').locator('canvas')).toBeVisible()
  await at(page, 0, 0)
  await page.waitForTimeout(300)
}

test('maze: open a template, edit a wall, move the entry and exit, undo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openPicker(page)
  await page.getByTestId('maze-tpl-easy').click()
  await waitForEditor(page)
  await expect(page.getByTestId('maze-status')).toHaveAttribute('data-status', 'ok')
  await expect(page.getByTestId('maze-drive')).toBeEnabled()
  expect(await savedMazes(page)).toEqual([])

  // A wall on a floor cell: the template becomes the kid's own copy.
  await page.getByTestId('maze-tool-wall').click()
  await tapCell(page, 2, 1)
  await expect.poll(async () => (await openMaze(page))?.walls.includes('2,1')).toBe(true)
  const own = await savedMazes(page)
  expect(own).toHaveLength(1)
  expect(own[0].templateId).toBe('easy')

  await page.getByTestId('maze-tool-entry').click()
  await tapCell(page, 0, 1)
  await page.getByTestId('maze-tool-exit').click()
  await tapCell(page, 6, 3)
  await expect.poll(async () => (await openMaze(page))?.entry).toEqual({ cx: 0, cz: 1 })
  await expect.poll(async () => (await openMaze(page))?.exit).toEqual({ cx: 6, cz: 3 })

  await page.getByTestId('maze-undo').click()
  await expect.poll(async () => (await openMaze(page))?.exit).toEqual({ cx: 6, cz: 5 })
  await page.getByTestId('maze-undo').click()
  await page.getByTestId('maze-undo').click()
  await expect.poll(async () => (await openMaze(page))?.walls.includes('2,1')).toBe(false)
  await expect(page.getByTestId('maze-undo')).toBeDisabled()

  // A tap on a corner is refused.
  await page.getByTestId('maze-tool-entry').click()
  await tapCell(page, 0, 0)
  await expect(page.getByTestId('maze-error')).toBeVisible()
  expect(errors).toEqual([])
})

test('maze: a new empty maze cannot be driven until it has an entry, an exit and a way through', async ({ page }) => {
  await openPicker(page)
  await page.getByTestId('maze-new').click()
  await page.getByTestId('maze-new-7').click()
  await waitForEditor(page)
  const drive = page.getByTestId('maze-drive')
  const status = page.getByTestId('maze-status')
  await expect(status).toHaveAttribute('data-status', 'no_entry')
  await expect(drive).toBeDisabled()

  await page.getByTestId('maze-tool-entry').click()
  await tapCell(page, 0, 3)
  await expect(status).toHaveAttribute('data-status', 'no_exit')
  await expect(drive).toBeDisabled()
  await page.getByTestId('maze-tool-exit').click()
  await tapCell(page, 6, 3)
  await expect(status).toHaveAttribute('data-status', 'ok')
  await expect(drive).toBeEnabled()

  // A wall drawn right across blocks the way: one drag, one undo step.
  await page.getByTestId('maze-tool-wall').click()
  await dragCells(page, { cx: 3, cz: 1 }, { cx: 3, cz: 5 })
  await expect(status).toHaveAttribute('data-status', 'no_path')
  await expect(drive).toBeDisabled()
  const walls = new Set((await openMaze(page))!.walls)
  for (const k of ['3,1', '3,2', '3,3', '3,4', '3,5']) expect(walls.has(k)).toBe(true)
  await page.getByTestId('maze-undo').click()
  await expect(status).toHaveAttribute('data-status', 'ok')

  await drive.click()
  await expect(page.getByTestId('vehicle-picker')).toBeVisible()
  await page.getByTestId('back').click()
  await waitForEditor(page)
  await expect(status).toHaveAttribute('data-status', 'ok')

  // Back from the editor goes to the picker, then to the menu.
  await page.getByTestId('back').click()
  await expect(page.getByTestId('maze-picker')).toBeVisible()
  await page.getByTestId('back').click()
  await expect(page.getByTestId('main-menu')).toBeVisible()
})

test('maze: 🎲 makes playable mazes, from the picker and in the editor', async ({ page }) => {
  await openPicker(page)
  await page.getByTestId('maze-random').click()
  await page.getByTestId('maze-random-3').click()
  await waitForEditor(page)
  await expect(page.getByTestId('maze-status')).toHaveAttribute('data-status', 'ok')
  expect((await openMaze(page))!.w).toBe(15)

  await page.getByTestId('maze-generate').click()
  await page.getByTestId('maze-gen-1').click()
  await expect.poll(async () => (await openMaze(page))?.w).toBe(7)
  await expect(page.getByTestId('maze-status')).toHaveAttribute('data-status', 'ok')
  expect(await savedMazes(page)).toHaveLength(1)
})

test('maze: the kid’s maze is saved by itself and is there after a reload', async ({ page }) => {
  await openPicker(page)
  await page.getByTestId('maze-new').click()
  await page.getByTestId('maze-new-11').click()
  await waitForEditor(page)
  await page.getByTestId('maze-tool-wall').click()
  await dragCells(page, { cx: 2, cz: 2 }, { cx: 6, cz: 2 })
  await page.getByTestId('maze-color').click()
  await page.getByTestId('maze-color-3').click()
  const name = page.getByTestId('maze-name')
  await name.fill('Lâu đài') // saved as typed: no Enter, no blur needed
  const maze = (await openMaze(page))!
  expect(maze.name).toBe('Lâu đài')

  await flushAutosave(page)
  await expect
    .poll(async () => (await savedSlotData<{ mazes: MazeData[] }>(page))?.mazes.map((m) => m.name))
    .toEqual(['Lâu đài'])
  await page.reload()
  await page.getByTestId('menu-maze').click()
  await page.getByTestId(`maze-own-${maze.id}`).click()
  await waitForEditor(page)
  const reloaded = (await openMaze(page))!
  expect(reloaded).toMatchObject({ id: maze.id, name: 'Lâu đài', w: 11, h: 11, wallColor: 3 })
  for (const k of ['2,2', '3,2', '4,2', '5,2', '6,2']) expect(reloaded.walls).toContain(k)

  // Deleting asks first.
  await page.getByTestId('back').click()
  await page.getByTestId(`maze-del-${maze.id}`).click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId(`maze-own-${maze.id}`)).toHaveCount(0)
})
