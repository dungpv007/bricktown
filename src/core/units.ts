// LEGO proportions: stud pitch 8mm, plate 3.2mm, brick 9.6mm.
// World unit = 1 stud. Vertical grid unit = 1 plate.
export const STUD = 1
export const PLATE_HEIGHT = 0.4
export const PLATES_PER_BRICK = 3

export function platesToWorld(plates: number): number {
  return plates * PLATE_HEIGHT
}
