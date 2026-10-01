import { create } from 'zustand'
import * as sfx from '../audio/sfx'
import { getMazeTemplate } from '../content/mazes'
import { newId } from '../core/ids'
import {
  cellKey,
  createEmptyMaze,
  inBounds,
  isBorder,
  paintWalls,
  setEntry,
  setExit,
  toggleCoin,
  toggleWall,
  type Cell,
  type DoorError,
  type Maze,
} from '../core/maze'
import { cellsBetween, resizeMaze } from '../core/mazeEdit'
import { generateMaze, type MazeDifficulty } from '../core/mazeGen'
import { t } from '../ui/i18n'
import { createHistory } from './history'
import { useApp } from './useApp'
import { useGame } from './useGame'

/** `move` pans the view with one finger; `wall` / `erase` paint along a drag; the others act on a tap. */
export type MazeTool = 'move' | 'wall' | 'erase' | 'entry' | 'exit' | 'coin'

/** Why an edit was refused: a door rule, or 'nothing' when the tap changed nothing (a coin on a wall...). */
export type MazeEditError = DoorError | 'nothing'

/** Maze names are cut to this many characters. */
export const MAZE_NAME_MAX = 24

const TEMPLATE_PREFIX = 'tpl:'

export interface MazeEditorState {
  tool: MazeTool
  /**
   * The open maze: one of the kid's (its id), or `tpl:<templateId>` while a ready-made maze is open
   * unchanged. Also the key of the maze's best run. Null: nothing open (the picker shows).
   */
  mazeId: string | null
  /** The open ready-made maze; it becomes the kid's own saved copy on its first change. */
  templateMaze: Maze | null
  /** While a wall stroke is dragged: the maze as it will be when the finger lifts. */
  preview: Maze | null
  lastError: MazeEditError | null
  /** Incremented on every refused edit, so the UI can react to repeats of the same error. */
  errorSeq: number
  canUndo: boolean
  setTool: (tool: MazeTool) => void
  openTemplate: (templateId: string) => void
  openMaze: (id: string) => void
  /** A new empty maze (`size` x `size` cells), saved and opened. */
  newMaze: (size: number) => void
  /** A new random maze, saved and opened. */
  newGenerated: (difficulty: MazeDifficulty, seed?: number) => void
  close: () => void
  /** A tap on a cell with the current tool (wall / erase taps are one-cell strokes). */
  tapCell: (cell: Cell) => void
  strokeStart: (cell: Cell) => void
  strokeTo: (cell: Cell) => void
  strokeEnd: () => void
  strokeCancel: () => void
  /** Replaces the open maze's layout with a random one (keeps its name and colours). */
  generate: (difficulty: MazeDifficulty, seed?: number) => void
  resize: (size: number) => void
  setWallColor: (color: number) => void
  /** Blank names are ignored; long ones are cut to MAZE_NAME_MAX. */
  rename: (name: string) => void
  undo: () => void
}

const history = createHistory<Maze>()

const game = () => useGame.getState()

/** The maze the editor shows (ignoring a stroke in progress), or null. */
export function currentMaze(): Maze | null {
  const { mazeId, templateMaze } = useMazeEditor.getState()
  if (templateMaze) return templateMaze
  if (mazeId === null) return null
  return game().data.mazes.find((m) => m.id === mazeId) ?? null
}

/** React hook form of {@link currentMaze}, including a stroke in progress. */
export function useShownMaze(): Maze | null {
  const preview = useMazeEditor((s) => s.preview)
  const templateMaze = useMazeEditor((s) => s.templateMaze)
  const mazeId = useMazeEditor((s) => s.mazeId)
  const own = useGame((s) => (mazeId === null ? null : (s.data.mazes.find((m) => m.id === mazeId) ?? null)))
  return preview ?? templateMaze ?? own
}

/** True while a maze is open in the editor (re-renders only when that changes, not on every edit). */
export function useHasOpenMaze(): boolean {
  const mazeId = useMazeEditor((s) => s.mazeId)
  const hasTemplate = useMazeEditor((s) => s.templateMaze !== null)
  const hasOwn = useGame((s) => mazeId !== null && s.data.mazes.some((m) => m.id === mazeId))
  return hasTemplate || hasOwn
}

/** "<base> <n>": the first number from `from` not already used by one of the kid's mazes. */
function numberedName(base: string, from: number): string {
  const used = new Set(game().data.mazes.map((m) => m.name))
  let n = from
  while (used.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** "Mê cung 3" for a new maze. */
const nextDefaultName = () => numberedName(t('mazeDefaultName'), game().data.mazes.length + 1)

/** "Trái tim 2" for the kid's copy of a ready-made maze (the template itself counts as 1), in today's language. */
function copyName(templateId: string | undefined, fallback: string): string {
  const tpl = templateId === undefined ? undefined : getMazeTemplate(templateId)
  return numberedName(tpl ? tpl.name[useApp.getState().lang] : fallback, 2)
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

const clampCell = (maze: Maze, cell: Cell): Cell => ({
  cx: Math.max(0, Math.min(maze.w - 1, cell.cx)),
  cz: Math.max(0, Math.min(maze.h - 1, cell.cz)),
})

interface Stroke {
  /** Paint walls (true) or floor. */
  wall: boolean
  cells: Cell[]
  last: Cell
  /** Wall tool pressed on an inside wall: a plain tap there removes it. */
  tapRemoves: boolean
}

let stroke: Stroke | null = null
/** The last saved change was a rename: further renames (typing on) join its undo step. */
let renaming = false

export const useMazeEditor = create<MazeEditorState>()((set, get) => {
  const reject = (error: MazeEditError) => {
    sfx.error()
    set((s) => ({ lastError: error, errorSeq: s.errorSeq + 1 }))
  }

  const open = (mazeId: string, templateMaze: Maze | null) => {
    history.clear()
    stroke = null
    renaming = false
    set({ mazeId, templateMaze, preview: null, tool: 'wall', lastError: null, canUndo: false })
  }

  /**
   * Saves `after` (the result of an edit of the current maze) and records the maze before it for
   * undo. An unchanged result (same object) saves nothing and returns false. A ready-made maze is
   * first turned into the kid's own copy ("Trái tim 2"), so it never changes in place. A rename
   * that follows a rename does not add an undo step (`rename`: one per typing session).
   */
  const commit = (after: Maze, sound: () => void, isRename = false): boolean => {
    const before = currentMaze()
    if (!before || after === before) return false
    const now = Date.now()
    const { templateMaze } = get()
    const identity = templateMaze ? { id: newId('maze'), createdAt: now } : { id: before.id, createdAt: before.createdAt }
    const copiedName = templateMaze ? copyName(templateMaze.templateId, templateMaze.name) : null
    if (!(isRename && renaming)) history.push({ ...before, ...identity, ...(copiedName ? { name: copiedName } : {}) })
    renaming = isRename
    // A copy takes the numbered name, unless this very change names it.
    const name = copiedName && after.name === before.name ? copiedName : after.name
    const saved = { ...after, ...identity, name, updatedAt: now }
    game().upsertMaze(saved)
    set({ mazeId: saved.id, templateMaze: null, lastError: null, canUndo: history.canUndo() })
    sound()
    return true
  }

  /** Commits an edit; one that changed nothing is refused with `error`. */
  const edit = (after: Maze, sound: () => void, error: MazeEditError = 'nothing') => {
    if (!commit(after, sound)) reject(error)
  }

  return {
    tool: 'wall',
    mazeId: null,
    templateMaze: null,
    preview: null,
    lastError: null,
    errorSeq: 0,
    canUndo: false,

    setTool: (tool) => {
      get().strokeCancel()
      set({ tool })
    },

    openTemplate: (templateId) => {
      const tpl = getMazeTemplate(templateId)
      if (!tpl) return
      const maze: Maze = {
        ...structuredClone(tpl.maze),
        id: `${TEMPLATE_PREFIX}${tpl.id}`,
        name: tpl.name[useApp.getState().lang],
        templateId: tpl.id,
        createdAt: 0,
        updatedAt: 0,
      }
      open(maze.id, maze)
    },

    openMaze: (id) => {
      if (!game().data.mazes.some((m) => m.id === id)) return
      open(id, null)
    },

    newMaze: (size) => {
      const maze = createEmptyMaze(size, size, { name: nextDefaultName() })
      game().upsertMaze(maze)
      open(maze.id, null)
    },

    newGenerated: (difficulty, seed = randomSeed()) => {
      const maze = generateMaze(difficulty, seed, { name: nextDefaultName() })
      game().upsertMaze(maze)
      open(maze.id, null)
    },

    close: () => {
      history.clear()
      stroke = null
      renaming = false
      set({ mazeId: null, templateMaze: null, preview: null, lastError: null, canUndo: false })
    },

    tapCell: (cell) => {
      const maze = currentMaze()
      if (!maze || !inBounds(maze, cell)) return
      const { tool } = get()
      switch (tool) {
        case 'wall':
        case 'erase':
          get().strokeStart(cell)
          get().strokeEnd()
          break
        case 'entry':
        case 'exit': {
          const result = tool === 'entry' ? setEntry(maze, cell) : setExit(maze, cell)
          if ('error' in result) reject(result.error)
          else commit(result.maze, sfx.snap) // the same door again: nothing to do, not an error
          break
        }
        case 'coin': {
          const had = maze.coins.includes(cellKey(cell))
          edit(toggleCoin(maze, cell), had ? sfx.pop : sfx.snap)
          break
        }
        case 'move':
          break
      }
    },

    strokeStart: (cell) => {
      const maze = currentMaze()
      const { tool } = get()
      if (!maze || (tool !== 'wall' && tool !== 'erase')) return
      const start = clampCell(maze, cell)
      const onInsideWall = maze.walls.includes(cellKey(start)) && !isBorder(maze, start)
      stroke = { wall: tool === 'wall', cells: [start], last: start, tapRemoves: tool === 'wall' && onInsideWall }
      set({ preview: paintWalls(maze, stroke.cells, stroke.wall) })
    },

    strokeTo: (cell) => {
      const maze = currentMaze()
      if (!stroke || !maze) return
      const to = clampCell(maze, cell)
      if (to.cx === stroke.last.cx && to.cz === stroke.last.cz) return
      stroke = { ...stroke, cells: [...stroke.cells, ...cellsBetween(stroke.last, to).slice(1)], last: to, tapRemoves: false }
      set({ preview: paintWalls(maze, stroke.cells, stroke.wall) })
    },

    strokeEnd: () => {
      const maze = currentMaze()
      const s = stroke
      stroke = null
      set({ preview: null })
      if (!s || !maze) return
      if (s.tapRemoves) edit(toggleWall(maze, s.cells[0], false), sfx.pop)
      else edit(paintWalls(maze, s.cells, s.wall), s.wall ? sfx.snap : sfx.pop)
    },

    strokeCancel: () => {
      stroke = null
      if (get().preview !== null) set({ preview: null })
    },

    generate: (difficulty, seed = randomSeed()) => {
      const maze = currentMaze()
      if (!maze) return
      const g = generateMaze(difficulty, seed, { wallColor: maze.wallColor, floorColor: maze.floorColor })
      const { templateId: _layoutSource, ...rest } = maze // the layout no longer comes from a template
      void _layoutSource
      commit({ ...rest, w: g.w, h: g.h, walls: g.walls, entry: g.entry, exit: g.exit, coins: g.coins }, sfx.success)
    },

    resize: (size) => {
      const maze = currentMaze()
      if (maze) commit(resizeMaze(maze, size, size), sfx.snap)
    },

    setWallColor: (color) => {
      const maze = currentMaze()
      if (maze && maze.wallColor !== color) commit({ ...maze, wallColor: color }, sfx.paint)
    },

    rename: (name) => {
      const maze = currentMaze()
      const clean = name.trim().slice(0, MAZE_NAME_MAX)
      if (maze && clean !== '' && clean !== maze.name) commit({ ...maze, name: clean }, () => undefined, true)
    },

    undo: () => {
      get().strokeCancel()
      renaming = false
      const maze = currentMaze()
      if (!maze) return
      const prev = history.undo(maze)
      if (prev) game().upsertMaze({ ...prev, updatedAt: Date.now() })
      set({ lastError: null, canUndo: history.canUndo() })
    },
  }
})
