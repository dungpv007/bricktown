/** Rotation in quarter turns counter-clockwise around +Y (viewed from above). */
export type Rot = 0 | 1 | 2 | 3

export type FigFace = 'smile' | 'grin' | 'wink' | 'surprised' | 'beard' | 'glasses'
export type FigHat =
  | 'none' | 'hair_short' | 'hair_long' | 'hair_ponytail' | 'cap' | 'police' | 'chef' | 'fire'
  | 'construction' | 'space' | 'crown' | 'robber_cap'
export type FigPrint = 'plain' | 'police' | 'chef' | 'fire' | 'space' | 'vest' | 'stripes' | 'suit' | 'apron'
export type FigAccessory = 'none' | 'tool' | 'pan' | 'radio' | 'flashlight'

/** How a minifigure looks (see core/figures). Colours are indices into COLORS; skin is fixed. */
export interface FigStyle {
  torso: number
  legs: number
  /** Arm colour; absent = the torso colour. */
  arms?: number
  face: FigFace
  hat: FigHat
  /** Hat / hair colour; absent = the hat's default colour. */
  hatColor?: number
  print: FigPrint
  /** Held in the right hand; absent = none. */
  accessory?: FigAccessory
}

export interface Brick {
  id: string // unique within its model
  p: string // PartDef.id
  x: number
  y: number
  z: number
  r: Rot
  c: number // color index into COLORS (for a minifigure: its torso colour)
  /** Minifigures only: the figure's look (absent = the default figure). */
  fig?: FigStyle
}

export type PartCategory =
  | 'brick' | 'plate' | 'slope' | 'round' | 'door_window' | 'wheel' | 'furniture' | 'nature' | 'decor' | 'figure'

export type PartShape =
  | 'box' | 'tile' | 'slope' | 'slope_inv' | 'cylinder' | 'cone' | 'wheel'
  | 'window' | 'door' | 'fence' | 'table' | 'chair' | 'counter' | 'stove'
  | 'fridge' | 'sign' | 'lamp' | 'tree' | 'bush' | 'flower'
  | 'nose_cone' | 'dish' | 'antenna' | 'bars' | 'steering' | 'computer' | 'bed' | 'flag' | 'fin' | 'engine'
  | 'tile_print' | 'minifig'

export interface PartDef {
  id: string
  category: PartCategory
  shape: PartShape
  w: number // studs along X at r=0
  d: number // studs along Z at r=0
  h: number // plates
  studs: boolean // render studs on top
  sym: 1 | 2 | 4 // rotational symmetry order around Y
  tags?: string[] // e.g. ['wheel']
  /** Id of the print (see `PRINTS` in core/prints) drawn on the part in its own fixed colours. */
  print?: string
}

export interface Baseplate {
  w: number
  d: number
  /** Colour index into COLORS; absent = the kind's default (see `plateColor` in core/baseplate). */
  c?: number
}

export type BlueprintKind = 'building' | 'vehicle' | 'prop'

export interface Blueprint {
  id: string
  name: string
  kind: BlueprintKind
  tags: string[]
  baseplate: Baseplate
  bricks: Brick[]
  createdAt: number
  updatedAt: number
  templateId?: string
}

export interface LocalizedText { vi: string; en: string }

export interface Template {
  id: string
  name: LocalizedText
  difficulty: 1 | 2 | 3
  kind: BlueprintKind
  tags: string[]
  baseplate: Baseplate
  bricks: Brick[]
  steps: number[][] // indices into bricks, in build order
}

export interface CityPlacement {
  id: string
  /** blueprint id, or `tpl:<templateId>` for ready-made template models */
  source: string
  cx: number // cell x of min corner
  cz: number // cell z of min corner
  rot: Rot
}

export interface CityState {
  size: number // cells per side
  roads: string[] // "cx,cz" keys
  placements: CityPlacement[]
}

export interface WorkshopState {
  kind: BlueprintKind
  baseplate: Baseplate
  bricks: Brick[]
  editingBlueprintId?: string
}

export interface GuidedState {
  templateId: string
  step: number // index of current step
  placed: string[] // brick ids of the template already placed
}

export interface SaveData {
  schemaVersion: number
  blueprints: Blueprint[]
  city: CityState
  workshop: WorkshopState
  guided: GuidedState | null
  completedTemplates: string[]
}
