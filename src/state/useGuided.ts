import { create } from 'zustand'
import * as sfx from '../audio/sfx'
import { getTemplate } from '../content/templates'
import { getPart } from '../core/parts/catalog'
import {
  findMatch,
  nextPending,
  stepComplete,
  templateToBlueprint,
  type PlacedCandidate,
} from '../core/template'
import type { Brick, GuidedState, Template } from '../core/types'
import { useApp } from './useApp'
import { useEditor } from './useEditor'
import { useGame } from './useGame'

export interface Celebration {
  templateId: string
  blueprintId: string
}

export interface GuidedStore {
  /** Step shown on screen; at most the current step (earlier steps are for looking back only). */
  viewStep: number
  /** Incremented on every wrong placement so the UI can shake. */
  errorSeq: number
  /** Set when a template was just finished (progress is already cleared and the blueprint saved). */
  celebration: Celebration | null
  /** Begins `templateId` from scratch (replacing any build in progress). */
  start: (templateId: string) => void
  /** Re-enters the saved build: repairs the step index, views the current step, selects its next brick. */
  resume: () => void
  /** Unplaced bricks of the current step (empty without a build). */
  pending: () => Brick[]
  /** Normal mode: true when `candidate` matches a pending brick of the current step (which is then placed). */
  tryPlace: (candidate: PlacedCandidate) => boolean
  /** Easy mode: places a pending brick of the current step by id. */
  placeGhost: (brickId: string) => boolean
  prevStep: () => void
  nextStep: () => void
  dismissCelebration: () => void
}

/**
 * Guided Build progress. Wraps `useGame.data.guided` (which is what gets saved). Never reads or
 * writes `data.workshop`: placed bricks are derived with `placedBricks(template, guided)`.
 */
export const useGuided = create<GuidedStore>()((set, get) => {
  const saved = () => useGame.getState().data.guided

  /** The saved build and its template, or null when there is none (or its template is gone). */
  const active = (): { g: GuidedState; t: Template } | null => {
    const g = saved()
    const t = g ? getTemplate(g.templateId) : undefined
    return g && t ? { g, t } : null
  }

  /** Puts the next brick to place into the editor (part, colour, rotation, palette tab). */
  const selectNext = (t: Template, step: number, placed: readonly string[]) => {
    const next = nextPending(t, step, placed)
    if (!next) return
    const ed = useEditor.getState()
    ed.setTool('place')
    ed.setCategory(getPart(next.p).category)
    ed.setPart(next.p)
    ed.setColor(next.c)
    useEditor.setState({ rot: next.r })
  }

  const firstIncomplete = (t: Template, from: number, placed: readonly string[]) => {
    let step = from
    while (step < t.steps.length && stepComplete(t, step, placed)) step++
    return step
  }

  const finish = (t: Template) => {
    const game = useGame.getState()
    const bp = templateToBlueprint(t, useApp.getState().lang)
    game.upsertBlueprint(bp)
    game.markTemplateCompleted(t.id)
    game.setGuided(null)
    set({ viewStep: 0, celebration: { templateId: t.id, blueprintId: bp.id } })
  }

  /** Marks template brick `id` placed, then advances (and auto-selects) or finishes. */
  const commit = (t: Template, g: GuidedState, id: string) => {
    const placed = [...g.placed, id]
    const step = firstIncomplete(t, g.step, placed)
    if (step >= t.steps.length) {
      finish(t)
      sfx.success()
      return
    }
    useGame.getState().setGuided({ ...g, step, placed })
    set({ viewStep: step })
    if (step !== g.step) {
      selectNext(t, step, placed)
      sfx.success()
    } else {
      sfx.snap()
    }
  }

  return {
    viewStep: 0,
    errorSeq: 0,
    celebration: null,

    start: (templateId) => {
      const t = getTemplate(templateId)
      if (!t) return
      useGame.getState().setGuided({ templateId, step: 0, placed: [] })
      set({ viewStep: 0, celebration: null })
      selectNext(t, 0, [])
    },

    resume: () => {
      const g = saved()
      if (!g) return
      const t = getTemplate(g.templateId)
      if (!t) {
        useGame.getState().setGuided(null)
        return
      }
      const known = new Set(t.bricks.map((b) => b.id))
      const placed = g.placed.filter((id) => known.has(id))
      const step = firstIncomplete(t, 0, placed)
      if (step >= t.steps.length) {
        finish(t)
        return
      }
      if (step !== g.step || placed.length !== g.placed.length) {
        useGame.getState().setGuided({ ...g, step, placed })
      }
      set({ viewStep: step, celebration: null })
      selectNext(t, step, placed)
    },

    pending: () => {
      const a = active()
      if (!a) return []
      return (a.t.steps[a.g.step] ?? []).map((i) => a.t.bricks[i]).filter((b) => !a.g.placed.includes(b.id))
    },

    tryPlace: (candidate) => {
      const a = active()
      if (!a) return false
      const match = findMatch(a.t, a.g.step, a.g.placed, candidate)
      if (!match) {
        set((s) => ({ errorSeq: s.errorSeq + 1 }))
        sfx.error()
        return false
      }
      commit(a.t, a.g, match.id)
      return true
    },

    placeGhost: (brickId) => {
      const a = active()
      if (!a) return false
      if (!get().pending().some((b) => b.id === brickId)) return false
      commit(a.t, a.g, brickId)
      return true
    },

    prevStep: () => set((s) => ({ viewStep: Math.max(0, s.viewStep - 1) })),

    nextStep: () => {
      const g = saved()
      if (g) set((s) => ({ viewStep: Math.min(g.step, s.viewStep + 1) }))
    },

    dismissCelebration: () => {
      if (get().celebration) set({ celebration: null })
    },
  }
})

// A finished model's celebration must not linger and flash when the kid comes back later.
useApp.subscribe((state, prev) => {
  if (prev.mode === 'guided' && state.mode !== 'guided') useGuided.getState().dismissCelebration()
})
