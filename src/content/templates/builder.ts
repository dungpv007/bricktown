import { autoSteps } from '../../core/template'
import type { Baseplate, BlueprintKind, Brick, LocalizedText, Rot, Template } from '../../core/types'

export interface TemplateSpec {
  id: string
  name: LocalizedText
  difficulty: 1 | 2 | 3
  kind: BlueprintKind
  tags: string[]
  baseplate: Baseplate
  /** Defaults to `autoSteps(bricks)`. */
  steps?: number[][]
}

export interface Builder {
  /** Adds a brick; `done` gives it the stable id `${templateId}-${index}`. */
  add(p: string, x: number, y: number, z: number, r: Rot, c: number): Brick
  /** Adds several bricks that share a y level. Each entry is `[part, x, z, rot, color]`. */
  layer(y: number, entries: Array<[string, number, number, Rot, number]>): Brick[]
  done(spec: TemplateSpec): Template
}

/** Tiny helper for authoring templates in code. Ids are deterministic, never random. */
export function createBuilder(): Builder {
  const bricks: Brick[] = []
  const add: Builder['add'] = (p, x, y, z, r, c) => {
    const brick: Brick = { id: String(bricks.length), p, x, y, z, r, c }
    bricks.push(brick)
    return brick
  }
  return {
    add,
    layer: (y, entries) => entries.map(([p, x, z, r, c]) => add(p, x, y, z, r, c)),
    done(spec) {
      const final = bricks.map((b, i) => ({ ...b, id: `${spec.id}-${i}` }))
      return {
        id: spec.id,
        name: spec.name,
        difficulty: spec.difficulty,
        kind: spec.kind,
        tags: spec.tags,
        baseplate: spec.baseplate,
        bricks: final,
        steps: spec.steps ?? autoSteps(final),
      }
    },
  }
}
