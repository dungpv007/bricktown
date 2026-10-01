import { cellsOf, footprint } from './rotation'
import { getPart } from './parts/catalog'
import type { Brick } from './types'

const key = (x: number, y: number, z: number) => `${x},${y},${z}`

/** Voxel grid (studs x plates x studs) mapping each occupied cell to its brick id. */
export class Occupancy {
  private readonly cells = new Map<string, string>()

  static from(bricks: Brick[]): Occupancy {
    const occ = new Occupancy()
    for (const brick of bricks) occ.add(brick)
    return occ
  }

  add(brick: Brick): void {
    for (const [x, y, z] of cellsOf(brick)) this.cells.set(key(x, y, z), brick.id)
  }

  remove(brick: Brick): void {
    for (const [x, y, z] of cellsOf(brick)) {
      const k = key(x, y, z)
      if (this.cells.get(k) === brick.id) this.cells.delete(k)
    }
  }

  get(x: number, y: number, z: number): string | undefined {
    return this.cells.get(key(x, y, z))
  }

  /** True when any voxel of `brick` is occupied by a brick other than `ignoreId`. */
  collides(brick: Brick, ignoreId?: string): boolean {
    return cellsOf(brick).some(([x, y, z]) => {
      const id = this.get(x, y, z)
      return id !== undefined && id !== ignoreId
    })
  }

  /** On the ground, or at least one footprint cell rests on another brick directly below. */
  isSupported(brick: Brick, ignoreId?: string): boolean {
    if (brick.y === 0) return true
    const { fx, fz } = footprint(getPart(brick.p), brick.r)
    for (let dx = 0; dx < fx; dx++) {
      for (let dz = 0; dz < fz; dz++) {
        const id = this.get(brick.x + dx, brick.y - 1, brick.z + dz)
        if (id !== undefined && id !== ignoreId) return true
      }
    }
    return false
  }
}
