import { createEmptyMaze, isBorder, isCorner, parseCellKey, setEntry, setExit, type Cell, type Maze } from './maze'

/**
 * Cells from `a` to `b` (both included) where each step goes to a 4-neighbour, so a fast finger
 * that skips cells between two pointer events still paints a wall without diagonal gaps.
 */
export function cellsBetween(a: Cell, b: Cell): Cell[] {
  const dx = b.cx - a.cx
  const dz = b.cz - a.cz
  const steps = Math.abs(dx) + Math.abs(dz)
  const out: Cell[] = [{ cx: a.cx, cz: a.cz }]
  let { cx, cz } = a
  for (let i = 1; i <= steps; i++) {
    // Step along whichever axis lags furthest behind the straight line from a to b.
    const t = i / steps
    const behindX = Math.abs(a.cx + dx * t - cx)
    const behindZ = Math.abs(a.cz + dz * t - cz)
    if (cx !== b.cx && (behindX >= behindZ || cz === b.cz)) cx += Math.sign(dx)
    else cz += Math.sign(dz)
    out.push({ cx, cz })
  }
  return out
}

/**
 * The maze on a `w` x `h` grid (odd, 7..21; RangeError otherwise). The inside is kept where it
 * fits (the old outer ring becomes open floor when growing) and a new solid outer ring is built.
 * A door on the west / north edge keeps its cell; one on the east / south edge moves to the new
 * edge; a door that then falls outside the grid or on a corner is dropped. Same maze for the same size.
 */
export function resizeMaze(maze: Maze, w: number, h: number): Maze {
  if (w === maze.w && h === maze.h) return maze
  const fresh = createEmptyMaze(w, h) // validates the size; supplies the new outer ring
  const dims = { w, h }
  const inside = (k: string) => {
    const cell = parseCellKey(k)
    return !isBorder(maze, cell) && cell.cx < w - 1 && cell.cz < h - 1
  }
  const walls = [...fresh.walls, ...maze.walls.filter(inside)]
  let out: Maze = { ...maze, w, h, walls, entry: null, exit: null, coins: maze.coins.filter(inside) }

  const moveDoor = (door: Cell | null): Cell | null => {
    if (!door) return null
    const cell = {
      cx: door.cx === maze.w - 1 ? w - 1 : door.cx,
      cz: door.cz === maze.h - 1 ? h - 1 : door.cz,
    }
    return isBorder(dims, cell) && !isCorner(dims, cell) ? cell : null
  }
  const entry = moveDoor(maze.entry)
  const exit = moveDoor(maze.exit)
  if (entry) {
    const r = setEntry(out, entry)
    if ('maze' in r) out = r.maze
  }
  if (exit) {
    const r = setExit(out, exit)
    if ('maze' in r) out = r.maze
  }
  return out
}
