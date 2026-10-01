import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MAZE_CELL } from '../../core/maze'
import { platesToWorld } from '../../core/units'
import { HEDGE_HEIGHT, WALL_HEIGHT } from './mazeView'

/**
 * Shared maze geometry and textures, built once on first use and never disposed (the editor and
 * the drive scene both draw mazes). Not unit-tested: needs a DOM canvas / GPU, checked visually.
 */

/** Same proportions as the part studs in core/parts/geometry.ts, fewer segments (thousands of them). */
const STUD_RADIUS = 0.3
const STUD_HEIGHT = 0.17
const STUD_SEGMENTS = 7
/** Gap left around each brick so the seams between bricks show. */
const SEAM = 0.04
const BRICK_HEIGHT = platesToWorld(3)

function merge(parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  if (!merged) throw new Error(`${what}: merge failed`)
  return merged
}

/**
 * One wall cell's bricks: two courses of two whole-stud bricks each (below running along X, above
 * running along Z, like a real brick bond). With an odd cell size the halves differ by a stud
 * (6 + 7 for 13), the upper course flipped so the seams do not line up. Centred on X/Z, bottom at y = 0.
 */
function buildWallBlock(): THREE.BufferGeometry {
  const a = Math.floor(MAZE_CELL / 2)
  const b = MAZE_CELL - a
  const half = MAZE_CELL / 2
  const box = (sx: number, sz: number, x: number, y: number, z: number) =>
    new THREE.BoxGeometry(sx - 2 * SEAM, BRICK_HEIGHT - SEAM, sz - 2 * SEAM).translate(x, y, z)
  const low = BRICK_HEIGHT / 2 - SEAM / 2
  const high = BRICK_HEIGHT * 1.5 - SEAM / 2
  return merge(
    [
      box(MAZE_CELL, a, 0, low, -half + a / 2),
      box(MAZE_CELL, b, 0, low, half - b / 2),
      box(b, MAZE_CELL, -half + b / 2, high, 0),
      box(a, MAZE_CELL, half - a / 2, high, 0),
    ],
    'wall block',
  )
}

/**
 * The studs on top of a wall cell (one per stud of the cell), a separate mesh so they can skip the shadow pass (thousands
 * of them; their shadows are invisible from above). Open at the bottom, which is never seen.
 */
function buildWallStuds(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < MAZE_CELL; i++) {
    for (let j = 0; j < MAZE_CELL; j++) {
      const x = i + 0.5 - MAZE_CELL / 2
      const z = j + 0.5 - MAZE_CELL / 2
      parts.push(
        new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, STUD_SEGMENTS, 1, true).translate(x, WALL_HEIGHT + STUD_HEIGHT / 2, z),
        new THREE.CircleGeometry(STUD_RADIUS, STUD_SEGMENTS).rotateX(-Math.PI / 2).translate(x, WALL_HEIGHT + STUD_HEIGHT, z),
      )
    }
  }
  return merge(parts, 'wall studs')
}

/** A void cell's hedge: one green plate filling the cell (studs: the wall studs, moved down). Bottom at y = 0. */
function buildHedge(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(MAZE_CELL - 2 * SEAM, HEDGE_HEIGHT - SEAM, MAZE_CELL - 2 * SEAM).translate(0, (HEDGE_HEIGHT - SEAM) / 2, 0)
}

/** A gold coin: a flat round 2x2-ish tile with a raised ring, lying on the floor. Centred, bottom at y = 0. */
function buildCoin(): THREE.BufferGeometry {
  return merge(
    [
      new THREE.CylinderGeometry(1.5, 1.5, 0.3, 24).translate(0, 0.15, 0),
      new THREE.CylinderGeometry(1.0, 1.0, 0.18, 24).translate(0, 0.39, 0),
    ],
    'coin',
  )
}

/** A flat hint arrow pointing to -Z (heading 0), lying on the floor: about 60% of a cell long. */
function buildArrow(): THREE.BufferGeometry {
  const k = MAZE_CELL / 8 // drawn for an 8-stud cell
  const s = new THREE.Shape()
  s.moveTo(0, 2.6 * k)
  s.lineTo(2.2 * k, 0.2 * k)
  s.lineTo(0.9 * k, 0.2 * k)
  s.lineTo(0.9 * k, -2.4 * k)
  s.lineTo(-0.9 * k, -2.4 * k)
  s.lineTo(-0.9 * k, 0.2 * k)
  s.lineTo(-2.2 * k, 0.2 * k)
  s.closePath()
  // The shape's +Y (the tip) becomes -Z once laid flat.
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
}

let wallBlock: THREE.BufferGeometry | null = null
let wallStuds: THREE.BufferGeometry | null = null
let coin: THREE.BufferGeometry | null = null
let hedge: THREE.BufferGeometry | null = null
let arrow: THREE.BufferGeometry | null = null

export function wallBlockGeometry(): THREE.BufferGeometry {
  return (wallBlock ??= buildWallBlock())
}

export function wallStudsGeometry(): THREE.BufferGeometry {
  return (wallStuds ??= buildWallStuds())
}

export function hedgeGeometry(): THREE.BufferGeometry {
  return (hedge ??= buildHedge())
}

export function coinGeometry(): THREE.BufferGeometry {
  return (coin ??= buildCoin())
}

export function arrowGeometry(): THREE.BufferGeometry {
  return (arrow ??= buildArrow())
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

let studTexture: THREE.Texture | null = null
let checkerTexture: THREE.Texture | null = null
/** The stud texture repeated over a floor of a given size, by "sx x sz" (a handful of maze sizes). */
const floorTextures = new Map<string, THREE.Texture>()

/** One stud seen from above (near-white, multiplied by the floor colour). */
function studTile(): THREE.Texture {
  if (studTexture) return studTexture
  studTexture = canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, s, s)
    const c = s / 2
    const r = s * STUD_RADIUS
    ctx.fillStyle = '#b9b9b9' // shadow below-right
    ctx.beginPath()
    ctx.arc(c + 2.5, c + 3, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f2f2f2'
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)' // highlight top-left
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(c, c, r - 3, Math.PI * 0.9, Math.PI * 1.6)
    ctx.stroke()
  })
  return studTexture
}

/**
 * The floor's stud texture for an `sx` x `sz` stud floor: one stud per world unit, so the floor
 * looks studded without thousands of stud meshes. Cached per size (clones share the canvas image).
 */
export function floorStudTexture(sx: number, sz: number): THREE.Texture {
  const key = `${sx}x${sz}`
  let texture = floorTextures.get(key)
  if (!texture) {
    texture = studTile().clone()
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(sx, sz)
    texture.needsUpdate = true
    floorTextures.set(key, texture)
  }
  return texture
}

/** Black and white squares (4 x 4) for the finish flag and pad. */
export function checkerTexture4(): THREE.Texture {
  if (checkerTexture) return checkerTexture
  checkerTexture = canvasTexture(64, (ctx, s) => {
    const n = 4
    const step = s / n
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#1b2a34' : '#f4f4f4'
        ctx.fillRect(i * step, j * step, step, step)
      }
    }
  })
  checkerTexture.magFilter = THREE.NearestFilter
  return checkerTexture
}
