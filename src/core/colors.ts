import type { LocalizedText } from './types'

export interface BrickColor {
  id: number
  name: LocalizedText
  hex: string
  glass?: boolean
}

// Order is part of the save format: bricks reference colors by index.
export const COLORS: BrickColor[] = [
  { id: 0, name: { vi: 'Trắng', en: 'White' }, hex: '#F4F4F4' },
  { id: 1, name: { vi: 'Đen', en: 'Black' }, hex: '#1B2A34' },
  { id: 2, name: { vi: 'Đỏ', en: 'Red' }, hex: '#C91A09' },
  { id: 3, name: { vi: 'Xanh dương', en: 'Blue' }, hex: '#0055BF' },
  { id: 4, name: { vi: 'Vàng', en: 'Yellow' }, hex: '#F2CD37' },
  { id: 5, name: { vi: 'Xanh lá', en: 'Green' }, hex: '#237841' },
  { id: 6, name: { vi: 'Cam', en: 'Orange' }, hex: '#FE8A18' },
  { id: 7, name: { vi: 'Xám nhạt', en: 'Light gray' }, hex: '#A0A5A9' },
  { id: 8, name: { vi: 'Xám đậm', en: 'Dark gray' }, hex: '#6C6E68' },
  { id: 9, name: { vi: 'Nâu', en: 'Brown' }, hex: '#583927' },
  { id: 10, name: { vi: 'Be', en: 'Tan' }, hex: '#E4CD9E' },
  { id: 11, name: { vi: 'Xanh nõn chuối', en: 'Lime' }, hex: '#BBE90B' },
  { id: 12, name: { vi: 'Hồng', en: 'Pink' }, hex: '#FC97AC' },
  { id: 13, name: { vi: 'Tím', en: 'Purple' }, hex: '#81007B' },
  { id: 14, name: { vi: 'Xanh ngọc', en: 'Azure' }, hex: '#36AEBF' },
  { id: 15, name: { vi: 'Kính', en: 'Glass' }, hex: '#CFE8F0', glass: true },
]

export const DEFAULT_COLOR = 2
