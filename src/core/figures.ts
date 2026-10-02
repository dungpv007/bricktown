import { COLORS, colorMaterialKind } from './colors'
import type { Brick, FigAccessory, FigFace, FigHat, FigPrint, FigStyle, LocalizedText } from './types'

/**
 * Minifigures: a brick-like part (`minifig`, 2x1 studs, 12 plates tall) whose look comes from its
 * `Brick.fig` style instead of the brick colour. Equal styles share one geometry (see `figKey`), so
 * a room full of identical figures is still one instanced draw per style.
 */

export const MINIFIG_PART = 'minifig'

/** Classic minifigure yellow: heads and hands, whatever the style. */
export const SKIN_HEX = '#F2CD37'

export const FIG_FACES: readonly FigFace[] = ['smile', 'grin', 'wink', 'surprised', 'beard', 'glasses']
export const FIG_HATS: readonly FigHat[] = [
  'none', 'hair_short', 'hair_long', 'hair_ponytail', 'cap', 'police', 'chef', 'fire',
  'construction', 'space', 'crown', 'robber_cap',
]
export const FIG_PRINTS: readonly FigPrint[] = ['plain', 'police', 'chef', 'fire', 'space', 'vest', 'stripes', 'suit', 'apron']
export const FIG_ACCESSORIES: readonly FigAccessory[] = ['none', 'tool', 'pan', 'radio', 'flashlight']

/** The colour a hat or hairpiece gets when the style does not say. */
export const DEFAULT_HAT_COLOR: Record<FigHat, number> = {
  none: 0,
  hair_short: 9,
  hair_long: 9,
  hair_ponytail: 9,
  cap: 2,
  police: 21,
  chef: 0,
  fire: 2,
  construction: 0,
  space: 0,
  crown: 29,
  robber_cap: 1,
}

export interface FigPreset {
  id: string
  name: LocalizedText
  style: FigStyle
}

/** Ready-made figures, in palette order. Ids are stable: templates refer to them (`b.fig(id, ...)`). */
export const FIG_PRESETS: FigPreset[] = [
  {
    id: 'police',
    name: { vi: 'Cảnh sát', en: 'Police officer' },
    style: { torso: 21, legs: 1, face: 'smile', hat: 'police', hatColor: 0, print: 'police', accessory: 'radio' },
  },
  {
    id: 'police_chief',
    name: { vi: 'Cảnh sát trưởng', en: 'Police chief' },
    style: { torso: 21, legs: 21, face: 'beard', hat: 'police', print: 'police', accessory: 'flashlight' },
  },
  {
    id: 'robber',
    name: { vi: 'Tên trộm', en: 'Robber' },
    style: { torso: 0, legs: 1, face: 'grin', hat: 'robber_cap', print: 'stripes' },
  },
  {
    id: 'chef',
    name: { vi: 'Đầu bếp', en: 'Chef' },
    style: { torso: 0, legs: 8, face: 'beard', hat: 'chef', print: 'chef', accessory: 'pan' },
  },
  {
    id: 'waiter',
    name: { vi: 'Bồi bàn', en: 'Waiter' },
    style: { torso: 0, legs: 1, face: 'smile', hat: 'hair_short', hatColor: 1, print: 'apron' },
  },
  {
    id: 'customer',
    name: { vi: 'Khách hàng', en: 'Customer' },
    style: { torso: 14, legs: 3, face: 'grin', hat: 'hair_long', print: 'plain' },
  },
  {
    id: 'customer2',
    name: { vi: 'Khách hàng 2', en: 'Customer 2' },
    style: { torso: 5, legs: 10, face: 'wink', hat: 'cap', hatColor: 3, print: 'plain' },
  },
  {
    id: 'firefighter',
    name: { vi: 'Lính cứu hỏa', en: 'Firefighter' },
    style: { torso: 1, legs: 1, face: 'surprised', hat: 'fire', print: 'fire', accessory: 'flashlight' },
  },
  {
    id: 'astronaut',
    name: { vi: 'Phi hành gia', en: 'Astronaut' },
    style: { torso: 0, legs: 0, face: 'smile', hat: 'space', print: 'space' },
  },
  {
    id: 'construction',
    name: { vi: 'Công nhân xây dựng', en: 'Construction worker' },
    style: { torso: 6, legs: 3, face: 'grin', hat: 'construction', print: 'vest', accessory: 'tool' },
  },
  {
    id: 'doctor',
    name: { vi: 'Bác sĩ', en: 'Doctor' },
    style: { torso: 0, legs: 24, face: 'glasses', hat: 'hair_short', print: 'suit' },
  },
  {
    id: 'kid',
    name: { vi: 'Em bé', en: 'Kid' },
    style: { torso: 11, legs: 3, face: 'grin', hat: 'hair_ponytail', hatColor: 6, print: 'plain' },
  },
  {
    id: 'sushi_chef',
    name: { vi: 'Đầu bếp sushi', en: 'Sushi chef' },
    style: { torso: 0, legs: 1, arms: 0, face: 'smile', hat: 'chef', print: 'apron' },
  },
  // Shop items (play/unlocks): locked in the palettes until bought with role-play coins. They only
  // combine existing hats, prints and colours, so no save value is new.
  {
    id: 'king',
    name: { vi: 'Nhà vua', en: 'King' },
    style: { torso: 22, legs: 1, arms: 22, face: 'beard', hat: 'crown', print: 'suit' },
  },
  {
    id: 'princess',
    name: { vi: 'Công chúa', en: 'Princess' },
    style: { torso: 12, legs: 27, face: 'smile', hat: 'crown', print: 'plain' },
  },
  {
    id: 'superstar',
    name: { vi: 'Siêu sao', en: 'Superstar' },
    style: { torso: 29, legs: 1, face: 'glasses', hat: 'cap', hatColor: 13, print: 'stripes' },
  },
]

const PRESET_BY_ID: Record<string, FigPreset> = Object.fromEntries(FIG_PRESETS.map((p) => [p.id, p]))

/** A copy of preset `id`'s style; throws for an unknown id (a typo in a template must fail loudly). */
export function figPreset(id: string): FigStyle {
  const p = PRESET_BY_ID[id]
  if (!p) throw new Error(`Unknown figure preset: ${id}`)
  return { ...p.style }
}

/** The look of a minifigure brick that carries no style. */
export const DEFAULT_FIG: FigStyle = figPreset(FIG_PRESETS[0].id)

/** Every field filled in with its default: what a style actually looks like. */
export function canonicalFig(s: FigStyle): Required<FigStyle> {
  return {
    torso: s.torso,
    legs: s.legs,
    arms: s.arms ?? s.torso,
    face: s.face,
    hat: s.hat,
    // Without a hat the colour shows nowhere: one value, so bare heads share a geometry.
    hatColor: s.hat === 'none' ? 0 : (s.hatColor ?? DEFAULT_HAT_COLOR[s.hat]),
    print: s.print,
    accessory: s.accessory ?? 'none',
  }
}

/**
 * Identity of a style's look: equal keys draw identically (geometry caches, instancing, bakes).
 * Stable across versions: `torso.legs.arms.face.hat.hatColor.print.accessory`, defaults filled in.
 */
export function figKey(s: FigStyle): string {
  const c = canonicalFig(s)
  return `${c.torso}.${c.legs}.${c.arms}.${c.face}.${c.hat}.${c.hatColor}.${c.print}.${c.accessory}`
}

const isColor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && COLORS[v] !== undefined
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)

/**
 * A style from untrusted data (a save file): null unless torso, legs, face, hat and print are
 * valid; invalid optional fields and unknown keys are dropped.
 */
export function parseFig(v: unknown): FigStyle | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (!isColor(o.torso) || !isColor(o.legs) || !oneOf(FIG_FACES, o.face) || !oneOf(FIG_HATS, o.hat) || !oneOf(FIG_PRINTS, o.print)) {
    return null
  }
  const out: FigStyle = { torso: o.torso, legs: o.legs, face: o.face, hat: o.hat, print: o.print }
  if (isColor(o.arms)) out.arms = o.arms
  if (isColor(o.hatColor)) out.hatColor = o.hatColor
  if (oneOf(FIG_ACCESSORIES, o.accessory)) out.accessory = o.accessory
  return out
}

export const isFigure = (b: Pick<Brick, 'p'>): boolean => b.p === MINIFIG_PART

/** The look of a minifigure brick. */
export const figOf = (b: Pick<Brick, 'fig'>): FigStyle => b.fig ?? DEFAULT_FIG

/**
 * Figure colour rule: a figure wears solid and metallic colours (a gold crown, a silver helmet).
 * Its body is one vertex-coloured mesh, so a metallic colour shows as its flat colour everywhere
 * (Workshop, Guided, City, thumbnails), never with the shiny material. See-through colours are not
 * figure colours: painting a figure with one gives it the nearest solid colour instead.
 */
export const isFigColor = (c: number): boolean => COLORS[c] !== undefined && colorMaterialKind(c) !== 'trans'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** `c` if a figure can wear it, otherwise the solid colour closest to it (see `isFigColor`). */
export function figColor(c: number): number {
  const color = COLORS[c]
  if (!color || isFigColor(c)) return c
  const [r, g, b] = rgb(color.hex)
  let best = c
  let bestDist = Infinity
  for (const other of COLORS) {
    if (colorMaterialKind(other.id) !== 'opaque') continue
    const [r2, g2, b2] = rgb(other.hex)
    const dist = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2
    if (dist < bestDist) {
      best = other.id
      bestDist = dist
    }
  }
  return best
}

/** The style with a new torso colour (what painting a figure does), following `figColor`. */
export const withTorso = (s: FigStyle, torso: number): FigStyle => ({ ...s, torso: figColor(torso) })
