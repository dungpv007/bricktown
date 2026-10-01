import { useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLATE_MAX, canShrink, type PlateSide } from '../../core/baseplate'
import type { Baseplate, BlueprintKind } from '../../core/types'
import { useEditor } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useT } from '../../ui/i18n'
import { plateScreen } from './plateScreen'
import { safeRect } from './safeArea'
import { plateCorners } from './viewFit'

const SIDES: PlateSide[] = ['N', 'E', 'S', 'W']
/** How far outside the plate edge (in studs) the buttons sit. */
const GAP = 3
/** A vehicle's front arrow lies just past the N edge: keep its buttons clear of it. */
const VEHICLE_N_GAP = 8
/** Button group geometry (matches .bt-icon-btn and .bt-plate-edge): used to keep groups on screen. */
const BUTTON = 64
const BUTTON_GAP = 10
const BUTTON_SHADOW = 6

/** The DOM element holding each edge's buttons (absent when that edge shows none). */
export type EdgeElements = Partial<Record<PlateSide, HTMLDivElement | null>>

function edgeAnchor(side: PlateSide, { w, d }: Baseplate, kind: BlueprintKind, out: THREE.Vector3): THREE.Vector3 {
  switch (side) {
    case 'N': return out.set(w / 2, 0, -(kind === 'vehicle' ? VEHICLE_N_GAP : GAP))
    case 'S': return out.set(w / 2, 0, d + GAP)
    case 'W': return out.set(-GAP, 0, d / 2)
    case 'E': return out.set(w + GAP, 0, d / 2)
  }
}

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))

const point = new THREE.Vector3()
/** The position last written to each edge element (NaN = hidden), so unchanged frames skip the DOM. */
const applied = new WeakMap<HTMLElement, { x: number; y: number }>()

/** Screen position (pixels) of a world point. */
function toScreen(p: THREE.Vector3, camera: THREE.Camera, size: { width: number; height: number }) {
  p.project(camera)
  return { x: ((p.x + 1) / 2) * size.width, y: ((1 - p.y) / 2) * size.height, inFront: p.z < 1 }
}

/**
 * Moves each edge's buttons to that edge's midpoint on screen, kept inside the HUD-free part of
 * the screen so they stay reachable however the camera is turned.
 */
function positionEdges(
  edges: EdgeElements,
  camera: THREE.Camera,
  size: { width: number; height: number },
  canvas: HTMLElement,
) {
  const { baseplate, kind } = useGame.getState().data.workshop
  camera.updateMatrixWorld()
  const safe = safeRect(canvas)

  const b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const [x, , z] of plateCorners(baseplate)) {
    const s = toScreen(point.set(x, 0, z), camera, size)
    b.left = Math.min(b.left, s.x)
    b.right = Math.max(b.right, s.x)
    b.top = Math.min(b.top, s.y)
    b.bottom = Math.max(b.bottom, s.y)
  }
  plateScreen.bounds = b
  if (import.meta.env.DEV) {
    const round = (v: number) => Math.round(v * 1000) / 1000
    plateScreen.pose = {
      frame: (plateScreen.pose?.frame ?? 0) + 1,
      camera: [...camera.position.toArray(), ...camera.quaternion.toArray()].map(round),
    }
  }

  for (const side of SIDES) {
    const el = edges[side]
    if (!el) continue
    const s = toScreen(edgeAnchor(side, baseplate, kind, point), camera, size)
    const n = el.childElementCount
    const halfW = (n * BUTTON + (n - 1) * BUTTON_GAP) / 2
    const halfH = BUTTON / 2
    // Behind the camera the projection mirrors: hide instead.
    const x = s.inFront ? Math.round(clamp(s.x, safe.left + halfW, safe.right - halfW)) : NaN
    const y = s.inFront ? Math.round(clamp(s.y, safe.top + halfH, safe.bottom - halfH - BUTTON_SHADOW)) : NaN
    const last = applied.get(el)
    if (last && Object.is(last.x, x) && Object.is(last.y, y)) continue
    applied.set(el, { x, y })
    el.style.visibility = s.inFront ? 'visible' : 'hidden'
    if (s.inFront) el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
  }
}

/**
 * Inside the workshop `<Canvas>`: every frame, moves each edge's buttons (rendered by
 * {@link PlateEdgeButtons} in a DOM layer over the canvas) to that edge's midpoint on screen.
 */
export function PlateEdgeTracker({ edges }: { edges: RefObject<EdgeElements> }) {
  useFrame(({ camera, size, gl }) => positionEdges(edges.current, camera, size, gl.domElement))
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
