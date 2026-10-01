import { COLORS } from '../../core/colors'
import { DEFAULT_MAZE_FLOOR_COLOR, parseCellKey, type Cell, type Maze } from '../../core/maze'
import { voidWalls } from '../../core/mazeRun'

/**
 * Top-down picture of a maze as a PNG data URL, drawn on a 2D canvas (no WebGL needed, so it is
 * instant and works everywhere). '' when there is no canvas. Cached by `key`, which must change
 * whenever the maze does (e.g. id + updatedAt). Checked visually, not unit-tested (needs a DOM).
 */

export const MAZE_THUMB_SIZE = 160
const MAX_CACHED = 64
const cache = new Map<string, string>()

const ENTRY = COLORS[11].hex
const EXIT_DARK = '#1b2a34'
const EXIT_LIGHT = '#f4f4f4'
const GOLD = '#f2c230'
const GOLD_EDGE = '#9a7412'
/** Void walls are low hedges in the 3D view (see `voidWalls`). */
const HEDGE = COLORS[5].hex

function draw(maze: Maze): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = MAZE_THUMB_SIZE
  canvas.height = MAZE_THUMB_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const cell = Math.floor(MAZE_THUMB_SIZE / Math.max(maze.w, maze.h))
  const ox = Math.floor((MAZE_THUMB_SIZE - cell * maze.w) / 2)
  const oz = Math.floor((MAZE_THUMB_SIZE - cell * maze.h) / 2)
  const rect = ({ cx, cz }: Cell, inset = 0) =>
    [ox + cx * cell + inset, oz + cz * cell + inset, cell - 2 * inset, cell - 2 * inset] as const

  ctx.fillStyle = COLORS[maze.floorColor ?? DEFAULT_MAZE_FLOOR_COLOR]?.hex ?? '#c8c8c8'
  ctx.fillRect(ox, oz, cell * maze.w, cell * maze.h)

  const wall = COLORS[maze.wallColor]?.hex ?? '#fe8a18'
  const walls = new Set(maze.walls)
  const hedges = voidWalls(maze)
  for (const key of maze.walls) {
    const c = parseCellKey(key)
    if (hedges.has(key)) {
      ctx.fillStyle = HEDGE
      ctx.fillRect(...rect(c))
      continue
    }
    ctx.fillStyle = wall
    ctx.fillRect(...rect(c))
    // A darker lower edge where the wall meets floor gives the blocks a little height.
    if (c.cz + 1 < maze.h && !walls.has(`${c.cx},${c.cz + 1}`)) {
      const [x, y, w, h] = rect(c)
      const edge = Math.max(1, Math.round(cell / 5))
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(x, y + h - edge, w, edge)
    }
  }

  if (maze.entry) {
    ctx.fillStyle = ENTRY
    ctx.fillRect(...rect(maze.entry, 1))
  }
  if (maze.exit) {
    const [x, y, w, h] = rect(maze.exit, 1)
    const half = w / 2
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? EXIT_DARK : EXIT_LIGHT
        ctx.fillRect(x + i * half, y + j * (h / 2), half, h / 2)
      }
    }
  }
  for (const key of maze.coins) {
    const [x, y, w] = rect(parseCellKey(key))
    ctx.beginPath()
    ctx.arc(x + w / 2, y + w / 2, Math.max(1.5, w * 0.3), 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.lineWidth = Math.max(1, w / 10)
    ctx.strokeStyle = GOLD_EDGE
    ctx.stroke()
  }
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

export function mazeThumbnail(key: string, maze: Maze): string {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const url = draw(maze)
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string)
  cache.set(key, url)
  return url
}
