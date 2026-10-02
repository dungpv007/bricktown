import * as THREE from 'three'
import { PRINTS, PRINT_ATLAS, printRect } from '../core/prints'
import { FIGURE_PRINT_DRAWERS } from './figurePrints'

/**
 * Draws every print (see core/prints) into one canvas with Canvas2D, once, at startup, and wraps
 * it in the texture the shared print material uses. Prints are drawn procedurally (no image files),
 * so they work offline and stay sharp: 128 px per stud. Each picture keeps a small transparent
 * margin so mipmaps never bleed one print into its neighbour.
 */

/** Draws one print into the box (0, 0)-(w, h) in pixels; transparent pixels show the brick colour. */
export type PrintDrawer = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
const M = 8 // margin inside each print's rectangle (px)

const INK = '#1b2a34'
const WHITE = '#ffffff'
const RED = '#d01012'
const GOLD = '#f2c230'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string, outline?: string) {
  ctx.font = `900 ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = size / 6
    ctx.strokeStyle = outline
    ctx.strokeText(s, x, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(s, x, y)
}

function flamePath(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, half: number) {
  const h = bottom - top
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.bezierCurveTo(cx + half * 0.5, top + h * 0.3, cx + half * 1.1, top + h * 0.55, cx + half * 0.8, top + h * 0.85)
  ctx.quadraticCurveTo(cx + half * 0.55, bottom, cx, bottom)
  ctx.quadraticCurveTo(cx - half * 0.55, bottom, cx - half * 0.8, top + h * 0.85)
  ctx.bezierCurveTo(cx - half * 1.1, top + h * 0.55, cx - half * 0.2, top + h * 0.45, cx, top)
  ctx.closePath()
}

export const PRINT_DRAWERS: Record<string, PrintDrawer> = {
  ...FIGURE_PRINT_DRAWERS,

  police(ctx, w, h) {
    // Navy shield, gold rim and star, POLICE across it.
    const l = M + 14, r = w - M - 14, t = M + 10
    ctx.beginPath()
    ctx.moveTo(l, t)
    ctx.quadraticCurveTo(w / 2, t + 22, r, t)
    ctx.lineTo(r, h * 0.5)
    ctx.quadraticCurveTo(r, h * 0.82, w / 2, h - M - 4)
    ctx.quadraticCurveTo(l, h * 0.82, l, h * 0.5)
    ctx.closePath()
    ctx.fillStyle = '#1f3f99'
    ctx.fill()
    ctx.lineWidth = 12
    ctx.strokeStyle = GOLD
    ctx.stroke()
    starPath(ctx, w / 2, h * 0.37, 50, 21)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = '#a87a10'
    ctx.stroke()
    text(ctx, 'POLICE', w / 2, h * 0.66, 40, WHITE)
  },

  fire(ctx, w, h) {
    // Red round badge, gold rim, a big flame and FIRE.
    const cx = w / 2, cy = h / 2, R = w / 2 - M - 4
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = RED
    ctx.fill()
    ctx.lineWidth = 12
    ctx.strokeStyle = GOLD
    ctx.stroke()
    flamePath(ctx, cx, h * 0.14, h * 0.66, 62)
    ctx.fillStyle = '#ff8c1a'
    ctx.fill()
    flamePath(ctx, cx, h * 0.3, h * 0.64, 34)
    ctx.fillStyle = '#ffe14d'
    ctx.fill()
    text(ctx, 'FIRE', cx, h * 0.79, 40, WHITE)
  },

  clock(ctx, w, h) {
    // White face, dark rim, hour ticks, 12 / 3 / 6 / 9, hands at ten past ten.
    const cx = w / 2, cy = h / 2, R = w / 2 - M - 4
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = WHITE
    ctx.fill()
    ctx.lineWidth = 12
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.lineCap = 'round'
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 0) continue
      const a = (i * Math.PI) / 6
      ctx.beginPath()
      ctx.moveTo(cx + Math.sin(a) * (R - 14), cy - Math.cos(a) * (R - 14))
      ctx.lineTo(cx + Math.sin(a) * (R - 28), cy - Math.cos(a) * (R - 28))
      ctx.lineWidth = 7
      ctx.stroke()
    }
    const num = (s: string, a: number) => text(ctx, s, cx + Math.sin(a) * (R - 34), cy - Math.cos(a) * (R - 34), 36, INK)
    num('12', 0)
    num('3', Math.PI / 2)
    num('6', Math.PI)
    num('9', (3 * Math.PI) / 2)
    const hand = (a: number, len: number, width: number, color: string) => {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len)
      ctx.lineWidth = width
      ctx.strokeStyle = color
      ctx.stroke()
    }
    hand((10 / 12) * Math.PI * 2 + (1 / 6) * (Math.PI / 6), R * 0.48, 13, INK)
    hand((2 / 12) * Math.PI * 2, R * 0.72, 9, INK)
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.fillStyle = RED
    ctx.fill()
  },

  stop(ctx, w, h) {
    // Red octagon with a white rim and STOP.
    const cx = w / 2, cy = h / 2
    const oct = (R: number) => {
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4
        ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a))
      }
      ctx.closePath()
    }
    oct(w / 2 - M)
    ctx.fillStyle = WHITE
    ctx.fill()
    oct(w / 2 - M - 12)
    ctx.fillStyle = RED
    ctx.fill()
    text(ctx, 'STOP', cx, cy + 3, 66, WHITE)
  },

  arrow(ctx, w, h) {
    // Blue road sign with a white border and a fat white arrow pointing right (+X).
    roundRect(ctx, M, M, w - 2 * M, h - 2 * M, 34)
    ctx.fillStyle = WHITE
    ctx.fill()
    roundRect(ctx, M + 10, M + 10, w - 2 * M - 20, h - 2 * M - 20, 26)
    ctx.fillStyle = '#0a5cc2'
    ctx.fill()
    const cy = h / 2
    ctx.beginPath()
    ctx.moveTo(w * 0.2, cy - 26)
    ctx.lineTo(w * 0.52, cy - 26)
    ctx.lineTo(w * 0.52, cy - 66)
    ctx.lineTo(w * 0.82, cy)
    ctx.lineTo(w * 0.52, cy + 66)
    ctx.lineTo(w * 0.52, cy + 26)
    ctx.lineTo(w * 0.2, cy + 26)
    ctx.closePath()
    ctx.fillStyle = WHITE
    ctx.fill()
  },

  menu(ctx, w, h) {
    // Chalkboard in a wooden frame: MENU and three dishes with prices. Laid out on a 256x128 grid,
    // scaled to the cell (X = w / 256, Y = h / 128 per grid pixel).
    const X = w / 256, Y = h / 128
    roundRect(ctx, M, M, w - 2 * M, h - 2 * M, 14 * Y)
    ctx.fillStyle = '#8a5a2b'
    ctx.fill()
    roundRect(ctx, M + 8, M + 8, w - 2 * M - 16, h - 2 * M - 16, 8 * Y)
    ctx.fillStyle = '#20352c'
    ctx.fill()
    text(ctx, 'MENU', w / 2, 36 * Y, 30 * Y, '#ffe066')
    const dots = ['#ff6b6b', '#ffd43b', '#69db7c']
    ctx.lineCap = 'round'
    dots.forEach((color, i) => {
      const y = (64 + i * 19) * Y
      ctx.beginPath()
      ctx.arc(36 * X, y, 6 * Y, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(52 * X, y)
      ctx.lineTo((172 - i * 18) * X, y)
      ctx.lineWidth = 5 * Y
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.stroke()
      text(ctx, String([5, 8, 3][i]), 214 * X, y + Y, 20 * Y, WHITE)
    })
  },

  screen(ctx, w, h) {
    // A computer screen: a window with a title bar, a bar chart and lines of text. Laid out on a
    // 256x128 grid, scaled to the cell.
    const X = w / 256, Y = h / 128
    roundRect(ctx, M - 2, M - 2, w - 2 * M + 4, h - 2 * M + 4, 10 * Y)
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#1e6fd9')
    sky.addColorStop(1, '#0d3b7a')
    ctx.fillStyle = sky
    ctx.fill()
    roundRect(ctx, 20 * X, 18 * Y, w - 40 * X, h - 36 * Y, 6 * Y)
    ctx.fillStyle = '#f4f7fb'
    ctx.fill()
    ctx.fillStyle = '#ff9f1c'
    ctx.fillRect(20 * X, 18 * Y, w - 40 * X, 14 * Y)
    for (const [i, c] of [RED, GOLD, '#2fb344'].entries()) {
      ctx.beginPath()
      ctx.arc(w - (34 + i * 14) * X, 25 * Y, 4 * Y, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
    }
    const bars = [30, 48, 22, 58, 40]
    bars.forEach((bh, i) => {
      ctx.fillStyle = ['#2fb344', '#1e6fd9', '#ff9f1c', '#d01012', '#7048e8'][i]
      ctx.fillRect((34 + i * 18) * X, (100 - bh) * Y, 12 * X, bh * Y)
    })
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#8a97a8'
    ctx.lineWidth = 6 * Y
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(140 * X, (48 + i * 15) * Y)
      ctx.lineTo((i % 2 === 0 ? 216 : 196) * X, (48 + i * 15) * Y)
      ctx.stroke()
    }
  },

  robot_eyes(ctx, w, h) {
    // A dark visor with two glowing eyes.
    roundRect(ctx, M, M + 6, w - 2 * M, h - 2 * M - 12, 40)
    ctx.fillStyle = '#16181d'
    ctx.fill()
    for (const cx of [w * 0.28, w * 0.72]) {
      const cy = h / 2
      const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 44)
      glow.addColorStop(0, 'rgba(90,240,255,0.9)')
      glow.addColorStop(1, 'rgba(90,240,255,0)')
      ctx.fillStyle = glow
      ctx.fillRect(cx - 44, cy - 44, 88, 88)
      ctx.beginPath()
      ctx.arc(cx, cy, 25, 0, Math.PI * 2)
      ctx.fillStyle = '#5af0ff'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx, cy, 12, 0, Math.PI * 2)
      ctx.fillStyle = '#e8fdff'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx - 8, cy - 9, 5, 0, Math.PI * 2)
      ctx.fillStyle = WHITE
      ctx.fill()
    }
  },

  number_112(ctx, w, h) {
    // Emergency number on a white plate with a red border.
    roundRect(ctx, M, M, w - 2 * M, h - 2 * M, 20)
    ctx.fillStyle = RED
    ctx.fill()
    roundRect(ctx, M + 10, M + 10, w - 2 * M - 20, h - 2 * M - 20, 12)
    ctx.fillStyle = WHITE
    ctx.fill()
    text(ctx, '112', w / 2, h / 2 + 4, 80, RED)
  },

  heart(ctx, w, h) {
    const cx = w / 2
    ctx.beginPath()
    ctx.moveTo(cx, h - M - 10)
    ctx.bezierCurveTo(M - 6, h * 0.55, M + 4, M, cx, h * 0.32)
    ctx.bezierCurveTo(w - M - 4, M, w - M + 6, h * 0.55, cx, h - M - 10)
    ctx.closePath()
    ctx.fillStyle = '#e8112d'
    ctx.fill()
    ctx.lineWidth = 6
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#8f0a1c'
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(w * 0.33, h * 0.36, 11, 7, -0.6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fill()
  },

  star(ctx, w, h) {
    starPath(ctx, w / 2, h / 2 + 5, w / 2 - M - 2, (w / 2 - M) * 0.42)
    ctx.fillStyle = '#ffcf26'
    ctx.fill()
    ctx.lineWidth = 6
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#d97a00'
    ctx.stroke()
  },

  sushi(ctx, w, h) {
    // SUSHI in white on red, a row of nigiri on a black counter.
    shopSign(ctx, w, h, { bg: RED, rim: INK, word: 'SUSHI', ink: WHITE, outline: INK, size: 62 }, (X, Y) => {
      roundRect(ctx, 26 * X, 84 * Y, 204 * X, 26 * Y, 8 * Y)
      ctx.fillStyle = INK
      ctx.fill()
      for (const x of [62, 128, 194]) nigiri(ctx, x * X, 96 * Y, Y)
    })
  },

  bakery(ctx, w, h) {
    // BAKERY in brown on cream, then a loaf, a croissant and a cake.
    shopSign(ctx, w, h, { bg: '#fff1d0', rim: '#8a5a2b', word: 'BAKERY', ink: '#8a4b1c', size: 48 }, (X, Y) => {
      // Loaf with three cuts.
      ctx.beginPath()
      ctx.ellipse(70 * X, 98 * Y, 28 * X, 14 * Y, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#d9913a'
      ctx.fill()
      ctx.strokeStyle = '#fff1d0'
      ctx.lineWidth = 3 * Y
      for (const dx of [-12, 0, 12]) {
        ctx.beginPath()
        ctx.moveTo((70 + dx - 4) * X, 91 * Y)
        ctx.lineTo((70 + dx + 4) * X, 105 * Y)
        ctx.stroke()
      }
      // Croissant: a fat crescent.
      ctx.beginPath()
      ctx.arc(128 * X, 110 * Y, 22 * Y, Math.PI * 1.05, Math.PI * 1.95)
      ctx.arc(128 * X, 114 * Y, 10 * Y, Math.PI * 1.9, Math.PI * 1.1, true)
      ctx.closePath()
      ctx.fillStyle = '#e8a33d'
      ctx.fill()
      // Cake: pink icing, white cream, a cherry.
      ctx.fillStyle = '#f7c6d0'
      ctx.fillRect(166 * X, 92 * Y, 46 * X, 18 * Y)
      ctx.fillStyle = '#ff7fa5'
      ctx.fillRect(166 * X, 86 * Y, 46 * X, 8 * Y)
      disc(ctx, 189 * X, 82 * Y, 6 * Y, RED)
    })
  },

  toys(ctx, w, h) {
    // TOYS with each letter its own colour on blue, then a ball, a star and a toy block.
    shopSign(ctx, w, h, { bg: '#1e6fd9', rim: GOLD, word: '', ink: WHITE, size: 60 }, (X, Y) => {
      const letters: Array<[string, string]> = [['T', RED], ['O', GOLD], ['Y', '#2fb344'], ['S', '#ff8c1a']]
      letters.forEach(([c, fill], i) => text(ctx, c, (68 + i * 40) * X, 50 * Y, 64 * Y, fill, WHITE))
      disc(ctx, 70 * X, 98 * Y, 15 * Y, RED)
      ctx.beginPath()
      ctx.moveTo(70 * X, 98 * Y)
      ctx.arc(70 * X, 98 * Y, 15 * Y, -0.3, 0.9)
      ctx.closePath()
      ctx.fillStyle = WHITE
      ctx.fill()
      starPath(ctx, 128 * X, 99 * Y, 17 * Y, 7 * Y)
      ctx.fillStyle = GOLD
      ctx.fill()
      ctx.fillStyle = '#2fb344'
      ctx.fillRect(170 * X, 86 * Y, 32 * X, 24 * Y)
      for (const dx of [8, 24]) disc(ctx, (170 + dx) * X, 85 * Y, 5 * Y, '#2fb344')
    })
  },

  grocery(ctx, w, h) {
    // GROCERY in white on green, then an apple, an orange, a banana and a carrot.
    shopSign(ctx, w, h, { bg: '#2f9e44', rim: WHITE, word: 'GROCERY', ink: WHITE, outline: '#1b5e20', size: 42 }, (X, Y) => {
      disc(ctx, 60 * X, 100 * Y, 14 * Y, RED)
      ctx.fillStyle = '#69db7c'
      ctx.beginPath()
      ctx.ellipse(66 * X, 84 * Y, 7 * Y, 4 * Y, -0.5, 0, Math.PI * 2)
      ctx.fill()
      disc(ctx, 106 * X, 100 * Y, 14 * Y, '#ff8c1a')
      ctx.beginPath()
      ctx.arc(152 * X, 80 * Y, 26 * Y, Math.PI * 0.2, Math.PI * 0.8)
      ctx.arc(152 * X, 72 * Y, 26 * Y, Math.PI * 0.75, Math.PI * 0.25, true)
      ctx.closePath()
      ctx.fillStyle = '#ffd43b'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(188 * X, 92 * Y)
      ctx.lineTo(216 * X, 100 * Y)
      ctx.lineTo(188 * X, 108 * Y)
      ctx.closePath()
      ctx.fillStyle = '#ff8c1a'
      ctx.fill()
      ctx.fillStyle = '#69db7c'
      ctx.fillRect(180 * X, 95 * Y, 9 * X, 10 * Y)
    })
  },

  taxi(ctx, w, h) {
    // TAXI in black on yellow over a black and white checker band.
    const Y = h / 128
    roundRect(ctx, M, M, w - 2 * M, h - 2 * M, 14 * Y)
    ctx.fillStyle = '#ffd43b'
    ctx.fill()
    text(ctx, 'TAXI', w / 2, 50 * Y, 72 * Y, INK)
    const sq = 12 * Y
    const n = Math.floor((w - 2 * M - 16) / sq)
    const x0 = (w - n * sq) / 2
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? INK : WHITE
        ctx.fillRect(x0 + i * sq, 92 * Y + j * sq, sq, sq)
      }
    }
  },

  fish(ctx, w, h) {
    // A little plate with a fish on it (the sushi belt).
    disc(ctx, w / 2, h / 2, w / 2 - M - 2, WHITE)
    ctx.lineWidth = 6
    ctx.strokeStyle = RED
    ctx.stroke()
    fishShape(ctx, w / 2 - 2, h / 2, 1.25, '#ff7f50')
  },
}

/**
 * A shop sign on a 256x128 grid (scaled to the cell): a framed panel with the shop's word across the
 * top and a row of little pictures under it. Text colours keep a dark outline, so the word reads on
 * any board colour from a distance.
 */
function shopSign(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  look: { bg: string; rim: string; word: string; ink: string; outline?: string; size: number },
  pictures: (X: number, Y: number) => void,
) {
  const X = w / 256, Y = h / 128
  roundRect(ctx, M, M, w - 2 * M, h - 2 * M, 16 * Y)
  ctx.fillStyle = look.rim
  ctx.fill()
  roundRect(ctx, M + 8 * X, M + 8 * Y, w - 2 * M - 16 * X, h - 2 * M - 16 * Y, 10 * Y)
  ctx.fillStyle = look.bg
  ctx.fill()
  if (look.word) text(ctx, look.word, w / 2, 48 * Y, look.size * Y, look.ink, look.outline)
  pictures(X, Y)
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

/** A nigiri: white rice with a slice of salmon on top (centre x, y; `s` = scale). */
function nigiri(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  roundRect(ctx, x - 16 * s, y - 4 * s, 32 * s, 12 * s, 6 * s)
  ctx.fillStyle = WHITE
  ctx.fill()
  roundRect(ctx, x - 18 * s, y - 10 * s, 36 * s, 10 * s, 5 * s)
  ctx.fillStyle = '#ff7f50'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2 * s
  for (const dx of [-8, 0, 8]) {
    ctx.beginPath()
    ctx.moveTo(x + dx * s - 3 * s, y - 9 * s)
    ctx.lineTo(x + dx * s + 3 * s, y - 2 * s)
    ctx.stroke()
  }
}

/** A side-on fish facing left: body, tail, eye and a gill line (centre x, y; `s` = scale). */
function fishShape(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, body: string) {
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(x + 18 * s, y)
  ctx.lineTo(x + 34 * s, y - 14 * s)
  ctx.lineTo(x + 34 * s, y + 14 * s)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x - 4 * s, y, 26 * s, 15 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 3 * s
  ctx.beginPath()
  ctx.arc(x - 12 * s, y, 11 * s, -Math.PI / 3, Math.PI / 3)
  ctx.stroke()
  disc(ctx, x - 20 * s, y - 4 * s, 4.5 * s, WHITE)
  disc(ctx, x - 20 * s, y - 4 * s, 2.5 * s, INK)
}

/** Draws every print into its atlas rectangle. */
export function drawPrintAtlas(ctx: CanvasRenderingContext2D): void {
  const px = PRINT_ATLAS.cellPx
  for (const p of PRINTS) {
    const r = printRect(p.id)
    const draw = PRINT_DRAWERS[p.id]
    if (!draw) continue
    ctx.save()
    ctx.translate(r.x * px, r.y * px)
    ctx.beginPath()
    // Torso prints span the whole torso (bands, stripes): clipped to the margin like the others.
    const m = p.id.startsWith('fig_torso_') ? M : 0
    ctx.rect(m, m, r.w * px - 2 * m, r.h * px - 2 * m)
    ctx.clip()
    draw(ctx, r.w * px, r.h * px)
    ctx.restore()
  }
}

/**
 * The atlas as a texture (sRGB, mipmapped, flipY so canvas row 0 is v = 1 as `printUv` expects).
 * Null where there is no DOM canvas (unit tests).
 */
export function createPrintTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = PRINT_ATLAS.cols * PRINT_ATLAS.cellPx
  canvas.height = PRINT_ATLAS.rows * PRINT_ATLAS.cellPx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawPrintAtlas(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}
