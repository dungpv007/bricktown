import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { bounds, canPlace, pointerAnchor, type Bounds } from '../../core/model'
import { getPart } from '../../core/parts/catalog'
import { rotateNormalY, type PickHit, type Vec3 } from '../../core/pick'
import type { Baseplate as BaseplateSize, Brick, PartDef, Rot } from '../../core/types'
import { registerPaletteDropTarget, type ClientPoint } from '../../input/paletteDrag'
import BtCanvas from '../../render/BtCanvas'
import GhostBrick from '../../render/GhostBrick'
import InstancedBricks, { brickOfInstance } from '../../render/InstancedBricks'
import SelectionHighlight from '../../render/SelectionHighlight'
import { useSunShadow } from '../../render/useSunShadow'
import { useApp } from '../../state/useApp'
import { useEditor, type ViewShift } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import Baseplate from './Baseplate'
import { cameraView } from './cameraView'
import PlateEdgeButtons, { PlateEdgeTracker, type EdgeElements } from './PlateEdgeButtons'
import { plateScreen } from './plateScreen'
import { safeRect, toNdc } from './safeArea'
import { useWorkshopGestures } from './useWorkshopGestures'
import { VIEW_FOV, defaultView, modelTop, plateCorners, projectBounds, rectInside, workshopFit } from './viewFit'

export const SKY = '#87ceeb'
const GROUND = '#a9dc9b'
const SHADOW_MAP_SIZE = 1024

type Anchor = { x: number; y: number; z: number }

const sameAnchor = (a: Anchor | null, b: Anchor | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.z === b.z)

/** Sun offset from the plate centre; tall models push it further out so their tops still cast shadows. */
const SUN_OFFSET: Vec3 = [14, 28, 10]

/** `height`: top of the tallest model (world units) the shadows must cover. */
export function Lights({ size, height = 0 }: { size: BaseplateSize; height?: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const cx = size.w / 2
  const cz = size.d / 2
  const reach = Math.max(1, (height + 8) / SUN_OFFSET[1])
  const extent = Math.max(size.w, size.d) * 0.75 + 4 + height * 0.6
  const { castShadow, mapSize } = useSunShadow(SHADOW_MAP_SIZE)

  useLayoutEffect(() => {
    const cam = light.current?.shadow.camera
    if (!cam) return
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = 120 * reach
    cam.updateProjectionMatrix()
  }, [extent, reach])

  return (
    <>
      <hemisphereLight args={['#ffffff', '#7a9a6a', 1.6]} />
      <primitive object={target} position={[cx, 0, cz]} />
      <directionalLight
        ref={light}
        target={target}
        position={[cx + SUN_OFFSET[0] * reach, SUN_OFFSET[1] * reach, cz + SUN_OFFSET[2] * reach]}
        intensity={2.2}
        castShadow={castShadow}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
    </>
  )
}

const FOV = VIEW_FOV
/** How long the camera glides to re-fit the plate after a resize. */
const REFIT_MS = 350

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Room left around the fitted plate for the edge ➕/➖ buttons (pixels). */
const FIT_PAD = 72

/** Framing that shows the whole plate (and its model, within limits) in the HUD-free part of the canvas, looking along `dir`. */
function fitPlate(size: BaseplateSize, model: Bounds | null, dir: Vec3, canvas: HTMLElement, width: number, height: number) {
  const r = safeRect(canvas)
  const pad = Math.max(0, Math.min(FIT_PAD, (r.right - r.left) / 4, (r.bottom - r.top) / 4))
  const safe = toNdc({ left: r.left + pad, top: r.top + pad, right: r.right - pad, bottom: r.bottom - pad }, width, height)
  return { safe, ...workshopFit(size, model, dir, width / height, safe) }
}

interface Glide { from: { p: Vec3; t: Vec3 }; to: { p: Vec3; t: Vec3 }; start: number }

/**
 * Camera + orbit controls framing the baseplate as it was at mount; remount (via `key`) to re-frame.
 * The plate and `model` (the bounds of the bricks on it, within `workshopFit`'s limits) are framed
 * inside the part of the screen the HUD leaves free. Each new `shift` moves the camera by that
 * much, following bricks that moved after a resize; after a resize that pushes the plate out of
 * the free area the camera glides (same angles) to fit it again.
 */
function CameraRig({
  size,
  model = null,
  shift,
  cancelGlideRef,
}: {
  size: BaseplateSize
  model?: Bounds | null
  shift?: ViewShift
  /** Set to a function that stops the current glide (e.g. when a press lands on a brick). */
  cancelGlideRef?: RefObject<(() => void) | null>
}) {
  const span = Math.max(size.w, size.d)
  const canvas = useThree((s) => s.gl.domElement)
  const view = useThree((s) => s.size)
  // Fixed at mount: later size changes must not snap the view back to the plate centre.
  const [{ target, position, safe }] = useState(() => {
    const frame = defaultView(size)
    const dir = unit([frame.position[0] - frame.target[0], frame.position[1], frame.position[2] - frame.target[2]])
    return fitPlate(size, model, dir, canvas, view.width, view.height)
  })
  const camera = useRef<THREE.PerspectiveCamera>(null)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const glide = useRef<Glide | null>(null)
  const invalidate = useThree((s) => s.invalidate)
  const seenShift = useRef(shift?.seq)
  useLayoutEffect(() => {
    if (!shift || shift.seq === seenShift.current) return
    seenShift.current = shift.seq
    const cam = camera.current
    const ctl = controls.current
    if (!cam || !ctl) return
    cam.position.x += shift.dx
    cam.position.z += shift.dz
    ctl.target.x += shift.dx
    ctl.target.z += shift.dz
    ctl.update()
    const g = glide.current
    if (g) {
      for (const v of [g.from.p, g.from.t, g.to.p, g.to.t]) {
        v[0] += shift.dx
        v[2] += shift.dz
      }
    }
  }, [shift])

  // What the last framing check saw: plate size, canvas size and the HUD-free rect (NDC) then.
  const fitted = useRef({ w: size.w, d: size.d, width: view.width, height: view.height, safe })
  // Declared after the shift effect: a resize's shift is applied before checking the fit.
  useLayoutEffect(() => {
    const f = fitted.current
    const plateChanged = f.w !== size.w || f.d !== size.d
    const viewChanged = f.width !== view.width || f.height !== view.height
    if (!plateChanged && !viewChanged) return
    const cam = camera.current
    const ctl = controls.current
    if (!cam || !ctl) return
    const p: Vec3 = [cam.position.x, cam.position.y, cam.position.z]
    const t: Vec3 = [ctl.target.x, ctl.target.y, ctl.target.z]
    const next = fitPlate(size, model, unit([p[0] - t[0], p[1] - t[1], p[2] - t[2]]), canvas, view.width, view.height)
    let refit: boolean
    if (plateChanged) {
      // The plate grew or shrank: glide only when it no longer fits the free area.
      const shown = projectBounds(plateCorners(size), p, t, FOV, view.width / view.height)
      refit = !(shown && rectInside(shown, next.safe, 0.01))
    } else {
      // The window resized or the device rotated: a plate that was fully shown is framed again
      // for the new screen; a close-up the player zoomed into is left alone.
      const before = projectBounds(plateCorners(size), p, t, FOV, f.width / f.height)
      refit = before !== null && rectInside(before, f.safe, 0.01)
    }
    fitted.current = { w: size.w, d: size.d, width: view.width, height: view.height, safe: next.safe }
    if (refit) {
      glide.current = { from: { p, t }, to: { p: next.position, t: next.target }, start: performance.now() }
      invalidate() // render on demand: the glide runs from the frame loop
    }
  }, [size, model, canvas, view, invalidate])

  // Any camera drag by the player cancels a glide. Passed as a prop so it follows the controls
  // instance drei recreates (e.g. when the default camera changes), not just the first one.
  const cancelGlide = useCallback(() => {
    glide.current = null
  }, [])
  useEffect(() => {
    if (!cancelGlideRef) return
    cancelGlideRef.current = cancelGlide
    return () => {
      if (cancelGlideRef.current === cancelGlide) cancelGlideRef.current = null
    }
  }, [cancelGlideRef, cancelGlide])

  useFrame(() => {
    const g = glide.current
    const cam = camera.current
    const ctl = controls.current
    if (!g || !cam || !ctl) return
    const k = Math.min(1, (performance.now() - g.start) / REFIT_MS)
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2 // ease in-out
    const mix = (a: Vec3, b: Vec3, i: number) => a[i] + (b[i] - a[i]) * e
    cam.position.set(mix(g.from.p, g.to.p, 0), mix(g.from.p, g.to.p, 1), mix(g.from.p, g.to.p, 2))
    ctl.target.set(mix(g.from.t, g.to.t, 0), mix(g.from.t, g.to.t, 1), mix(g.from.t, g.to.t, 2))
    ctl.update()
    if (k >= 1) glide.current = null
    else invalidate() // the next step of the glide
  })

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault position={position} fov={FOV} near={0.1} far={500} />
      <OrbitControls
        ref={controls}
        makeDefault
        onStart={cancelGlide}
        target={target}
        enableDamping
        dampingFactor={0.12}
        minDistance={4}
        maxDistance={span * 4 + 20 + modelTop(model) * 2}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2 - 0.1}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />
    </>
  )
}

/** Big grass plane under the baseplate. */
export function Ground({ size }: { size: BaseplateSize }) {
  return (
    <mesh position={[size.w / 2, -0.2, size.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color={GROUND} roughness={1} />
    </mesh>
  )
}

/**
 * The ghost on screen: the current part (mouse hover over the empty plate, a part dragged out of
 * the palette, a rejected quick-place) or a brick being moved (`brick`, over `hit` or nothing).
 */
type Preview = { kind: 'part'; hit: PickHit } | { kind: 'move'; brick: Brick; hit: PickHit | null }

/**
 * Where a part dropped on `hit` goes: lowered from above under the pointer onto the highest studs below
 * its footprint, so it stacks on what is there and bridges gaps (see `pointerAnchor`). `movingId` is the
 * brick being moved, which is not an obstacle to itself.
 */
function dropAnchor(hit: PickHit, part: PartDef, r: Rot, movingId?: string): Anchor {
  const { bricks, baseplate } = useGame.getState().data.workshop
  return pointerAnchor(bricks, hit, part, r, baseplate, movingId)
}

/** Where the preview's part would go, for the editor's current part and rotation. */
function previewAnchor(p: Preview | null, partId: string, rot: Rot): Anchor | null {
  if (!p) return null
  if (p.kind === 'move') return p.hit ? dropAnchor(p.hit, getPart(p.brick.p), p.brick.r, p.brick.id) : null
  return dropAnchor(p.hit, getPart(partId), rot)
}

const samePreview = (a: Preview | null, b: Preview | null): boolean => {
  if (a === b) return true
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'move' && b.kind === 'move' && a.brick !== b.brick) return false
  const { partId, rot } = useEditor.getState()
  return sameAnchor(previewAnchor(a, partId, rot), previewAnchor(b, partId, rot))
}

/** How long a rejected drop keeps its red, shaking ghost on screen. */
const FLASH_MS = 450

function WorkshopWorld() {
  const workshop = useGame((s) => s.data.workshop)
  const { bricks, baseplate, kind } = workshop
  const partId = useEditor((s) => s.partId)
  const fig = useEditor((s) => s.fig)
  const rot = useEditor((s) => s.rot)
  const selectedId = useEditor((s) => s.selectedId)
  const errorSeq = useEditor((s) => s.errorSeq)
  const viewShift = useEditor((s) => s.viewShift)
  const frameSeq = useEditor((s) => s.frameSeq)
  const model = useMemo(() => bounds(bricks), [bricks])
  const el = useThree((s) => s.gl.domElement)
  const get = useThree((s) => s.get)

  // Stored only when it moves the ghost, so pointer moves within one cell re-render nothing.
  const [preview, setPreviewState] = useState<Preview | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setPreview = useCallback((next: Preview | null) => {
    if (flashTimer.current !== null) {
      clearTimeout(flashTimer.current)
      flashTimer.current = null
    }
    if (samePreview(previewRef.current, next)) return
    previewRef.current = next
    setPreviewState(next)
  }, [])
  /** Leaves the current (rejected, red) ghost up for a moment, then hides it. */
  const flashPreview = useCallback(() => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null
      previewRef.current = null
      setPreviewState(null)
    }, FLASH_MS)
  }, [])
  useEffect(() => () => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
  }, [])

  // A resize that slid the bricks to new coordinates leaves the kept hit (and ghost) stale.
  useEffect(
    () => useEditor.subscribe((s, prev) => {
      if (s.viewShift !== prev.viewShift) setPreview(null)
    }),
    [setPreview],
  )

  // The plate and the bricks: what a press or a dragged part can land on.
  const pickRoot = useRef<THREE.Group>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pick = useCallback(
    (x: number, y: number, excludeId?: string): PickHit | null => {
      const root = pickRoot.current
      if (!root) return null
      const rect = el.getBoundingClientRect()
      const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, get().camera)
      for (const h of raycaster.intersectObject(root, true)) {
        if (!h.face) continue
        const brick = brickOfInstance(h.object, h.instanceId) ?? null
        if (brick && brick.id === excludeId) continue
        const local: Vec3 = [h.face.normal.x, h.face.normal.y, h.face.normal.z]
        const { origin } = raycaster.ray
        return {
          point: [h.point.x, h.point.y, h.point.z],
          normal: brick ? rotateNormalY(local, brick.r) : local,
          brick,
          origin: [origin.x, origin.y, origin.z],
        }
      }
      return null
    },
    [el, get, raycaster],
  )

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

  // The arrow keys move a brick relative to the view: tell them which way the camera looks.
  useEffect(() => {
    cameraView.forward = () => {
      const d = get().camera.getWorldDirection(new THREE.Vector3())
      return { x: d.x, z: d.z }
    }
    return () => {
      cameraView.forward = null
    }
  }, [get])

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const cancelGlide = useRef<(() => void) | null>(null)

  useWorkshopGestures(el, {
    pick,
    pressBrick: () => cancelGlide.current?.(),
    setOrbit: (on) => {
      const controls = get().controls as ComponentRef<typeof OrbitControls> | null
      if (controls) controls.enableRotate = on
    },
    // Touching the model (selecting, placing, dragging) or the sky leaves resize mode.
    tapBrick: (brick) => {
      useEditor.getState().setPlateResize(false)
      useEditor.getState().select(brick.id)
    },
    tapPlate: (hit) => {
      const ed = useEditor.getState()
      ed.setPlateResize(false)
      const a = dropAnchor(hit, getPart(ed.partId), ed.rot)
      ed.place(a.x, a.y, a.z)
      if (useEditor.getState().lastError === null) {
        setPreview(null)
        return
      }
      setPreview({ kind: 'part', hit })
      flashPreview()
    },
    tapSky: () => {
      useEditor.getState().setPlateResize(false)
      useEditor.getState().deselect()
    },
    dragStart: (brick) => {
      useEditor.getState().setPlateResize(false)
      useEditor.getState().select(brick.id)
      setDraggingId(brick.id)
      setPreview({ kind: 'move', brick, hit: null })
    },
    dragMove: (hit) => {
      const p = previewRef.current
      if (p?.kind === 'move') setPreview({ ...p, hit })
    },
    dragEnd: (drop) => {
      const p = previewRef.current
      setDraggingId(null)
      const to = drop && p?.kind === 'move' && p.hit ? dropAnchor(p.hit, getPart(p.brick.p), p.brick.r, p.brick.id) : null
      if (p?.kind !== 'move' || !to) {
        setPreview(null)
        return
      }
      const ed = useEditor.getState()
      ed.moveBrick(p.brick.id, to)
      // Rejected: the brick stays where it was and the red ghost shakes for a moment.
      if (useEditor.getState().lastError === null) setPreview(null)
      else flashPreview()
    },
    hover: (hit) => {
      if (draggingId !== null) return
      // Only the empty plate previews a quick-place: a tap on a brick selects it.
      setPreview(hit && !hit.brick ? { kind: 'part', hit } : null)
    },
  })

  // Parts dragged out of the palette: a ghost over the view, placed on release.
  useEffect(() => {
    const overView = (p: ClientPoint) => document.elementFromPoint(p.x, p.y) === el
    return registerPaletteDropTarget({
      hover: (p) => {
        if (p) useEditor.getState().setPlateResize(false) // a part is being dragged out
        const hit = p && overView(p) ? pick(p.x, p.y) : null
        setPreview(hit ? { kind: 'part', hit } : null)
      },
      drop: (p) => {
        const hit = overView(p) ? pick(p.x, p.y) : null
        if (!hit) {
          setPreview(null)
          return
        }
        const ed = useEditor.getState()
        const a = dropAnchor(hit, getPart(ed.partId), ed.rot)
        ed.place(a.x, a.y, a.z)
        if (useEditor.getState().lastError === null) {
          setPreview(null)
          return
        }
        setPreview({ kind: 'part', hit })
        flashPreview()
      },
    })
  }, [el, pick, setPreview, flashPreview])

  const moving = preview?.kind === 'move' ? preview.brick : null
  // `bricks` is not read inside, but a drop settles differently once the model changes (see `dropAnchor`).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anchor = useMemo(() => previewAnchor(preview, partId, rot), [preview, partId, rot, bricks])
  const ghostPart = moving ? moving.p : partId
  const ghostRot = moving ? moving.r : rot
  const ghostFig = moving ? moving.fig : fig

  // canPlace rebuilds an occupancy grid, so it only runs when the target actually changes.
  const ax = anchor?.x
  const ay = anchor?.y
  const az = anchor?.z
  const valid = useMemo(() => {
    if (ax === undefined || ay === undefined || az === undefined) return false
    const probe: Brick = moving
      ? { ...moving, x: ax, y: ay, z: az }
      : { id: '__ghost__', p: ghostPart, x: ax, y: ay, z: az, r: ghostRot, c: 0 }
    return canPlace(bricks, probe, baseplate, moving?.id) === null
  }, [ax, ay, az, moving, ghostPart, ghostRot, bricks, baseplate])

  // The brick being moved stays in the model (nothing is lost if the app closes mid-drag) but is
  // hidden from view and from picking while its ghost follows the finger.
  const shown = useMemo(() => (draggingId === null ? bricks : bricks.filter((b) => b.id !== draggingId)), [bricks, draggingId])
  const selected = useMemo(
    () => (selectedId === null || selectedId === draggingId ? null : (bricks.find((b) => b.id === selectedId) ?? null)),
    [bricks, selectedId, draggingId],
  )

  return (
    <>
      {/* Re-framed for each loaded model; resizing the plate only shifts the view (see CameraRig). */}
      <CameraRig key={frameSeq} size={baseplate} model={model} shift={viewShift} cancelGlideRef={cancelGlide} />
      <Lights size={baseplate} height={modelTop(model)} />
      <Ground size={baseplate} />
      <group ref={pickRoot}>
        <Baseplate size={baseplate} kind={kind} />
        <InstancedBricks bricks={shown} />
      </group>
      <SelectionHighlight brick={selected} shakeKey={errorSeq} />
      {/* Always mounted (toggled via `visible`) so placing a brick never remounts it. */}
      <GhostBrick partId={ghostPart} fig={ghostFig} rot={ghostRot} anchor={anchor} valid={valid} visible={preview !== null} shakeKey={errorSeq} />
    </>
  )
}

/** Read from the frame loop and layout effects (edge buttons, view shifts): a change asks for a frame. */
const WATCH = [useGame, useEditor, useApp]

export default function WorkshopScene() {
  const edges = useRef<EdgeElements>({})
  return (
    <>
      <BtCanvas testId="workshop-canvas" watch={WATCH}>
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, 80, 220]} />
        <WorkshopWorld />
        <PlateEdgeTracker edges={edges} />
      </BtCanvas>
      <PlateEdgeButtons edges={edges} />
    </>
  )
}
