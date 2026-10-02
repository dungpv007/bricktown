import type { Maze } from './maze'
import type { PlayData } from '../play/types'

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
  /**
   * Size multiplier, an integer from 1 to 10 (`MIN_SCALE`..`MAX_SCALE` in core/city); absent = 1.
   * The model is drawn `s` times bigger and its footprint is the plate's studs x `s`, in cells.
   */
  s?: number
}

/**
 * Painted ground of a city, by "cx,cz" key; a cell in none of the lists is grass. The lists never
 * share a cell, and no water lies under a road or a rail (see core/terrain).
 */
export interface CityTerrain {
  water: string[]
  pavement: string[]
  sand: string[]
}

export interface CityState {
  size: number // cells per side
  roads: string[] // "cx,cz" keys
  placements: CityPlacement[]
  /** Painted ground; absent = all grass. Optional and added during v3 (normalised on load, no bump). */
  terrain?: CityTerrain
  /**
   * Railway cells ("cx,cz" keys), auto-tiled like roads; absent = none. A cell that is also a road is a
   * level crossing (only where both are perpendicular straights, see core/rails). Added during v3.
   */
  rails?: string[]
}

/** One of the kid's cities: a save slot holds many (see core/cities). */
export interface SavedCity {
  id: string
  /** As the kid typed it, cleaned (see `sanitizeCityName`); '' = the default name, shown in the kid's language. */
  name: string
  city: CityState
  createdAt: number
  updatedAt: number
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

/** Best run through a maze. */
export interface MazeRecord {
  timeMs: number
  stars: 1 | 2 | 3
  /** Coins collected on that run. */
  coins: number
}

/** The time a friend set on a shared maze, for the kid to beat. */
export interface MazeChallenge {
  timeMs: number
  /** Who set it, when known. */
  from?: string
}

export interface SaveData {
  schemaVersion: number
  blueprints: Blueprint[]
  /** The kid's cities, in the order they were made (at least one, at most `MAX_CITIES`). */
  cities: SavedCity[]
  /** The city the City editor and Drive use; always one of `cities` (normalised on load). */
  currentCityId: string
  workshop: WorkshopState
  guided: GuidedState | null
  completedTemplates: string[]
  /** Models shared "with build instructions": built step by step in Guided mode. */
  sharedTemplates: Template[]
  /** The kid's own and imported mazes (owned by Maze mode; shared mazes are added here). */
  mazes: Maze[]
  /** Best runs by maze id (`tpl:<templateId>` for an unchanged ready-made maze). */
  mazeRecords: Record<string, MazeRecord>
  /** A friend's time to beat, keyed by maze id. */
  mazeChallenges: Record<string, MazeChallenge>
  /**
   * Role-play rewards (coins, stickers, shop items; see play/types). Optional and added during v4
   * without a bump: absent = nothing earned yet; `normalize` repairs it (see `normalizePlay`).
   */
  play?: PlayData
}
