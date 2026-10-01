import { create } from 'zustand'
import * as sfx from '../audio/sfx'
import { trayCards, type TrayCard } from '../core/guidedTray'
import { nextRot } from '../core/rotation'
import { findMatch, stepComplete, templateToBlueprint, type PlacedCandidate } from '../core/template'
import type { Brick, GuidedState, Rot, Template } from '../core/types'
import { findGuidedTemplate } from './guidedTemplates'
import { useApp } from './useApp'
import { useGame } from './useGame'
import { useGuidedDrag } from './useGuidedDrag'

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
  /** Normal mode: quarter turns of each tray card (by card key; missing = unturned). Cleared on each new step. */
  cardRots: Record<string, Rot>
  /** The tray card ↻ turns: the last one tapped or dragged (null: the first card). Cleared on each new step. */
  selectedCard: string | null
  /** True once a brick was placed this session, by drag or tap (hides the "drag me" hint). Not saved. */
  placedOnce: boolean
  /** Begins `templateId` from scratch (replacing any build in progress). */
  start: (templateId: string) => void
  /** Re-enters the saved build: repairs the step index and views the current step with a fresh tray. */
  resume: () => void
  /** Unplaced bricks of the current step (empty without a build). */
  pending: () => Brick[]
  /** The tray: the current step's unplaced bricks grouped by kind (empty without a build). */
  cards: () => TrayCard[]
  /** Quarter turns of tray card `key`. */
  cardRot: (key: string) => Rot
  selectCard: (key: string) => void
  /** Turns the selected tray card (or the first one) a quarter turn. */
  rotateCard: () => void
  /** Easy mode: a dragged piece released while snapped onto pending brick `brickId`; returns the placed brick. */
  dropOn: (brickId: string) => Brick | null
  /** Normal mode: a dragged piece released as `candidate`; returns the placed template brick, or null (shakes). */
  dropAt: (candidate: PlacedCandidate) => Brick | null
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
    const t = g ? findGuidedTemplate(g.templateId) : undefined
    return g && t ? { g, t } : null
  }

  /** A new step starts with an unturned tray and nothing selected. */
  const freshTray = { cardRots: {}, selectedCard: null }

  /** Entering a build: no drag left over from an earlier visit (its fly-back must not replay). */
  const forgetDrag = () => useGuidedDrag.setState({ card: null, pointer: null, inScene: false, last: null, hintTo: null })

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
    if (!get().placedOnce) set({ placedOnce: true })
    const step = firstIncomplete(t, g.step, placed)
    if (step >= t.steps.length) {
      finish(t)
      sfx.success()
      return
    }
    useGame.getState().setGuided({ ...g, step, placed })
    if (step !== g.step) {
      set({ viewStep: step, ...freshTray })
      sfx.success()
    } else {
      set({ viewStep: step })
      sfx.snap()
    }
  }

  return {
    viewStep: 0,
    errorSeq: 0,
    celebration: null,
    cardRots: {},
    selectedCard: null,
    placedOnce: false,

    start: (templateId) => {
      const t = findGuidedTemplate(templateId)
      if (!t) return
      useGame.getState().setGuided({ templateId, step: 0, placed: [] })
      set({ viewStep: 0, celebration: null, ...freshTray })
      forgetDrag()
    },

    resume: () => {
      const g = saved()
      if (!g) return
      const t = findGuidedTemplate(g.templateId)
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
      set({ viewStep: step, celebration: null, ...freshTray })
      forgetDrag()
    },

    pending: () => {
      const a = active()
      if (!a) return []
      return (a.t.steps[a.g.step] ?? []).map((i) => a.t.bricks[i]).filter((b) => !a.g.placed.includes(b.id))
    },

    cards: () => trayCards(get().pending()),

    cardRot: (key) => get().cardRots[key] ?? 0,

    selectCard: (key) => {
      if (get().selectedCard !== key) set({ selectedCard: key })
    },

    rotateCard: () => {
      const cards = get().cards()
      const key = cards.find((c) => c.key === get().selectedCard)?.key ?? cards[0]?.key
      if (key === undefined) return
      set((s) => ({ selectedCard: key, cardRots: { ...s.cardRots, [key]: nextRot(s.cardRots[key] ?? 0) } }))
    },

    dropOn: (brickId) => {
      const brick = get().pending().find((b) => b.id === brickId)
      return brick && get().placeGhost(brickId) ? brick : null
    },

    dropAt: (candidate) => {
      const a = active()
      const match = a ? findMatch(a.t, a.g.step, a.g.placed, candidate) : null
      return get().tryPlace(candidate) ? match : null
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
