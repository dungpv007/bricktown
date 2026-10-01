/** Rotation in quarter turns counter-clockwise around +Y (viewed from above). */
export type Rot = 0 | 1 | 2 | 3

export interface Brick {
  id: string // unique within its model
  p: string // PartDef.id
  x: number
  y: number
  z: number
  r: Rot
  c: number // color index into COLORS
}

export type PartCategory =
  | 'brick' | 'plate' | 'slope' | 'round' | 'door_window' | 'wheel' | 'furniture' | 'nature'

export type PartShape =
  | 'box' | 'tile' | 'slope' | 'slope_inv' | 'cylinder' | 'cone' | 'wheel'
  | 'window' | 'door' | 'fence' | 'table' | 'chair' | 'counter' | 'stove'
  | 'fridge' | 'sign' | 'lamp' | 'tree' | 'bush' | 'flower'

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
