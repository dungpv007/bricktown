import type { LocalizedText } from './types'

export interface BrickColor {
  id: number
  name: LocalizedText
  hex: string
  /** See-through: rendered tinted with the transparent material (glass, siren lights...). */
  trans?: true
  /** Shiny metal (silver, gold): rendered with the metallic material. */
  metal?: true
}

/** Which shared material a colour renders with; bricks are grouped (instanced / baked) by it. */
export type MaterialKind = 'opaque' | 'trans' | 'metal'

// Order is part of the save format: bricks reference colors by index. Only ever append.
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
  { id: 15, name: { vi: 'Kính', en: 'Glass' }, hex: '#CFE8F0', trans: true },
  { id: 16, name: { vi: 'Đỏ trong', en: 'Trans red' }, hex: '#C91A09', trans: true },
  { id: 17, name: { vi: 'Xanh dương trong', en: 'Trans blue' }, hex: '#0055BF', trans: true },
  { id: 18, name: { vi: 'Vàng trong', en: 'Trans yellow' }, hex: '#F5CD2F', trans: true },
  { id: 19, name: { vi: 'Xanh lá trong', en: 'Trans green' }, hex: '#237841', trans: true },
  { id: 20, name: { vi: 'Cam trong', en: 'Trans orange' }, hex: '#F08F1C', trans: true },
  { id: 21, name: { vi: 'Xanh dương đậm', en: 'Dark blue' }, hex: '#0A3463' },
  { id: 22, name: { vi: 'Đỏ đậm', en: 'Dark red' }, hex: '#720E0F' },
  { id: 23, name: { vi: 'Xanh dương vừa', en: 'Medium blue' }, hex: '#5A93DB' },
  { id: 24, name: { vi: 'Xám xanh nhạt', en: 'Light bluish gray' }, hex: '#C8C8C8' },
  { id: 25, name: { vi: 'Be đậm', en: 'Dark tan' }, hex: '#958A73' },
  { id: 26, name: { vi: 'Xanh rêu nhạt', en: 'Sand green' }, hex: '#A0BCAC' },
  { id: 27, name: { vi: 'Tím oải hương', en: 'Lavender' }, hex: '#E1D5ED' },
  { id: 28, name: { vi: 'Bạc', en: 'Silver' }, hex: '#A5A9B4', metal: true },
  { id: 29, name: { vi: 'Vàng kim', en: 'Gold' }, hex: '#DBAC34', metal: true },
]

/** Material kind of colour index `c`; an unknown index renders opaque. */
export function colorMaterialKind(c: number): MaterialKind {
  const color = COLORS[c]
  if (color?.trans) return 'trans'
  if (color?.metal) return 'metal'
  return 'opaque'
}

export const DEFAULT_COLOR = 2

/** Clear glass: the nearly white transparent colour (windows). */
export const GLASS_COLOR = 15
