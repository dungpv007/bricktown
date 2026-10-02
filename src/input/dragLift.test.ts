import { describe, expect, it } from 'vitest'
import { FALL_END, LAND_HEIGHT, LAND_MS, LIFT_TOUCH_PX, POP_MS, RETURN_MS, avatarOffset, easeOut, landingPose, type LandingPose } from './dragLift'

const pose = (): LandingPose => ({ y: 0, sxz: 1, sy: 1, puff: -1 })

describe('avatarOffset', () => {
  it('centres the lifted part across the pointer', () => {
    expect(avatarOffset(80, true).dx).toBe(-40)
    expect(avatarOffset(80, false).dx).toBe(-40)
  })

  it('keeps the whole part above a finger, with a gap', () => {
    const { dy } = avatarOffset(80, true)
    expect(dy).toBe(-(80 + LIFT_TOUCH_PX))
    expect(dy + 80).toBeLessThan(0) // its bottom edge is above the touch point
  })

  it('floats closer to a mouse cursor than to a finger', () => {
    expect(avatarOffset(80, false).dy).toBeGreaterThan(avatarOffset(80, true).dy)
    expect(avatarOffset(80, false).dy + 80).toBeLessThan(0)
  })
})

describe('landingPose', () => {
  it('starts above the spot and falls onto it', () => {
    const p = pose()
    expect(landingPose(0, p).y).toBe(LAND_HEIGHT)
    expect(landingPose(FALL_END / 2, p).y).toBeGreaterThan(0)
    expect(landingPose(FALL_END / 2, p).y).toBeLessThan(LAND_HEIGHT)
    expect(landingPose(FALL_END, p).y).toBe(0)
    expect(landingPose(FALL_END / 2, p).puff).toBe(-1) // no dust before touching down
  })

  it('squashes on touch-down, bounces once, then settles at full size', () => {
    const p = pose()
    const squashAt = FALL_END + (1 - FALL_END) * 0.25
    const bounceAt = FALL_END + (1 - FALL_END) * 0.75
    landingPose(squashAt, p)
    expect(p.sy).toBeLessThan(0.9)
    expect(p.sxz).toBeGreaterThan(1)
    landingPose(bounceAt, p)
    expect(p.sy).toBeGreaterThan(1)
    landingPose(1, p)
    expect(p).toEqual({ y: 0, sxz: 1, sy: 1, puff: 1 })
  })

  it('clamps outside 0..1 and writes into the given object', () => {
    const p = pose()
    expect(landingPose(-1, p)).toBe(p)
    expect(p.y).toBe(LAND_HEIGHT)
    expect(landingPose(5, p)).toEqual({ y: 0, sxz: 1, sy: 1, puff: 1 })
  })
})

describe('timing', () => {
  it('keeps every animation within 300 ms', () => {
    for (const ms of [POP_MS, RETURN_MS, LAND_MS]) expect(ms).toBeLessThanOrEqual(300)
  })

  it('eases the puff out', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })
})
