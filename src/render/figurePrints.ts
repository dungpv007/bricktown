import { TORSO_PRINT_ASPECT, TORSO_PRINT_TOP_WIDTH } from '../core/parts/figureGeometry'
import type { PrintDrawer } from './printAtlas'

/**
 * Minifigure faces and torso prints for the print atlas (see core/prints: `fig_face_*`,
 * `fig_torso_*`). Icon style, no text; every position and size is a fraction of the cell, so the
 * pictures follow the atlas resolution.
 *
 * Faces are wrapped round the front half of the head: the cell's width spans 180 degrees, so the
 * middle third is what faces the viewer. Torso cells map onto the torso's bounding rectangle, which
 * is `TORSO_PRINT_ASPECT` times wider on the figure than in the cell, and only a trapezoid of it
 * is torso (full width at the hips, `TORSO_PRINT_TOP_WIDTH` of it at the shoulders).
 */

const INK = '#1b2a34'
const WHITE = '#ffffff'
const GOLD = '#f2c230'
const SILVER = '#d9dde3'
const REFLECTIVE = '#f5e663'
const BEARD = '#5b3a24'

/** Face features, as fractions of the face cell. */
const EYE_DX = 0.11
const EYE_Y = 0.44
const MOUTH_Y = 0.66

function eye(ctx: CanvasRenderingContext2D, w: number, h: number, side: number, scale = 1) {
  const cx = w / 2 + side * EYE_DX * w
  const cy = EYE_Y * h
  ctx.beginPath()
  ctx.ellipse(cx, cy, 0.024 * w * scale, 0.09 * h * scale, 0, 0, Math.PI * 2)
  ctx.fillStyle = INK
  ctx.fill()
  // The classic white glint.
  ctx.beginPath()
  ctx.arc(cx + 0.008 * w * scale, cy - 0.035 * h * scale, 0.025 * h * scale, 0, Math.PI * 2)
  ctx.fillStyle = WHITE
  ctx.fill()
}

function eyes(ctx: CanvasRenderingContext2D, w: number, h: number, scale = 1) {
  eye(ctx, w, h, -1, scale)
  eye(ctx, w, h, 1, scale)
}

function stroke(ctx: CanvasRenderingContext2D, width: number, color = INK) {
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.stroke()
}

function smile(ctx: CanvasRenderingContext2D, w: number, h: number, widthFrac = 0.09) {
  ctx.beginPath()
  ctx.arc(w / 2, MOUTH_Y * h - 0.16 * h, widthFrac * w, Math.PI * 0.2, Math.PI * 0.8)
  stroke(ctx, 0.055 * h)
}

function brows(ctx: CanvasRenderingContext2D, w: number, h: number, lift = 0) {
  for (const side of [-1, 1]) {
    const cx = w / 2 + side * EYE_DX * w
    ctx.beginPath()
    ctx.arc(cx, (0.3 - lift) * h + 0.12 * h, 0.035 * w, Math.PI * 1.2, Math.PI * 1.8)
    stroke(ctx, 0.04 * h)
  }
}

const FACES: Record<string, PrintDrawer> = {
  fig_face_smile(ctx, w, h) {
    eyes(ctx, w, h)
    smile(ctx, w, h)
  },

  fig_face_grin(ctx, w, h) {
    // A big open smile with a row of teeth.
    eyes(ctx, w, h)
    const cx = w / 2, top = 0.58 * h, rx = 0.085 * w, ry = 0.22 * h
    ctx.beginPath()
    ctx.moveTo(cx - rx, top)
    ctx.lineTo(cx + rx, top)
    ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI)
    ctx.closePath()
    ctx.fillStyle = INK
    ctx.fill()
    ctx.fillStyle = WHITE
    ctx.fillRect(cx - rx * 0.8, top + 0.01 * h, rx * 1.6, 0.06 * h)
  },

  fig_face_wink(ctx, w, h) {
    // Right eye open, left eye a closed arc, a lopsided smile.
    eye(ctx, w, h, 1)
    ctx.beginPath()
    ctx.arc(w / 2 - EYE_DX * w, EYE_Y * h + 0.05 * h, 0.03 * w, Math.PI * 1.15, Math.PI * 1.85)
    stroke(ctx, 0.05 * h)
    ctx.beginPath()
    ctx.moveTo(w / 2 - 0.08 * w, MOUTH_Y * h + 0.02 * h)
    ctx.quadraticCurveTo(w / 2, MOUTH_Y * h + 0.14 * h, w / 2 + 0.09 * w, MOUTH_Y * h - 0.04 * h)
    stroke(ctx, 0.055 * h)
  },

  fig_face_surprised(ctx, w, h) {
    // Wide eyes, raised brows and a round O mouth.
    eyes(ctx, w, h, 1.2)
    brows(ctx, w, h, 0.08)
    ctx.beginPath()
    ctx.ellipse(w / 2, MOUTH_Y * h + 0.06 * h, 0.03 * w, 0.1 * h, 0, 0, Math.PI * 2)
    ctx.fillStyle = INK
    ctx.fill()
  },

  fig_face_beard(ctx, w, h) {
    // A full brown beard round the chin, a moustache and a smile peeking out.
    eyes(ctx, w, h)
    brows(ctx, w, h)
    ctx.beginPath()
    ctx.moveTo(w / 2 - 0.2 * w, 0.5 * h)
    ctx.quadraticCurveTo(w / 2 - 0.19 * w, 0.92 * h, w / 2, 0.92 * h)
    ctx.quadraticCurveTo(w / 2 + 0.19 * w, 0.92 * h, w / 2 + 0.2 * w, 0.5 * h)
    ctx.quadraticCurveTo(w / 2 + 0.14 * w, 0.78 * h, w / 2, 0.74 * h)
    ctx.quadraticCurveTo(w / 2 - 0.14 * w, 0.78 * h, w / 2 - 0.2 * w, 0.5 * h)
    ctx.closePath()
    ctx.fillStyle = BEARD
    ctx.fill()
    // Moustache: two curls under the nose.
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(w / 2 + side * 0.045 * w, 0.62 * h, 0.05 * w, 0.06 * h, side * 0.25, 0, Math.PI * 2)
      ctx.fillStyle = BEARD
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(w / 2, 0.6 * h, 0.04 * w, Math.PI * 0.25, Math.PI * 0.75)
    stroke(ctx, 0.04 * h, '#c0392b')
  },

  fig_face_glasses(ctx, w, h) {
    // Round black-rimmed glasses over the eyes, and a smile.
    eyes(ctx, w, h, 0.9)
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(w / 2 + side * EYE_DX * w, EYE_Y * h, 0.055 * w, 0.17 * h, 0, 0, Math.PI * 2)
      stroke(ctx, 0.045 * h)
    }
    ctx.beginPath()
    ctx.moveTo(w / 2 - (EYE_DX - 0.055) * w, EYE_Y * h)
    ctx.lineTo(w / 2 + (EYE_DX - 0.055) * w, EYE_Y * h)
    stroke(ctx, 0.04 * h)
    smile(ctx, w, h, 0.08)
  },
}

/**
 * Torso drawing frame: origin at the top centre of the cell, x scaled so circles stay round on the
 * figure. Returns the torso half-widths in that frame (at the shoulders and at the hips).
 */
function torsoFrame(ctx: CanvasRenderingContext2D, w: number): { top: number; bottom: number } {
  ctx.translate(w / 2, 0)
  ctx.scale(1 / TORSO_PRINT_ASPECT, 1)
  const bottom = (w * TORSO_PRINT_ASPECT) / 2
  return { top: bottom * TORSO_PRINT_TOP_WIDTH, bottom }
}

/** Half-width of the torso at height `y` (0 = shoulders, h = hips) in the torso frame. */
const halfAt = (f: { top: number; bottom: number }, y: number, h: number) => f.top + ((f.bottom - f.top) * y) / h

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : outer * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
}

/** A V-shaped collar of `color` at the neck, `depth` deep. */
function collarV(ctx: CanvasRenderingContext2D, half: number, depth: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(-half, 0)
  ctx.lineTo(half, 0)
  ctx.lineTo(0, depth)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function tie(ctx: CanvasRenderingContext2D, h: number, color: string, length = 0.5) {
  const s = h * 0.06
  ctx.beginPath()
  ctx.moveTo(-s, h * 0.04)
  ctx.lineTo(s, h * 0.04)
  ctx.lineTo(s * 0.7, h * 0.12)
  ctx.lineTo(s * 1.3, h * length)
  ctx.lineTo(0, h * (length + 0.07))
  ctx.lineTo(-s * 1.3, h * length)
  ctx.lineTo(-s * 0.7, h * 0.12)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function band(ctx: CanvasRenderingContext2D, f: { top: number; bottom: number }, h: number, y: number, thick: number, color: string) {
  const half = halfAt(f, y + thick, h)
  ctx.fillStyle = color
  ctx.fillRect(-half, y, 2 * half, thick)
}

const TORSOS: Record<string, PrintDrawer> = {
  fig_torso_police(ctx, w, h) {
    // White collar, black tie, gold star badge, a pocket, and a black belt with a silver buckle.
    const f = torsoFrame(ctx, w)
    collarV(ctx, f.top * 0.42, h * 0.3, WHITE)
    tie(ctx, h, INK, 0.42)
    star(ctx, f.top * 0.5, h * 0.33, h * 0.1)
    ctx.fillStyle = GOLD
    ctx.fill()
    stroke(ctx, h * 0.015, '#a87a10')
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = h * 0.025
    ctx.strokeRect(-f.top * 0.75, h * 0.26, f.top * 0.4, h * 0.16)
    band(ctx, f, h, h * 0.82, h * 0.1, INK)
    ctx.fillStyle = SILVER
    ctx.fillRect(-h * 0.06, h * 0.82, h * 0.12, h * 0.1)
  },

  fig_torso_chef(ctx, w, h) {
    // Double-breasted jacket: a red neckerchief and two rows of buttons.
    const f = torsoFrame(ctx, w)
    collarV(ctx, f.top * 0.4, h * 0.2, '#d01012')
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = h * 0.02
    ctx.beginPath()
    ctx.moveTo(-f.top * 0.4, 0)
    ctx.lineTo(f.top * 0.2, h * 0.95)
    ctx.stroke()
    for (let i = 0; i < 3; i++) {
      for (const x of [-0.28, 0.42]) {
        ctx.beginPath()
        ctx.arc(x * f.top, h * (0.38 + i * 0.2), h * 0.04, 0, Math.PI * 2)
        ctx.fillStyle = '#6c6e68'
        ctx.fill()
      }
    }
  },

  fig_torso_fire(ctx, w, h) {
    // Reflective stripes: across the chest and the waist, and up from the waist on both sides.
    const f = torsoFrame(ctx, w)
    for (const x of [-0.55, 0.55]) {
      ctx.fillStyle = REFLECTIVE
      ctx.fillRect(x * f.bottom - h * 0.06, h * 0.32, h * 0.12, h * 0.5)
    }
    for (const y of [0.3, 0.74]) {
      band(ctx, f, h, y * h, h * 0.12, REFLECTIVE)
      band(ctx, f, h, y * h + h * 0.045, h * 0.03, SILVER)
    }
    star(ctx, -f.top * 0.5, h * 0.16, h * 0.07)
    ctx.fillStyle = GOLD
    ctx.fill()
  },

  fig_torso_space(ctx, w, h) {
    // A space logo on the chest: a planet with a gold orbit and a little rocket.
    const f = torsoFrame(ctx, w)
    const cy = h * 0.44, r = h * 0.19
    ctx.beginPath()
    ctx.arc(0, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#0055bf'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(0, cy, r * 1.55, r * 0.45, -0.35, 0, Math.PI * 2)
    stroke(ctx, h * 0.04, GOLD)
    ctx.beginPath()
    ctx.moveTo(r * 0.9, cy - r * 1.1)
    ctx.lineTo(r * 1.3, cy - r * 0.3)
    ctx.lineTo(r * 0.55, cy - r * 0.55)
    ctx.closePath()
    ctx.fillStyle = '#d01012'
    ctx.fill()
    // Air hoses down to the belt.
    band(ctx, f, h, h * 0.84, h * 0.08, '#6c6e68')
  },

  fig_torso_vest(ctx, w, h) {
    // Safety vest stripes: two straps from the shoulders and a band near the bottom, plus a zip.
    const f = torsoFrame(ctx, w)
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(side * f.top * 0.45, 0)
      ctx.lineTo(side * f.top * 0.8, 0)
      ctx.lineTo(side * f.bottom * 0.55, h * 0.72)
      ctx.lineTo(side * f.bottom * 0.3, h * 0.72)
      ctx.closePath()
      ctx.fillStyle = REFLECTIVE
      ctx.fill()
    }
    band(ctx, f, h, h * 0.66, h * 0.13, REFLECTIVE)
    band(ctx, f, h, h * 0.71, h * 0.03, SILVER)
    ctx.beginPath()
    ctx.moveTo(0, h * 0.06)
    ctx.lineTo(0, h * 0.96)
    stroke(ctx, h * 0.02, 'rgba(0,0,0,0.4)')
  },

  fig_torso_stripes(ctx, w, h) {
    // Prison stripes across the whole torso.
    const f = torsoFrame(ctx, w)
    for (let i = 0; i < 4; i++) band(ctx, f, h, h * (0.1 + i * 0.24), h * 0.12, INK)
  },

  fig_torso_suit(ctx, w, h) {
    // Jacket: a white shirt V with a red tie, lapels and two buttons.
    const f = torsoFrame(ctx, w)
    collarV(ctx, f.top * 0.5, h * 0.55, WHITE)
    tie(ctx, h, '#c91a09', 0.45)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = h * 0.025
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(side * f.top * 0.5, 0)
      ctx.lineTo(side * f.top * 0.15, h * 0.55)
      ctx.lineTo(side * f.top * 0.15, h)
      ctx.stroke()
    }
    for (const y of [0.68, 0.84]) {
      ctx.beginPath()
      ctx.arc(f.top * 0.28, h * y, h * 0.035, 0, Math.PI * 2)
      ctx.fillStyle = INK
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(-f.top * 0.9, h * 0.3, f.top * 0.35, h * 0.04)
  },

  fig_torso_apron(ctx, w, h) {
    // A black bow tie and a dark apron with straps over the shoulders and a pocket.
    const f = torsoFrame(ctx, w)
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.moveTo(0, h * 0.08)
    ctx.lineTo(-h * 0.11, h * 0.02)
    ctx.lineTo(-h * 0.11, h * 0.14)
    ctx.closePath()
    ctx.moveTo(0, h * 0.08)
    ctx.lineTo(h * 0.11, h * 0.02)
    ctx.lineTo(h * 0.11, h * 0.14)
    ctx.closePath()
    ctx.fill()
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(side * f.top * 0.75, 0)
      ctx.lineTo(side * f.top * 0.48, h * 0.42)
      stroke(ctx, h * 0.06, '#2b2b2b')
    }
    const top = h * 0.4
    ctx.beginPath()
    ctx.moveTo(-f.top * 0.55, top)
    ctx.lineTo(f.top * 0.55, top)
    ctx.lineTo(halfAt(f, h, h) * 0.8, h)
    ctx.lineTo(-halfAt(f, h, h) * 0.8, h)
    ctx.closePath()
    ctx.fillStyle = '#2b2b2b'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = h * 0.02
    ctx.strokeRect(-f.top * 0.3, h * 0.6, f.top * 0.6, h * 0.18)
  },
}

export const FIGURE_PRINT_DRAWERS: Record<string, PrintDrawer> = { ...FACES, ...TORSOS }
