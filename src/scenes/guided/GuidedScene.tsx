import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { getTemplate } from '../../content/templates'
import { COLORS, GLASS_COLOR } from '../../core/colors'
import { SNAP_RADIUS, dropAnchor, snapTarget } from '../../core/guidedTray'
import { bounds } from '../../core/model'
import { getPart } from '../../core/parts/catalog'
import { brickBodyGeometry } from '../../core/parts/brickGeometry'
import { rotateNormalY, type PickHit, type Vec3 } from '../../core/pick'
import { brickCenter } from '../../core/rotation'
import { findMatch, placedBricks } from '../../core/template'
import type { Brick, FigStyle, GuidedState, Rot, Template } from '../../core/types'
import { registerPaletteDropTarget, type ClientPoint } from '../../input/paletteDrag'
import { useTap } from '../../input/useTap'
import GhostBrick from '../../render/GhostBrick'
import InstancedBricks, { brickOfInstance } from '../../render/InstancedBricks'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import { useGuided } from '../../state/useGuided'
import { useGuidedDrag, type DraggedCard, type DropOutcome } from '../../state/useGuidedDrag'
import Baseplate from '../workshop/Baseplate'
import { plateScreen } from '../workshop/plateScreen'
import { Ground, Lights, SKY } from '../workshop/WorkshopScene'
import { modelTop } from '../workshop/viewFit'
import GuidedCamera from './GuidedCamera'

const GLASS_GHOST = '#3fa9f5'
const STATIC_GHOST_OPACITY = 0.28
const STATIC_GHOST_EMISSIVE = 0.05
const POP_SECONDS = 0.35
const noRaycast = () => null

type Anchor = { x: number; y: number; z: number }
type GhostPointer = (e: ThreeEvent<PointerEvent>, brick: Brick) => void

/** What the finger points at in the view: the surface hit and, when it is a target ghost, that brick. */
type Aim = { hit: PickHit; ghost: Brick | null }

/** The dragged piece as shown in the view: where it would go, and whether it fits there. */
interface Preview {
  partId: string
  fig?: FigStyle
  rot: Rot
  anchor: Anchor
  valid: boolean
  /** Easy mode: the target ghost the piece snapped onto. */
  snapId?: string
}

const stepBricks = (t: Template, from: number, to: number): Brick[] =>
  t.steps.slice(from, to).flat().map((i) => t.bricks[i])

/**
 * A brick of the viewed step, in its own colour. Bricks still to place pulse; with `pulse` off (an
 * earlier step being looked at) it is a steady, faint outline-like ghost that must not read as
 * something to place. Ghosts are picked by the tray drag (`userData.ghost`).
 */
function TargetGhost({ brick, pulse = true, onPointer }: { brick: Brick; pulse?: boolean; onPointer?: GhostPointer }) {
  // One material per ghost: each pulses in its own colour (only a handful per step).
  const [material] = useState(() => {
    const c = COLORS[brick.c]
    // Glass is nearly white: give its ghost a clear sky-blue glow so it still stands out.
    const hex = brick.c === GLASS_COLOR ? GLASS_GHOST : (c?.hex ?? '#ffffff')
    return new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      roughness: 0.4,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  })
  useEffect(() => () => material.dispose(), [material])
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const mat = meshRef.current?.material as THREE.MeshStandardMaterial | undefined
    if (!mat) return
    if (!pulse) {
      mat.opacity = STATIC_GHOST_OPACITY
      mat.emissiveIntensity = STATIC_GHOST_EMISSIVE
      return
    }
    const wave = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)
    mat.opacity = 0.3 + 0.35 * wave
    mat.emissiveIntensity = 0.15 + 0.45 * wave
  })
  const handle = onPointer ? (e: ThreeEvent<PointerEvent>) => onPointer(e, brick) : undefined
  const userData = useMemo(() => ({ ghost: brick }), [brick])
  return (
    <mesh
      ref={meshRef}
      geometry={brickBodyGeometry(brick)}
      material={material}
      position={brickCenter(brick)}
      rotation={[0, (brick.r * Math.PI) / 2, 0]}
      userData={userData}
      onPointerDown={handle}
      onPointerUp={handle}
      dispose={null}
      renderOrder={1}
    />
  )
}

/** A short white puff around a brick that was just dropped in place. */
function PlacePop({ brick }: { brick: Brick }) {
  const [material] = useState(
    () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }),
  )
  useEffect(() => () => material.dispose(), [material])
  const meshRef = useRef<THREE.Mesh>(null)
  const start = useRef<number | null>(null)
  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh || !mesh.visible) return
    if (start.current === null) start.current = clock.elapsedTime
    const k = (clock.elapsedTime - start.current) / POP_SECONDS
    if (k >= 1) {
      mesh.visible = false
      return
    }
    mesh.scale.setScalar(1 + 0.3 * k)
    ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k)
  })
  return (
    <mesh
      ref={meshRef}
      geometry={brickBodyGeometry(brick)}
      material={material}
      position={brickCenter(brick)}
      rotation={[0, (brick.r * Math.PI) / 2, 0]}
      raycast={noRaycast}
      dispose={null}
      renderOrder={2}
    />
  )
}

/** Keeps `useGuidedDrag.hintTo` on the screen spot of `brick` (the "drag me" hand's goal) while mounted. */
function HintTracker({ brick }: { brick: Brick }) {
  const el = useThree((s) => s.gl.domElement)
  const point = useMemo(() => {
    const [x, y, z] = brickCenter(brick)
    return new THREE.Vector3(x, y, z)
  }, [brick])
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    v.copy(point).project(camera)
    const r = el.getBoundingClientRect()
    const x = r.left + ((v.x + 1) / 2) * r.width
    const y = r.top + ((1 - v.y) / 2) * r.height
    const prev = useGuidedDrag.getState().hintTo
    if (!prev || Math.abs(prev.x - x) > 2 || Math.abs(prev.y - y) > 2) useGuidedDrag.setState({ hintTo: { x, y } })
  })
  useEffect(() => () => useGuidedDrag.setState({ hintTo: null }), [])
  return null
}

interface WorldProps {
  template: Template
  guided: GuidedState | null
  celebrating: boolean
}

function TemplateWorld({ template, guided, celebrating }: WorldProps) {
  const viewStep = useGuided((s) => s.viewStep)
  const errorSeq = useGuided((s) => s.errorSeq)
  const dropped = useGuided((s) => s.dropped)
  const easy = useApp((s) => s.difficulty === 'easy')
  const consumeTap = useTap()

  const step = guided?.step ?? 0
  const viewingPast = guided !== null && viewStep < step
  // Placement only happens on the current step; looking back at a step is read-only.
  const interactive = guided !== null && !celebrating && !viewingPast

  const { solid, ghosts } = useMemo(() => {
    if (celebrating || !guided) return { solid: template.bricks, ghosts: [] as Brick[] }
    if (viewingPast) return { solid: stepBricks(template, 0, viewStep), ghosts: stepBricks(template, viewStep, viewStep + 1) }
    const placed = placedBricks(template, guided)
    return { solid: placed, ghosts: stepBricks(template, step, step + 1).filter((b) => !guided.placed.includes(b.id)) }
  }, [template, guided, celebrating, viewingPast, viewStep, step])

  const el = useThree((s) => s.gl.domElement)
  const get = useThree((s) => s.get)

  // The plate, the placed bricks and the target ghosts: what a dragged piece can point at.
  const pickRoot = useRef<THREE.Group>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pick = useCallback(
    (p: ClientPoint): Aim | null => {
      const root = pickRoot.current
      if (!root) return null
      const rect = el.getBoundingClientRect()
      const ndc = new THREE.Vector2(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, get().camera)
      for (const h of raycaster.intersectObject(root, true)) {
        if (!h.face) continue
        const ghost = (h.object.userData.ghost as Brick | undefined) ?? null
        const brick = ghost ? null : (brickOfInstance(h.object, h.instanceId) ?? null)
        const local: Vec3 = [h.face.normal.x, h.face.normal.y, h.face.normal.z]
        return { hit: { point: [h.point.x, h.point.y, h.point.z], normal: brick ? rotateNormalY(local, brick.r) : local, brick }, ghost }
      }
      return null
    },
    [el, get, raycaster],
  )

  // Lets e2e specs (dev handle) aim at bricks, as in the workshop.
  useEffect(() => {
    plateScreen.project = ([x, y, z]) => {
      const v = new THREE.Vector3(x, y, z).project(get().camera)
      const r = el.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    }
    return () => {
      plateScreen.project = null
    }
  }, [el, get])

  const [preview, setPreview] = useState<Preview | null>(null)
  const [pop, setPop] = useState<{ brick: Brick; seq: number } | null>(null)
  const easyRef = useRef(easy)
  const guidedRef = useRef(guided)
  useEffect(() => {
    easyRef.current = easy
    guidedRef.current = guided
  })

  // Pieces dragged out of the tray: a ghost in the view, placed on release (see GuidedUI's tray).
  useEffect(() => {
    if (!interactive) return
    const overView = (p: ClientPoint) => document.elementFromPoint(p.x, p.y) === el
    /** Where the dragged `card` would go for `aim`: snapped onto a target (easy) or at the finger (normal). */
    const previewOf = (card: DraggedCard, aim: Aim | null): Preview | null => {
      if (!aim) return null
      if (easyRef.current) {
        const target = snapTarget(card.bricks, aim.hit.point, SNAP_RADIUS)
        return target && { partId: card.p, fig: card.fig, rot: target.r, anchor: target, valid: true, snapId: target.id }
      }
      const anchor = dropAnchor(aim.hit, aim.ghost, getPart(card.p), card.r)
      const g = guidedRef.current
      const valid = g !== null && findMatch(template, g.step, g.placed, { p: card.p, c: card.c, r: card.r, ...anchor }) !== null
      return { partId: card.p, fig: card.fig, rot: card.r, anchor, valid }
    }
    const unregister = registerPaletteDropTarget({
      hover: (p) => {
        const drag = useGuidedDrag.getState()
        if (!drag.card) return
        if (!p) {
          setPreview(null)
          drag.end('cancelled', null)
          return
        }
        const next = overView(p) ? previewOf(drag.card, pick(p)) : null
        setPreview(next)
        drag.move(p, next !== null)
      },
      drop: (p) => {
        const drag = useGuidedDrag.getState()
        const card = drag.card
        if (!card) return
        setPreview(null)
        if (!overView(p)) {
          drag.end('cancelled', p)
          return
        }
        const next = previewOf(card, pick(p))
        const guidedStore = useGuided.getState()
        let placed: Brick | null = null
        let outcome: DropOutcome = 'missed' // released on nothing: back to the tray, no penalty
        if (next?.snapId !== undefined) {
          placed = guidedStore.dropOn(next.snapId)
          if (placed) outcome = 'placed'
        } else if (next && !easyRef.current) {
          placed = guidedStore.dropAt({ p: card.p, c: card.c, r: card.r, ...next.anchor })
          outcome = placed ? 'placed' : 'rejected'
        }
        if (placed) setPop((prev) => ({ brick: placed, seq: (prev?.seq ?? 0) + 1 }))
        drag.end(outcome, p)
      },
    })
    return () => {
      unregister()
      setPreview(null)
      useGuidedDrag.getState().end('cancelled', null)
    }
  }, [interactive, el, pick, template])

  // Easy mode: tapping a pulsing ghost still places it (for the youngest builders).
  const onGhostPointer = useCallback<GhostPointer>(
    (e, ghost) => {
      e.stopPropagation()
      if (e.nativeEvent.type === 'pointerup' && consumeTap(e.pointerId)) useGuided.getState().placeGhost(ghost.id)
    },
    [consumeTap],
  )
  const tapToPlace = interactive && easy

  // The camera starts on what is on the plate so far, then checks each new step (or the finished
  // model) is in view; the sun is placed for the finished model.
  const startBox = useMemo(() => bounds([...solid, ...ghosts]), [solid, ghosts])
  // Depends on the step only (not on each placement), so placing bricks never re-frames.
  const shownStep = viewingPast ? viewStep : step
  const finished = celebrating || guided === null
  const stepBox = useMemo(
    () => bounds(finished ? template.bricks : stepBricks(template, shownStep, shownStep + 1)),
    [template, finished, shownStep],
  )
  const height = useMemo(() => modelTop(bounds(template.bricks)), [template])
  const hintBrick = interactive && step === 0 && !dropped ? (ghosts[0] ?? null) : null

  return (
    <>
      <GuidedCamera key={template.id} size={template.baseplate} startBox={startBox} stepBox={stepBox} height={height} />
      <Lights size={template.baseplate} height={height} />
      <Ground size={template.baseplate} />
      <group ref={pickRoot}>
        <Baseplate size={template.baseplate} kind={template.kind} />
        <InstancedBricks bricks={solid} />
        {ghosts.map((b) =>
          // The ghost a dragged piece snapped onto gives way to the green piece itself.
          b.id === preview?.snapId ? null : (
            <TargetGhost key={b.id} brick={b} pulse={!viewingPast} onPointer={tapToPlace ? onGhostPointer : undefined} />
          ),
        )}
      </group>
      {interactive && (
        <GhostBrick
          partId={preview?.partId ?? 'brick_1x1'}
          fig={preview?.fig}
          rot={preview?.rot ?? 0}
          anchor={preview?.anchor ?? null}
          valid={preview?.valid ?? false}
          visible={preview !== null}
          shakeKey={errorSeq}
        />
      )}
      {pop && <PlacePop key={pop.seq} brick={pop.brick} />}
      {hintBrick && <HintTracker key={hintBrick.id} brick={hintBrick} />}
    </>
  )
}

function GuidedWorld() {
  const guided = useGame((s) => s.data.guided)
  const celebration = useGuided((s) => s.celebration)
  const templateId = celebration?.templateId ?? guided?.templateId
  const template = templateId ? getTemplate(templateId) : undefined
  if (!template) return null
  return <TemplateWorld template={template} guided={celebration ? null : guided} celebrating={celebration !== null} />
}

/** 3D view of a Guided Build: placed bricks, pulsing ghosts for the bricks of the current step. */
export default function GuidedScene() {
  return (
    <Canvas shadows="percentage" dpr={[1, 1.75]} data-testid="guided-canvas">
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 80, 220]} />
      <GuidedWorld />
    </Canvas>
  )
}
