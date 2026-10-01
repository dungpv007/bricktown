import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CELL } from '../../core/city'
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
 * One wall cell's bricks: two courses (8x4 bricks below running along X, 4x8 above running along Z,
 * like a real brick bond). Centred on X/Z, bottom at y = 0.
 */
function buildWallBlock(): THREE.BufferGeometry {
  const q = CELL / 4
  const box = (sx: number, sz: number, x: number, y: number, z: number) =>
    new THREE.BoxGeometry(sx - 2 * SEAM, BRICK_HEIGHT - SEAM, sz - 2 * SEAM).translate(x, y, z)
  const low = BRICK_HEIGHT / 2 - SEAM / 2
  const high = BRICK_HEIGHT * 1.5 - SEAM / 2
  return merge(
    [box(CELL, CELL / 2, 0, low, -q), box(CELL, CELL / 2, 0, low, q), box(CELL / 2, CELL, -q, high, 0), box(CELL / 2, CELL, q, high, 0)],
    'wall block',
  )
}

/**
 * The 8x8 studs on top of a wall cell, a separate mesh so they can skip the shadow pass (thousands
 * of them; their shadows are invisible from above). Open at the bottom, which is never seen.
 */
function buildWallStuds(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < CELL; i++) {
    for (let j = 0; j < CELL; j++) {
      const x = i + 0.5 - CELL / 2
      const z = j + 0.5 - CELL / 2
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
  return new THREE.BoxGeometry(CELL - 2 * SEAM, HEDGE_HEIGHT - SEAM, CELL - 2 * SEAM).translate(0, (HEDGE_HEIGHT - SEAM) / 2, 0)
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

let wallBlock: THREE.BufferGeometry | null = null
let wallStuds: THREE.BufferGeometry | null = null
let coin: THREE.BufferGeometry | null = null
let hedge: THREE.BufferGeometry | null = null

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

/**
 * One stud seen from above (near-white, multiplied by the floor colour), repeated once per stud:
 * the floor looks studded without thousands of stud meshes.
 */
export function floorStudTexture(): THREE.Texture {
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
  studTexture.wrapS = THREE.RepeatWrapping
  studTexture.wrapT = THREE.RepeatWrapping
  return studTexture
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
