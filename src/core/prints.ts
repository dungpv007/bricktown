/**
 * Prints: pictures drawn on parts in their own fixed colours (printed tiles, the computer screen;
 * minifigure faces and torsos). Every print lives in one texture atlas, so all printed surfaces
 * of a scene share one material and draw in one batch per part (instanced) or per model (baked).
 *
 * This registry is the pure layout: each print's size in atlas cells (1 cell = 1 stud of print) and
 * where it is packed. The pictures themselves are drawn into the atlas by `render/printAtlas`.
 * Order matters only for packing; ids are what parts refer to (`PartDef.print`).
 */

export interface PrintDef {
  id: string
  /** Width in atlas cells (1 cell = 1 stud). */
  w: number
  /** Height in atlas cells. */
  h: number
}

/** The atlas grid; a cell is `cellPx` square in the drawn texture. */
export const PRINT_ATLAS = { cols: 8, rows: 8, cellPx: 128 } as const

export const PRINTS: PrintDef[] = [
  { id: 'police', w: 2, h: 2 },
  { id: 'fire', w: 2, h: 2 },
  { id: 'clock', w: 2, h: 2 },
  { id: 'stop', w: 2, h: 2 },
  { id: 'arrow', w: 2, h: 2 },
  { id: 'menu', w: 2, h: 1 },
  { id: 'screen', w: 2, h: 1 },
  { id: 'robot_eyes', w: 2, h: 1 },
  { id: 'number_112', w: 2, h: 1 },
  { id: 'heart', w: 1, h: 1 },
  { id: 'star', w: 1, h: 1 },
  // Minifigure faces (wrapped round the front half of the head, hence 2:1) and torso prints.
  // Ids are `fig_face_<FigFace>` / `fig_torso_<FigPrint>` (see core/figures; 'plain' has none).
  { id: 'fig_face_smile', w: 2, h: 1 },
  { id: 'fig_face_grin', w: 2, h: 1 },
  { id: 'fig_face_wink', w: 2, h: 1 },
  { id: 'fig_face_surprised', w: 2, h: 1 },
  { id: 'fig_face_beard', w: 2, h: 1 },
  { id: 'fig_face_glasses', w: 2, h: 1 },
  { id: 'fig_torso_police', w: 1, h: 1 },
  { id: 'fig_torso_chef', w: 1, h: 1 },
  { id: 'fig_torso_fire', w: 1, h: 1 },
  { id: 'fig_torso_space', w: 1, h: 1 },
  { id: 'fig_torso_vest', w: 1, h: 1 },
  { id: 'fig_torso_stripes', w: 1, h: 1 },
  { id: 'fig_torso_suit', w: 1, h: 1 },
  { id: 'fig_torso_apron', w: 1, h: 1 },
  // Shop signs (drawn on both faces of the `board_*` parts) and the sushi belt's fish. Appended, so
  // the prints above keep their atlas cells.
  { id: 'sushi', w: 2, h: 1 },
  { id: 'bakery', w: 2, h: 1 },
  { id: 'toys', w: 2, h: 1 },
  { id: 'grocery', w: 2, h: 1 },
  { id: 'taxi', w: 2, h: 1 },
  { id: 'fish', w: 1, h: 1 },
]

export const PRINT_BY_ID: Record<string, PrintDef> = Object.fromEntries(PRINTS.map((p) => [p.id, p]))

/** A print's rectangle in atlas cells; y counts rows from the top of the atlas image. */
export interface PrintRect {
  x: number
  y: number
  w: number
  h: number
}

/** First fit, row by row, in registry order: deterministic, so the layout never depends on load order. */
function pack(prints: PrintDef[]): Map<string, PrintRect> {
  const { cols, rows } = PRINT_ATLAS
  const used: boolean[] = new Array<boolean>(cols * rows).fill(false)
  const free = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (used[j * cols + i]) return false
    return true
  }
  const out = new Map<string, PrintRect>()
  for (const p of prints) {
    let spot: PrintRect | null = null
    for (let y = 0; y + p.h <= rows && !spot; y++) {
      for (let x = 0; x + p.w <= cols && !spot; x++) if (free(x, y, p.w, p.h)) spot = { x, y, w: p.w, h: p.h }
    }
    if (!spot) throw new Error(`Print atlas is full: no room for ${p.id}`)
    for (let j = spot.y; j < spot.y + p.h; j++) for (let i = spot.x; i < spot.x + p.w; i++) used[j * cols + i] = true
    out.set(p.id, spot)
  }
  return out
}

const RECTS = pack(PRINTS)

export function printRect(id: string): PrintRect {
  const r = RECTS.get(id)
  if (!r) throw new Error(`Unknown print id: ${id}`)
  return r
}

/** Texture coordinates of a print. The atlas canvas is uploaded with flipY, so v = 1 is its top row. */
export interface PrintUv {
  u0: number
  v0: number
  u1: number
  v1: number
}

export function printUv(id: string): PrintUv {
  const { x, y, w, h } = printRect(id)
  const { cols, rows } = PRINT_ATLAS
  return { u0: x / cols, u1: (x + w) / cols, v0: 1 - (y + h) / rows, v1: 1 - y / rows }
}
