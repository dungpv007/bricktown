import { cellKey, type Cell, type Maze } from '../../core/maze'

export interface AsciiMazeMeta {
  /** Template id, stored as the maze's templateId. */
  id: string
  name: string
  wallColor: number
  floorColor?: number
}

/**
 * Build a template's maze from an ASCII picture, one string per row (z), one char per cell (x):
 * `#` wall, `.` floor, `E` entry, `X` exit, `o` coin. Entry, exit and coin cells are floor.
 */
export function mazeFromAscii(rows: readonly string[], meta: AsciiMazeMeta): Omit<Maze, 'id' | 'createdAt' | 'updatedAt'> {
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const walls: string[] = []
  const coins: string[] = []
  let entry: Cell | null = null
  let exit: Cell | null = null
  rows.forEach((row, cz) => {
    if (row.length !== w) throw new Error(`maze row ${cz} has length ${row.length}, expected ${w}`)
    for (let cx = 0; cx < w; cx++) {
      const ch = row[cx]
      const cell = { cx, cz }
      if (ch === '#') walls.push(cellKey(cell))
      else if (ch === 'E') entry = cell
      else if (ch === 'X') exit = cell
      else if (ch === 'o') coins.push(cellKey(cell))
      else if (ch !== '.') throw new Error(`unknown maze char '${ch}' at ${cx},${cz}`)
    }
  })
  return {
    name: meta.name,
    w,
    h,
    walls,
    entry,
    exit,
    coins,
    wallColor: meta.wallColor,
    floorColor: meta.floorColor,
    templateId: meta.id,
  }
}
