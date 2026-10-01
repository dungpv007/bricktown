import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Stats } from '@react-three/drei'
import * as THREE from 'three'
import { canPlace } from '../../core/model'
import { getPart } from '../../core/parts/catalog'
import { rotateNormalY, targetAnchor, type PickHit, type Vec3 } from '../../core/pick'
import type { Baseplate as BaseplateSize, Brick } from '../../core/types'
import { useTap } from '../../input/useTap'
import GhostBrick from '../../render/GhostBrick'
import InstancedBricks from '../../render/InstancedBricks'
import { useEditor } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import Baseplate from './Baseplate'

export const SKY = '#87ceeb'
const GROUND = '#a9dc9b'
const SHADOW_MAP_SIZE = 1024

type Anchor = { x: number; y: number; z: number }

const sameAnchor = (a: Anchor | null, b: Anchor | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.z === b.z)

export function Lights({ size }: { size: BaseplateSize }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const cx = size.w / 2
  const cz = size.d / 2
  const extent = Math.max(size.w, size.d) * 0.75 + 4

  useLayoutEffect(() => {
    const cam = light.current?.shadow.camera
    if (!cam) return
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = 120
    cam.updateProjectionMatrix()
  }, [extent])

  return (
    <>
      <hemisphereLight args={['#ffffff', '#7a9a6a', 1.6]} />
      <primitive object={target} position={[cx, 0, cz]} />
      <directionalLight
        ref={light}
        target={target}
        position={[cx + 14, 28, cz + 10]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
    </>
  )
}

/** Camera + orbit controls framing the baseplate; remounted (reset) when the plate size changes. */
export function CameraRig({ size }: { size: BaseplateSize }) {
  const span = Math.max(size.w, size.d)
  const dist = span * 1.5 + 8
  const target: Vec3 = [size.w / 2, 0, size.d / 2]
  // Looking from the front-right, a bit above.
  const position: Vec3 = [target[0] + dist * 0.45, dist * 0.7, target[2] + dist * 0.75]
  return (
    <>
      <PerspectiveCamera makeDefault position={position} fov={45} near={0.1} far={500} />
      <OrbitControls
        makeDefault
        target={target}
        enableDamping
        dampingFactor={0.12}
        minDistance={4}
        maxDistance={span * 3 + 10}
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

function WorkshopWorld() {
  const workshop = useGame((s) => s.data.workshop)
  const { bricks, baseplate, kind } = workshop
  const tool = useEditor((s) => s.tool)
  const partId = useEditor((s) => s.partId)
  const rot = useEditor((s) => s.rot)
  const carried = useEditor((s) => s.carried)
  const errorSeq = useEditor((s) => s.errorSeq)
  const consumeTap = useTap()

  // The last pointer hit is kept (not just the anchor) so the anchor re-centres right away when
  // only the part or rotation changes. It is stored only when it moves the anchor.
  const [hit, setHitState] = useState<PickHit | null>(null)
  const hitRef = useRef<PickHit | null>(null)
  const setHit = useCallback((next: PickHit | null) => {
    const prev = hitRef.current
    if (prev === next) return
    if (prev && next) {
      const { partId: p, rot: r } = useEditor.getState()
      const part = getPart(p)
      if (sameAnchor(targetAnchor(prev, part, r), targetAnchor(next, part, r))) return
    }
    hitRef.current = next
    setHitState(next)
  }, [])
  const anchor = useMemo(() => (hit ? targetAnchor(hit, getPart(partId), rot) : null), [hit, partId, rot])

  const placing = tool === 'place' || carried !== null

  const el = useThree((s) => s.gl.domElement)
  useEffect(() => {
    // Mouse left the 3D view (e.g. onto the toolbars): drop the hover preview.
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') setHit(null)
    }
    el.addEventListener('pointerleave', onLeave)
    return () => el.removeEventListener('pointerleave', onLeave)
  }, [el, setHit])

  // canPlace rebuilds an occupancy grid, so it only runs when the target actually changes.
  const ax = anchor?.x
  const ay = anchor?.y
  const az = anchor?.z
  const valid = useMemo(() => {
    if (ax === undefined || ay === undefined || az === undefined) return false
    const probe: Brick = { id: '__ghost__', p: partId, x: ax, y: ay, z: az, r: rot, c: 0 }
    return canPlace(bricks, probe, baseplate) === null
  }, [ax, ay, az, partId, rot, bricks, baseplate])

  const handlePointer = useCallback(
    (e: ThreeEvent<PointerEvent>, brick: Brick | null) => {
      e.stopPropagation() // only the nearest hit counts
      const type = e.nativeEvent.type
      const ed = useEditor.getState()
      const isPlacing = ed.tool === 'place' || ed.carried !== null
      const pickHit = (): PickHit | null => {
        if (!e.face) return null
        const local: Vec3 = [e.face.normal.x, e.face.normal.y, e.face.normal.z]
        const normal = brick ? rotateNormalY(local, brick.r) : local
        return { point: [e.point.x, e.point.y, e.point.z], normal, brick }
      }

      if (type === 'pointermove') {
        // Hover only: a held button or finger means the camera is being dragged.
        if (isPlacing && e.pointerType === 'mouse' && e.buttons === 0) setHit(pickHit())
        return
      }
      if (type === 'pointerdown') {
        if (isPlacing) setHit(pickHit())
        return
      }
      if (type !== 'pointerup' || !consumeTap(e.pointerId)) return

      if (isPlacing) {
        const h = pickHit()
        if (!h) return
        setHit(h)
        const a = targetAnchor(h, getPart(ed.partId), ed.rot)
        ed.place(a.x, a.y, a.z)
        // The ghost would now sit inside the new brick; hide it until the pointer moves again.
        if (useEditor.getState().lastError === null) setHit(null)
      } else if (brick) {
        ed.tapBrick(brick.id)
      }
    },
    [consumeTap, setHit],
  )

  const onBaseplatePointer = useCallback((e: ThreeEvent<PointerEvent>) => handlePointer(e, null), [handlePointer])

  return (
    <>
      <CameraRig key={`${baseplate.w}x${baseplate.d}`} size={baseplate} />
      <Lights size={baseplate} />
      <Ground size={baseplate} />
      <Baseplate size={baseplate} kind={kind} onPointer={onBaseplatePointer} />
      <InstancedBricks bricks={bricks} onBrickPointer={handlePointer} />
      {/* Always mounted (toggled via `visible`) so placing a brick never remounts it. */}
      <GhostBrick partId={partId} rot={rot} anchor={anchor} valid={valid} visible={placing} shakeKey={errorSeq} />
    </>
  )
}

export default function WorkshopScene() {
  return (
    <Canvas shadows dpr={[1, 1.75]} data-testid="workshop-canvas">
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 80, 220]} />
      <WorkshopWorld />
      {import.meta.env.DEV && <Stats className="bt-stats" />}
    </Canvas>
  )
}
