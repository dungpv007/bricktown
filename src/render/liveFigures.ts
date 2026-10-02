import { DEFAULT_FIG, figKey, figOf, isFigure } from '../core/figures'
import { pedestrianFigKeys } from '../core/npc/looks'
import { setLiveFigureKeys } from '../core/parts/figureGeometry'
import type { Brick, FigStyle, SaveData } from '../core/types'
import { findGuidedTemplate } from '../state/guidedTemplates'
import { useEditor } from '../state/useEditor'
import { useGame } from '../state/useGame'

const PEDESTRIAN_KEYS = pedestrianFigKeys()

/**
 * Figure looks (`figKey`s) a mounted scene may draw from the shared figure cache right now: the
 * Workshop's bricks, the Guided build's template (built-in or shared with steps), the look about
 * to be placed (its ghost), the default figure (the minifig part's geometry) and the City's
 * pedestrians (a few fixed looks). The figure cache never evicts these.
 */
export function liveFigureKeys(
  data: Pick<SaveData, 'workshop' | 'guided'> & Partial<Pick<SaveData, 'sharedTemplates'>>,
  nextFig: FigStyle,
): Set<string> {
  const keys = new Set([figKey(DEFAULT_FIG), figKey(nextFig), ...PEDESTRIAN_KEYS])
  const add = (bricks: readonly Brick[]) => {
    for (const b of bricks) if (isFigure(b)) keys.add(figKey(figOf(b)))
  }
  add(data.workshop.bricks)
  const template = data.guided ? findGuidedTemplate(data.guided.templateId, data.sharedTemplates ?? []) : undefined
  if (template) add(template.bricks)
  return keys
}

let installed = false

/** Points the figure cache at the live stores (idempotent). Call from modules that draw figures. */
export function installLiveFigureKeys(): void {
  if (installed) return
  installed = true
  setLiveFigureKeys(() => liveFigureKeys(useGame.getState().data, useEditor.getState().fig))
}
