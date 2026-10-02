import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { getTemplate } from '../content/templates'
import { bakeBricksUncached, bakedGeometries } from '../core/bake'
import { isSolidBox, placementWorldBox } from '../core/drive'
import type { Baseplate, Brick, Rot } from '../core/types'
import { bakedModelBox, placementMatrix } from './placementTransform'

const brick = (id: string, p: string, x: number, y: number, z: number, r: Rot = 0): Brick => ({ id, p, x, y, z, r, c: 2 })

interface Model {
  name: string
  baseplate: Baseplate
  bricks: Brick[]
}

const template = (id: string): Model => {
  const t = getTemplate(id)!
  return { name: `template ${id} (${t.baseplate.w}x${t.baseplate.d})`, baseplate: t.baseplate, bricks: t.bricks }
}

const MODELS: Model[] = [
  template('fire_truck'), // non-square 8x16
  template('house_small'), // square
  {
    // Off-centre, non-square, not a whole number of cells: the model box is not centred on the baseplate.
    name: 'lopsided 12x20',
    baseplate: { w: 12, d: 20 },
    bricks: [brick('a', 'brick_2x4', 1, 0, 3, 1), brick('b', 'plate_2x2', 7, 3, 12), brick('c', 'brick_1x2', 3, 0, 16, 3)],
  },
]

const ROTS: Rot[] = [0, 1, 2, 3]
/** [cx, cz, scale (absent = unscaled)] */
const SPOTS: Array<[number, number, number?]> = [
  [0, 0],
  [3, 5],
  [11, 2],
  [2, 1, 3],
  [7, 4, 10],
]

// Baked vertices are float32, hence 4 digits.
const near = (actual: number[], expected: number[]) => actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 4))

describe('placementMatrix agrees with placementWorldBox', () => {
  for (const model of MODELS) {
    describe(model.name, () => {
      const baked = bakeBricksUncached(model.bricks)
      const box = bakedModelBox(baked)!

      it('has a model box', () => {
        expect(box).not.toBeNull()
      })

      for (const rot of ROTS) {
        for (const [cx, cz, s] of SPOTS) {
          it(`rot ${rot} at cell (${cx}, ${cz})${s ? ` x${s}` : ''}`, () => {
            const p = s ? { cx, cz, rot, s } : { cx, cz, rot }
            const matrix = placementMatrix(new THREE.Matrix4(), p, model.baseplate)
            const expected = placementWorldBox(p, model.baseplate, box)

            // Every vertex of the baked model through the render matrix.
            const world = new THREE.Box3()
            for (const [, g] of bakedGeometries(baked)) {
              const moved = g.clone().applyMatrix4(matrix)
              moved.computeBoundingBox()
              world.union(moved.boundingBox!)
              moved.dispose()
            }
            near(world.min.toArray(), expected.min)
            near(world.max.toArray(), expected.max)

            // The model box corners alone give the same box (what the collider code relies on).
            const corners = new THREE.Box3()
            for (const x of [box.min[0], box.max[0]])
              for (const y of [box.min[1], box.max[1]])
                for (const z of [box.min[2], box.max[2]])
                  corners.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(matrix))
            near(corners.min.toArray(), expected.min)
            near(corners.max.toArray(), expected.max)
          })
        }
      }
    })
  }

  it('keeps the model centre on the centre of its rotated footprint cells', () => {
    // An 8x16 model covers 1x2 cells; turned a quarter it covers 2x1 cells from the same cell.
    const baseplate = { w: 8, d: 16 }
    const m = placementMatrix(new THREE.Matrix4(), { cx: 4, cz: 6, rot: 1 }, baseplate)
    const c = new THREE.Vector3(baseplate.w / 2, 0, baseplate.d / 2).applyMatrix4(m)
    // Footprint cells (4..5, 6): centre (5 * 8, 6.5 * 8).
    expect(c.x).toBeCloseTo(40, 6)
    expect(c.z).toBeCloseTo(52, 6)
  })

  it('a scaled model grows around the centre of its scaled footprint, from the ground', () => {
    // 8x16 x3 = 24x48 studs: 3x6 cells, turned a quarter 6x3 cells from (4, 6): centre (7 * 8, 7.5 * 8).
    const baseplate = { w: 8, d: 16 }
    const m = placementMatrix(new THREE.Matrix4(), { cx: 4, cz: 6, rot: 1, s: 3 }, baseplate)
    const c = new THREE.Vector3(baseplate.w / 2, 0, baseplate.d / 2).applyMatrix4(m)
    expect(c.x).toBeCloseTo(56, 6)
    expect(c.y).toBeCloseTo(0, 6)
    expect(c.z).toBeCloseTo(60, 6)
    const top = new THREE.Vector3(baseplate.w / 2, 2, baseplate.d / 2).applyMatrix4(m)
    expect(top.y).toBeCloseTo(6, 6)
  })
})

describe('flat placements', () => {
  const boxOf = (...bricks: Brick[]) => bakedModelBox(bakeBricksUncached(bricks))!

  it('a one-plate garden (studs included) is driven over, anything taller blocks the car', () => {
    expect(isSolidBox(boxOf(brick('g', 'plate_4x4', 0, 0, 0)))).toBe(false)
    expect(isSolidBox(boxOf(brick('g', 'plate_4x4', 0, 0, 0), brick('h', 'plate_2x2', 0, 1, 0)))).toBe(true)
    expect(isSolidBox(boxOf(brick('b', 'brick_1x1', 0, 0, 0)))).toBe(true)
  })

  it('a scaled-up garden is tall enough to block the car (the placed box counts)', () => {
    const garden = boxOf(brick('g', 'plate_4x4', 0, 0, 0))
    const plate = { w: 8, d: 8 }
    expect(isSolidBox(placementWorldBox({ cx: 0, cz: 0, rot: 0 }, plate, garden))).toBe(false)
    expect(isSolidBox(placementWorldBox({ cx: 0, cz: 0, rot: 0, s: 2 }, plate, garden))).toBe(true)
  })
})
