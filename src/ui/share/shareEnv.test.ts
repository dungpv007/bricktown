import { describe, expect, it } from 'vitest'
import { isLocalBase, shareBase } from './shareEnv'

describe('shareBase', () => {
  it('uses the configured public address, else this page', () => {
    expect(shareBase('https://bricktown.example/', 'http://localhost:5173')).toBe('https://bricktown.example/')
    expect(shareBase(undefined, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(shareBase('', 'https://a.example')).toBe('https://a.example')
  })
})

describe('isLocalBase', () => {
  it('is true for addresses only this device or this network can open', () => {
    for (const base of [
      'http://localhost:5173', 'http://127.0.0.1:4173', 'http://[::1]:5173', 'http://192.168.1.20:5173',
      'http://10.0.0.5', 'http://172.16.3.4', 'http://172.31.255.1', 'http://ipad.local:5173', 'http://169.254.1.1',
      'not a url',
    ]) {
      expect(isLocalBase(base), base).toBe(true)
    }
  })
  it('is false for public addresses', () => {
    for (const base of ['https://bricktown.example', 'https://user.github.io/bricktown', 'http://172.32.0.1', 'http://8.8.8.8']) {
      expect(isLocalBase(base), base).toBe(false)
    }
  })
})
