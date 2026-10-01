import { useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLATE_MAX, canShrink, type PlateSide } from '../../core/baseplate'
import type { Baseplate, BlueprintKind } from '../../core/types'
import { useEditor } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useT } from '../../ui/i18n'

const SIDES: PlateSide[] = ['N', 'E', 'S', 'W']
/** How far outside the plate edge (in studs) the buttons sit. */
const GAP = 3
/** The S edge faces the default camera, where a stud spans more pixels: closer keeps it clear of the palette. */
const S_GAP = 2
/** A vehicle's front arrow lies just past the N edge: keep its buttons clear of it. */
const VEHICLE_N_GAP = 8

/** The DOM element holding each edge's buttons (absent when that edge shows none). */
export type EdgeElements = Partial<Record<PlateSide, HTMLDivElement | null>>

function edgeAnchor(side: PlateSide, { w, d }: Baseplate, kind: BlueprintKind, out: THREE.Vector3): THREE.Vector3 {
  switch (side) {
    case 'N': return out.set(w / 2, 0, -(kind === 'vehicle' ? VEHICLE_N_GAP : GAP))
    case 'S': return out.set(w / 2, 0, d + S_GAP)
    case 'W': return out.set(-GAP, 0, d / 2)
    case 'E': return out.set(w + GAP, 0, d / 2)
  }
}

const anchor = new THREE.Vector3()
/** The transform last written to each edge element, so unchanged frames skip the DOM. */
const applied = new WeakMap<HTMLElement, string>()

/** Moves each edge's buttons to that edge's midpoint on screen. */
function positionEdges(edges: EdgeElements, camera: THREE.Camera, size: { width: number; height: number }) {
  const { baseplate, kind } = useGame.getState().data.workshop
  camera.updateMatrixWorld()
  for (const side of SIDES) {
    const el = edges[side]
    if (!el) continue
    edgeAnchor(side, baseplate, kind, anchor).project(camera)
    // Behind the camera the projection mirrors: hide instead.
    const visible = anchor.z < 1
    const x = Math.round(((anchor.x + 1) / 2) * size.width)
    const y = Math.round(((1 - anchor.y) / 2) * size.height)
    const css = visible ? `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)` : 'hidden'
    if (applied.get(el) === css) continue
    applied.set(el, css)
    el.style.visibility = visible ? 'visible' : 'hidden'
    if (visible) el.style.transform = css
  }
}

/**
 * Inside the workshop `<Canvas>`: every frame, moves each edge's buttons (rendered by
 * {@link PlateEdgeButtons} in a DOM layer over the canvas) to that edge's midpoint on screen.
 */
export function PlateEdgeTracker({ edges }: { edges: RefObject<EdgeElements> }) {
  useFrame(({ camera, size }) => positionEdges(edges.current, camera, size))
  return null
}

/**
 * DOM layer over the workshop canvas (under the HUD): ➕ (grow) beside each baseplate edge and,
 * when that edge's strip has no bricks, ➖ (shrink). Positioned by {@link PlateEdgeTracker}.
 * Being a sibling of the canvas, presses here never orbit the camera or place bricks.
 */
export default function PlateEdgeButtons({ edges }: { edges: RefObject<EdgeElements> }) {
  const t = useT()
  const bricks = useGame((s) => s.data.workshop.bricks)
  const baseplate = useGame((s) => s.data.workshop.baseplate)
  const shrinkable = useMemo(
    () => new Map(SIDES.map((side) => [side, canShrink(bricks, baseplate, side)])),
    [bricks, baseplate],
  )

  return (
    <div className="bt-plate-edges">
      {SIDES.map((side) => {
        const size = side === 'E' || side === 'W' ? baseplate.w : baseplate.d
        const grow = size < PLATE_MAX
        const shrink = shrinkable.get(side) === true
        if (!grow && !shrink) return null
        return (
          <div
            key={side}
            className="bt-plate-edge"
            data-testid={`plate-edge-${side}`}
            ref={(el) => {
              edges.current[side] = el
            }}
          >
            {grow && (
              <button
                className="bt-btn bt-icon-btn bt-plate-btn"
                data-testid={`plate-grow-${side}`}
                aria-label={t('plateGrow')}
                onClick={() => useEditor.getState().resizePlate(side, 'grow')}
              >
                ➕
              </button>
            )}
            {shrink && (
              <button
                className="bt-btn bt-icon-btn bt-plate-btn"
                data-testid={`plate-shrink-${side}`}
                aria-label={t('plateShrink')}
                onClick={() => useEditor.getState().resizePlate(side, 'shrink')}
              >
                ➖
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
