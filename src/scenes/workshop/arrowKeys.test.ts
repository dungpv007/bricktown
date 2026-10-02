import { describe, expect, it } from 'vitest'
import { arrowStep, isArrowKey, type ArrowKey } from './arrowKeys'

/** The camera's look direction on the ground for an orbit angle: the camera stands at (sin a, cos a) from the target. */
const lookingFrom = (azimuth: number) => ({ x: -Math.sin(azimuth), z: -Math.cos(azimuth) })

const steps = (forward: { x: number; z: number }) => {
  const keys: ArrowKey[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
  return Object.fromEntries(keys.map((k) => [k, arrowStep(forward, k)]))
}

describe('arrowStep', () => {
  it('the default view (camera in front, looking along -z): up goes away, right goes +x', () => {
    expect(steps({ x: 0, z: -1 })).toEqual({
      ArrowUp: { dx: 0, dz: -1 },
      ArrowDown: { dx: 0, dz: 1 },
      ArrowLeft: { dx: -1, dz: 0 },
      ArrowRight: { dx: 1, dz: 0 },
    })
  })

  it('turning the camera a quarter at a time keeps up / down / left / right true on screen', () => {
    // Camera on the +x side, looking along -x: away is -x, screen right is -z.
    expect(steps({ x: -1, z: 0 })).toEqual({
      ArrowUp: { dx: -1, dz: 0 },
      ArrowDown: { dx: 1, dz: 0 },
      ArrowLeft: { dx: 0, dz: 1 },
      ArrowRight: { dx: 0, dz: -1 },
    })
    // Camera behind the model, looking along +z: right is -x.
    expect(steps({ x: 0, z: 1 })).toEqual({
      ArrowUp: { dx: 0, dz: 1 },
      ArrowDown: { dx: 0, dz: -1 },
      ArrowLeft: { dx: 1, dz: 0 },
      ArrowRight: { dx: -1, dz: 0 },
    })
    // Camera on the -x side, looking along +x: right is +z.
    expect(steps({ x: 1, z: 0 })).toEqual({
      ArrowUp: { dx: 1, dz: 0 },
      ArrowDown: { dx: -1, dz: 0 },
      ArrowLeft: { dx: 0, dz: -1 },
      ArrowRight: { dx: 0, dz: 1 },
    })
  })

  it('snaps an oblique view to the nearest axis, whatever its length', () => {
    // The workshop's default camera sits at (+0.45, +0.75) from the target: it looks mostly along -z.
    expect(arrowStep({ x: -0.45, z: -0.75 }, 'ArrowUp')).toEqual({ dx: 0, dz: -1 })
    expect(arrowStep({ x: -9, z: -5 }, 'ArrowUp')).toEqual({ dx: -1, dz: 0 })
    expect(arrowStep({ x: 0.001, z: 0.0001 }, 'ArrowRight')).toEqual({ dx: 0, dz: 1 })
    // Around the full circle the step is always one axis unit, and up and down are opposite.
    for (let deg = 0; deg < 360; deg += 7) {
      const f = lookingFrom((deg * Math.PI) / 180)
      const up = arrowStep(f, 'ArrowUp')
      const down = arrowStep(f, 'ArrowDown')
      expect(Math.abs(up.dx) + Math.abs(up.dz)).toBe(1)
      expect(down).toEqual({ dx: -up.dx + 0, dz: -up.dz + 0 })
      // Left is up turned a quarter anticlockwise, right a quarter clockwise: they are opposite too.
      const left = arrowStep(f, 'ArrowLeft')
      expect(arrowStep(f, 'ArrowRight')).toEqual({ dx: -left.dx + 0, dz: -left.dz + 0 })
    }
  })

  it('azimuth sweep: up always points to the side the camera looks at', () => {
    expect(arrowStep(lookingFrom(0), 'ArrowUp')).toEqual({ dx: 0, dz: -1 })
    expect(arrowStep(lookingFrom(Math.PI / 2), 'ArrowUp')).toEqual({ dx: -1, dz: 0 })
    expect(arrowStep(lookingFrom(Math.PI), 'ArrowUp')).toEqual({ dx: 0, dz: 1 })
    expect(arrowStep(lookingFrom(-Math.PI / 2), 'ArrowUp')).toEqual({ dx: 1, dz: 0 })
  })

  it('falls back to the default view for a zero or broken direction', () => {
    expect(arrowStep({ x: 0, z: 0 }, 'ArrowUp')).toEqual({ dx: 0, dz: -1 })
    expect(arrowStep({ x: NaN, z: 1 }, 'ArrowRight')).toEqual({ dx: 1, dz: 0 })
  })

  it('isArrowKey tells the four arrows from other keys', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].every(isArrowKey)).toBe(true)
    expect(['a', ' ', 'Enter', 'arrowup'].some(isArrowKey)).toBe(false)
  })
})
