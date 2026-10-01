import { useMemo, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLATE_MAX, canShrink, type PlateSide } from '../../core/baseplate'
import type { Baseplate, BlueprintKind } from '../../core/types'
import { isDragActive } from '../../input/dragActivity'
import { useEditor } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useT } from '../../ui/i18n'
import { plateScreen } from './plateScreen'
import { safeRect } from './safeArea'
import { plateCorners } from './viewFit'

const SIDES: PlateSide[] = ['N', 'E', 'S', 'W']
/** A vehicle's front arrow lies just past the N edge (studs): keep its buttons clear of it. */
const VEHICLE_N_GAP = 8
/** Button group geometry (matches .bt-plate-btn and .bt-plate-edge): the hit area, not the 44px face. */
const BUTTON = 56
const BUTTON_GAP = 6
/** Room between the plate edge on screen and the nearest point of a button's hit area (px). */
const EDGE_CLEARANCE = 8

/** The DOM element holding each edge's buttons (absent when that edge shows none). */
export type EdgeElements = Partial<Record<PlateSide, HTMLDivElement | null>>

/** The two plate corners of each edge (indices into `plateCorners`: (0,0) (w,0) (w,d) (0,d)). */
const EDGE_CORNERS: Record<PlateSide, [number, number]> = { N: [0, 1], E: [1, 2], S: [2, 3], W: [3, 0] }

/** One stud off the plate, perpendicular to each edge (world units). */
const OUTWARD: Record<PlateSide, THREE.Vector3> = {
  N: new THREE.Vector3(0, 0, -1),
  E: new THREE.Vector3(1, 0, 0),
  S: new THREE.Vector3(0, 0, 1),
  W: new THREE.Vector3(-1, 0, 0),
}

/** Where an edge's buttons start from: its midpoint, or past the front arrow for a vehicle's N edge. */
function edgeAnchor(side: PlateSide, { w, d }: Baseplate, kind: BlueprintKind, out: THREE.Vector3): THREE.Vector3 {
  switch (side) {
    case 'N': return out.set(w / 2, 0, kind === 'vehicle' ? -VEHICLE_N_GAP : 0)
    case 'S': return out.set(w / 2, 0, d)
    case 'W': return out.set(0, 0, d / 2)
    case 'E': return out.set(w, 0, d / 2)
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
 * Moves each edge's buttons just outside that edge on screen: from the edge's midpoint, out along
 * the edge's on-screen normal far enough that the whole hit area clears the plate (a convex
 * quadrilateral on screen, so clearing the edge's line clears all of it), then kept inside the
 * HUD-free part of the screen so they stay reachable however the camera is turned. Hidden while a
 * drag is in progress.
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

  const corners = plateCorners(baseplate).map(([x, , z]) => toScreen(point.set(x, 0, z), camera, size))
  plateScreen.bounds = {
    left: Math.min(...corners.map((c) => c.x)),
    right: Math.max(...corners.map((c) => c.x)),
    top: Math.min(...corners.map((c) => c.y)),
    bottom: Math.max(...corners.map((c) => c.y)),
  }
  if (import.meta.env.DEV) {
    const round = (v: number) => Math.round(v * 1000) / 1000
    plateScreen.pose = {
      frame: (plateScreen.pose?.frame ?? 0) + 1,
      camera: [...camera.position.toArray(), ...camera.quaternion.toArray()].map(round),
    }
  }
  const dragging = isDragActive()

  for (const side of SIDES) {
    const el = edges[side]
    if (!el) continue
    const [i, j] = EDGE_CORNERS[side]
    const a = corners[i], b = corners[j]
    const s = toScreen(edgeAnchor(side, baseplate, kind, point), camera, size)
    const out = toScreen(edgeAnchor(side, baseplate, kind, point).add(OUTWARD[side]), camera, size)
    const n = el.childElementCount
    const halfW = (n * BUTTON + (n - 1) * BUTTON_GAP) / 2
    const halfH = BUTTON / 2
    // Behind the camera the projection mirrors: hide instead (and while dragging, out of the way).
    const shown = s.inFront && out.inFront && a.inFront && b.inFront && !dragging
    let x = NaN
    let y = NaN
    if (shown) {
      // The edge's normal on screen, pointing off the plate.
      let nx = b.y - a.y
      let ny = a.x - b.x
      const len = Math.hypot(nx, ny) || 1
      nx /= len
      ny /= len
      if ((out.x - s.x) * nx + (out.y - s.y) * ny < 0) {
        nx = -nx
        ny = -ny
      }
      const dist = halfW * Math.abs(nx) + halfH * Math.abs(ny) + EDGE_CLEARANCE
      x = Math.round(clamp(s.x + nx * dist, safe.left + halfW, safe.right - halfW))
      y = Math.round(clamp(s.y + ny * dist, safe.top + halfH, safe.bottom - halfH))
    }
    const last = applied.get(el)
    if (last && Object.is(last.x, x) && Object.is(last.y, y)) continue
    applied.set(el, { x, y })
    el.style.visibility = shown ? 'visible' : 'hidden'
    if (shown) el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
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
  const on = useEditor((s) => s.plateResize)
  const bricks = useGame((s) => s.data.workshop.bricks)
  const baseplate = useGame((s) => s.data.workshop.baseplate)
  const shrinkable = useMemo(
    () => new Map(SIDES.map((side) => [side, canShrink(bricks, baseplate, side)])),
    [bricks, baseplate],
  )

  if (!on) return null
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
                className="bt-plate-btn"
                data-testid={`plate-grow-${side}`}
                aria-label={t('plateGrow')}
                onClick={() => useEditor.getState().resizePlate(side, 'grow')}
              >
                <span className="bt-plate-btn-face" aria-hidden="true">➕</span>
              </button>
            )}
            {shrink && (
              <button
                className="bt-plate-btn"
                data-testid={`plate-shrink-${side}`}
                aria-label={t('plateShrink')}
                onClick={() => useEditor.getState().resizePlate(side, 'shrink')}
              >
                <span className="bt-plate-btn-face" aria-hidden="true">➖</span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
