import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { getTemplate } from '../../content/templates'
import { COLORS, GLASS_COLOR } from '../../core/colors'
import { bounds } from '../../core/model'
import { getPart } from '../../core/parts/catalog'
import { brickBodyGeometry } from '../../core/parts/brickGeometry'
import { rotateNormalY, targetAnchor, type PickHit, type Vec3 } from '../../core/pick'
import { brickCenter } from '../../core/rotation'
import { findMatch, placedBricks, type PlacedCandidate } from '../../core/template'
import type { Brick, GuidedState, Rot, Template } from '../../core/types'
import { useTap } from '../../input/useTap'
import GhostBrick from '../../render/GhostBrick'
import InstancedBricks from '../../render/InstancedBricks'
import { useApp } from '../../state/useApp'
import { useEditor } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useGuided } from '../../state/useGuided'
import Baseplate from '../workshop/Baseplate'
import { Ground, Lights, SKY } from '../workshop/WorkshopScene'
import { modelTop } from '../workshop/viewFit'
import GuidedCamera from './GuidedCamera'

const GLASS_GHOST = '#3fa9f5'
const STATIC_GHOST_OPACITY = 0.28
const STATIC_GHOST_EMISSIVE = 0.05

type Anchor = { x: number; y: number; z: number }
type GhostPointer = (e: ThreeEvent<PointerEvent>, brick: Brick) => void

const sameAnchor = (a: Anchor | null, b: Anchor | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.z === b.z)

const stepBricks = (t: Template, from: number, to: number): Brick[] =>
  t.steps.slice(from, to).flat().map((i) => t.bricks[i])

/** What the pointer is aiming at: a target ghost (fixed spot) or a surface hit (spot depends on the part). */
type Aim = { ghost: Anchor } | { hit: PickHit }

const aimAnchor = (aim: Aim | null, partId: string, rot: Rot): Anchor | null => {
  if (!aim) return null
  return 'ghost' in aim ? aim.ghost : targetAnchor(aim.hit, getPart(partId), rot)
}

/**
 * A brick of the viewed step, in its own colour. Bricks still to place pulse and can be tapped;
 * with `pulse` off (an earlier step being looked at) it is a steady, faint outline-like ghost that
 * must not read as something to tap.
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
  return (
    <mesh
      ref={meshRef}
      geometry={brickBodyGeometry(brick)}
      material={material}
      position={brickCenter(brick)}
      rotation={[0, (brick.r * Math.PI) / 2, 0]}
      onPointerDown={handle}
      onPointerMove={handle}
      onPointerUp={handle}
      dispose={null}
      renderOrder={1}
    />
  )
}

interface WorldProps {
  template: Template
  guided: GuidedState | null
  celebrating: boolean
}

function TemplateWorld({ template, guided, celebrating }: WorldProps) {
  const viewStep = useGuided((s) => s.viewStep)
  const errorSeq = useGuided((s) => s.errorSeq)
  const easy = useApp((s) => s.difficulty === 'easy')
  const partId = useEditor((s) => s.partId)
  const fig = useEditor((s) => s.fig)
  const rot = useEditor((s) => s.rot)
  const color = useEditor((s) => s.color)
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

  // Normal mode: preview of the selected part where the kid points (green on a target, red elsewhere).
  // The aim is kept (not just the anchor) so the preview re-centres right away when only the part
  // or rotation changes; it is stored only when it moves the anchor.
  const [aim, setAimState] = useState<Aim | null>(null)
  const aimRef = useRef<Aim | null>(null)
  const setAim = useCallback((next: Aim | null) => {
    const prev = aimRef.current
    if (prev === next) return
    if (prev && next) {
      const { partId: p, rot: r } = useEditor.getState()
      if (sameAnchor(aimAnchor(prev, p, r), aimAnchor(next, p, r))) return
    }
    aimRef.current = next
    setAimState(next)
  }, [])
  const anchor = useMemo(() => aimAnchor(aim, partId, rot), [aim, partId, rot])

  const el = useThree((s) => s.gl.domElement)
  useEffect(() => {
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') setAim(null)
    }
    el.addEventListener('pointerleave', onLeave)
    return () => el.removeEventListener('pointerleave', onLeave)
  }, [el, setAim])

  const candidateAt = (a: Anchor): PlacedCandidate => ({ p: partId, x: a.x, y: a.y, z: a.z, r: rot, c: color })
  const previewValid =
    anchor !== null && guided !== null && findMatch(template, step, guided.placed, candidateAt(anchor)) !== null

  /** Normal mode: pointer on the baseplate, a placed brick (`brick`) or a target ghost (`ghost`). */
  const handlePointer = useCallback(
    (e: ThreeEvent<PointerEvent>, brick: Brick | null, ghost: Brick | null) => {
      e.stopPropagation() // only the nearest hit counts
      const type = e.nativeEvent.type
      const ed = useEditor.getState()
      const computeAim = (): Aim | null => {
        // Pointing at a target spot means "put the selected part there".
        if (ghost) return { ghost: { x: ghost.x, y: ghost.y, z: ghost.z } }
        if (!e.face) return null
        const local: Vec3 = [e.face.normal.x, e.face.normal.y, e.face.normal.z]
        const normal = brick ? rotateNormalY(local, brick.r) : local
        return { hit: { point: [e.point.x, e.point.y, e.point.z], normal, brick } }
      }
      if (type === 'pointermove') {
        if (e.pointerType === 'mouse' && e.buttons === 0) setAim(computeAim())
        return
      }
      if (type === 'pointerdown') {
        setAim(computeAim())
        return
      }
      if (type !== 'pointerup' || !consumeTap(e.pointerId)) return
      const next = computeAim()
      const a = aimAnchor(next, ed.partId, ed.rot)
      if (!next || !a) return
      setAim(next)
      const ok = useGuided.getState().tryPlace({ p: ed.partId, x: a.x, y: a.y, z: a.z, r: ed.rot, c: ed.color })
      // A wrong spot keeps the (red, shaking) preview visible.
      if (ok) setAim(null)
    },
    [consumeTap, setAim],
  )

  const onGhostPointer = useCallback<GhostPointer>(
    (e, ghost) => {
      if (!easy) {
        handlePointer(e, null, ghost)
        return
      }
      e.stopPropagation()
      if (e.nativeEvent.type === 'pointerup' && consumeTap(e.pointerId)) useGuided.getState().placeGhost(ghost.id)
    },
    [easy, handlePointer, consumeTap],
  )
  const onBaseplatePointer = useCallback((e: ThreeEvent<PointerEvent>) => handlePointer(e, null, null), [handlePointer])
  const onBrickPointer = useCallback((e: ThreeEvent<PointerEvent>, b: Brick) => handlePointer(e, b, null), [handlePointer])
  const normalTaps = interactive && !easy
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

  return (
    <>
      <GuidedCamera key={template.id} size={template.baseplate} startBox={startBox} stepBox={stepBox} height={height} />
      <Lights size={template.baseplate} height={height} />
      <Ground size={template.baseplate} />
      <Baseplate size={template.baseplate} kind={template.kind} onPointer={normalTaps ? onBaseplatePointer : undefined} />
      <InstancedBricks bricks={solid} onBrickPointer={normalTaps ? onBrickPointer : undefined} />
      {ghosts.map((b) => (
        <TargetGhost key={b.id} brick={b} pulse={!viewingPast} onPointer={interactive ? onGhostPointer : undefined} />
      ))}
      {normalTaps && anchor && (
        <GhostBrick partId={partId} fig={fig} rot={rot} anchor={anchor} valid={previewValid} shakeKey={errorSeq} />
      )}
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
