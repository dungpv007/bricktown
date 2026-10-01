import { describe, expect, it } from 'vitest'
import { deviceClassOf } from './deviceClass'

describe('deviceClassOf', () => {
  it('a screen whose shortest side is under 600px is a phone, portrait or landscape', () => {
    expect(deviceClassOf(412, 891)).toBe('phonePortrait')
    expect(deviceClassOf(891, 412)).toBe('phoneLandscape')
    expect(deviceClassOf(360, 640)).toBe('phonePortrait')
    expect(deviceClassOf(599, 599)).toBe('phonePortrait') // square counts as portrait, like the CSS media query
  })
  it('anything bigger is a tablet, in either orientation', () => {
    expect(deviceClassOf(1080, 810)).toBe('tablet')
    expect(deviceClassOf(810, 1080)).toBe('tablet')
    expect(deviceClassOf(600, 900)).toBe('tablet')
  })
})
