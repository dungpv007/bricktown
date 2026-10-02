import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { create } from 'zustand'
import { scaleOf } from '../../core/city'
import type { Baseplate, Blueprint, CityPlacement } from '../../core/types'
import { gameById, gameForSource } from '../../play/registry'
import { renderStats } from '../../render/renderStats'
import { resolveRenderable } from '../../render/sources'
import { useApp } from '../../state/useApp'
import { useCityEditor } from '../../state/useCityEditor'
import { useT } from '../../ui/i18n'
import { playFromCity } from './playEntry'
import { bakedHeight, footprintBox, PLACEHOLDER_HEIGHT } from './Placements'
import '../../play/play.css'

/**
 * The City's ▶️ badges: one floats over every placement whose template offers a role-play game (see
 * play/registry), and a tap opens the game. Every registered game gets a badge; one that has not
 * landed yet opens its coming-soon card. They show only while looking around: not while painting,
 * dragging, or with a placement selected (its action bar then offers 🎮), and not when the kid
 * turned them off (▶️ in the top-right controls).
 *
 * Two halves: `PlayBadgeAnchors` inside the canvas works out where each badge goes and moves the
 * buttons on every rendered frame (render on demand: no frames of its own); `PlayBadgeLayer` in the
 * City's HTML overlay draws the buttons, under the City's other controls.
 */

/** Room (studs) between a model's top and its badge. */
const BADGE_GAP = 3

interface Badge {
  placementId: string
  gameId: string
  /** World point the badge floats at. */
  at: [number, number, number]
}

/** The badges of the city on screen (set by the canvas half, drawn by the HTML half). */
const useBadges = create<{ badges: Badge[]; hidden: boolean }>()(() => ({ badges: [], hidden: false }))

/** The buttons drawn now, by placement id (moved straight in the DOM on each frame). */
const buttons = new Map<string, HTMLElement>()

const point = new THREE.Vector3()

/** Inside the City canvas: where the badges go, and keeping the buttons on them as the camera moves. */
export function PlayBadgeAnchors({ placements, blueprints, sizeOf, dragging }: {
  placements: CityPlacement[]
  blueprints: Blueprint[]
  sizeOf: (source: string) => Baseplate
  /** A placement is being dragged. */
  dragging: boolean
}) {
  const badges = useMemo<Badge[]>(() => {
    const out: Badge[] = []
    for (const p of placements) {
      const game = gameForSource(p.source)
      if (!game) continue
      const r = resolveRenderable(p.source, { blueprints })
      const top = (r ? bakedHeight(r.baked) : PLACEHOLDER_HEIGHT) * scaleOf(p)
      const b = footprintBox(p, sizeOf(p.source))
      out.push({ placementId: p.id, gameId: game.id, at: [(b.x0 + b.x1) / 2, top + BADGE_GAP, (b.z0 + b.z1) / 2] })
    }
    return out
  }, [placements, blueprints, sizeOf])
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    useBadges.setState({ badges, hidden: dragging })
    invalidate()
  }, [badges, dragging, invalidate])
  useEffect(() => () => useBadges.setState({ badges: [], hidden: false }), [])

  const camera = useThree((s) => s.camera)
  const el = useThree((s) => s.gl.domElement)
  useFrame(() => {
    if (buttons.size === 0) return
    const rect = el.getBoundingClientRect()
    for (const b of useBadges.getState().badges) {
      const button = buttons.get(b.placementId)
      if (!button) continue
      point.set(...b.at).project(camera)
      const onScreen = point.z < 1 && Math.abs(point.x) <= 1.1 && Math.abs(point.y) <= 1.1
      const x = rect.left + ((point.x + 1) / 2) * rect.width
      const y = rect.top + ((1 - point.y) / 2) * rect.height
      button.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
      button.style.visibility = onScreen ? 'visible' : 'hidden'
    }
  })
  return null
}

/** In the City's HTML overlay: the ▶️ buttons (placed by `PlayBadgeAnchors`). */
export function PlayBadgeLayer() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const on = useApp((s) => s.playBadges)
  const busy = useCityEditor((s) => s.roadMode || s.draggedSource !== null || s.selectedPlacementId !== null)
  const { badges, hidden } = useBadges()
  const shown = on && !busy && !hidden
  // New buttons are placed on the next frame.
  useEffect(() => {
    if (shown) renderStats.invalidate()
  }, [shown, badges])
  if (!shown) return null
  return (
    <div className="bt-play-badges" data-testid="play-badges">
      {badges.map((b) => {
        const name = gameById(b.gameId)?.name[lang] ?? ''
        return (
          <button
            key={b.placementId}
            ref={(node) => {
              if (node) buttons.set(b.placementId, node)
              else buttons.delete(b.placementId)
            }}
            className="bt-btn bt-play-badge"
            style={{ visibility: 'hidden' }}
            data-testid={`play-badge-${b.placementId}`}
            data-game={b.gameId}
            aria-label={`${t('playAct')}: ${name}`}
            title={name}
            onClick={() => playFromCity(b.gameId, b.placementId)}
          >
            ▶
          </button>
        )
      })}
    </div>
  )
}
