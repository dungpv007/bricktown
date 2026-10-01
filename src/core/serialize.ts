import { COLORS } from './colors'
import { parseFig } from './figures'
import type { Baseplate, Blueprint, Brick, SaveData } from './types'

export const SCHEMA_VERSION = 2

export function createEmptySave(): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    blueprints: [],
    city: { size: 48, roads: [], placements: [] },
    workshop: { kind: 'building', baseplate: { w: 16, d: 16 }, bricks: [] },
    guided: null,
    completedTemplates: [],
  }
}

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

/** Key N migrates a save from schema version N to N + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  /**
   * v2 appended colours 16-29 and the optional `Baseplate.c`; ids 0-15 kept their meaning. Saves
   * only ever stored colour indices (the old `glass` flag lived in the COLORS table, now `trans`),
   * so there is nothing to rewrite: a missing plate colour means the kind's default.
   */
  1: (data) => data,
}
// `Brick.fig` (minifigure styles) was added later without a version bump: it is optional and purely
// additive, older saves simply have no figures, and `normalize` drops any style it cannot read.

const UNSUPPORTED = 'unsupported save'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function migrate(raw: unknown): SaveData {
  if (!isRecord(raw)) throw new Error(UNSUPPORTED)
  let version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
    throw new Error(UNSUPPORTED)
  }
  let data: Record<string, unknown> = { ...raw }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) throw new Error(UNSUPPORTED)
    data = { ...step(data), schemaVersion: version + 1 }
    version += 1
  }
  if (!Array.isArray(data.blueprints) || !isRecord(data.city) || !isRecord(data.workshop)) {
    throw new Error(UNSUPPORTED)
  }
  return normalize(data, data.city, data.workshop)
}

const KINDS: readonly string[] = ['building', 'vehicle', 'prop']
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const isColor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && COLORS[v] !== undefined
const arrayOr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback)

/**
 * Fills in whatever a hand-edited or older file left out with the empty-save defaults, so the rest
 * of the app can trust the shape (a missing `guided` or `city.roads` must not crash a scene).
 */
function normalize(data: Record<string, unknown>, city: Record<string, unknown>, workshop: Record<string, unknown>): SaveData {
  const empty = createEmptySave()
  const baseplate = workshop.baseplate
  const guided = data.guided
  return {
    ...(data as unknown as SaveData),
    schemaVersion: SCHEMA_VERSION,
    blueprints: arrayOr<Blueprint>(data.blueprints, []).map((bp) =>
      isRecord(bp) && Array.isArray(bp.bricks) ? { ...bp, bricks: normalizeBricks(bp.bricks) } : bp,
    ),
    city: {
      size: isPositiveInt(city.size) ? city.size : empty.city.size,
      roads: arrayOr<string>(city.roads, []).filter((r) => typeof r === 'string'),
      placements: arrayOr(city.placements, []),
    },
    workshop: {
      kind: typeof workshop.kind === 'string' && KINDS.includes(workshop.kind) ? (workshop.kind as SaveData['workshop']['kind']) : empty.workshop.kind,
      baseplate:
        isRecord(baseplate) && isPositiveInt(baseplate.w) && isPositiveInt(baseplate.d)
          ? normalizePlate(baseplate.w, baseplate.d, baseplate.c)
          : empty.workshop.baseplate,
      bricks: normalizeBricks(arrayOr(workshop.bricks, [])),
      ...(typeof workshop.editingBlueprintId === 'string' ? { editingBlueprintId: workshop.editingBlueprintId } : {}),
    },
    guided:
      isRecord(guided) && typeof guided.templateId === 'string' && typeof guided.step === 'number' && Array.isArray(guided.placed)
        ? (guided as unknown as SaveData['guided'])
        : null,
    completedTemplates: arrayOr<string>(data.completedTemplates, []).filter((id) => typeof id === 'string'),
  }
}

/** Bricks as stored, except that a figure style that is not valid is dropped (see `parseFig`). */
function normalizeBricks(bricks: unknown[]): Brick[] {
  return bricks.map((b) => {
    if (!isRecord(b) || !('fig' in b)) return b as unknown as Brick
    const { fig, ...rest } = b
    const style = parseFig(fig)
    return (style ? { ...rest, fig: style } : rest) as unknown as Brick
  })
}

function normalizePlate(w: number, d: number, c: unknown): Baseplate {
  return isColor(c) ? { w, d, c } : { w, d }
}

export function exportSave(data: SaveData): string {
  return JSON.stringify({ app: 'bricktown', ...data }, null, 2)
}

export function importSave(json: string): SaveData {
  const parsed: unknown = JSON.parse(json)
  if (!isRecord(parsed) || parsed.app !== 'bricktown') throw new Error(UNSUPPORTED)
  const { app: _app, ...rest } = parsed
  void _app
  return migrate(rest)
}
