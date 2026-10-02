import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { pop, snap } from '../../audio/sfx'
import { useFrameRequest } from '../../render/frameDriver'

/**
 * Pick-up-and-drop for the games: a `DragItem` follows the finger over the stage at a fixed height
 * and, on release, lands on the nearest `DropTarget` within reach (snap) or glides home with a
 * gentle wobble. Both must sit inside one `<DragArena>`. Kid-sized: every item has a big invisible
 * grab box and targets have a generous reach.
 */

type Vec3 = [number, number, number]

interface Target {
  position: THREE.Vector3
  radius: number
}

interface Arena {
  targets: Map<string, Target>
  /** The item being dragged (null: none), for target highlights. */
  dragging: string | null
  setDragging: (id: string | null) => void
  /** The target the dragged item would land on now. */
  hovered: string | null
  setHovered: (id: string | null) => void
}

const ArenaContext = createContext<Arena | null>(null)

function useArena(): Arena {
  const arena = useContext(ArenaContext)
  if (!arena) throw new Error('DragItem / DropTarget must be inside a <DragArena>')
  return arena
}

/** Holds the drop targets of a group of draggable items. */
export function DragArena({ children }: { children: ReactNode }) {
  const [targets] = useState(() => new Map<string, Target>())
  const [dragging, setDragging] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const arena = useMemo<Arena>(() => ({ targets, dragging, setDragging, hovered, setHovered }), [targets, dragging, hovered])
  return <ArenaContext.Provider value={arena}>{children}</ArenaContext.Provider>
}

/** The nearest target to (x, z) within its reach, or null. */
function nearestTarget(targets: Map<string, Target>, x: number, z: number): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const [id, t] of targets) {
    const d = Math.hypot(t.position.x - x, t.position.z - z)
    if (d <= t.radius && d < bestDist) {
      best = id
      bestDist = d
    }
  }
  return best
}

export interface DropTargetProps {
  id: string
  position: Vec3
  /** How close (studs, on the ground plane) a drop must be to land here. */
  radius?: number
  /** Show a ring while something is dragged (default true). */
  ring?: boolean
  children?: ReactNode
}

/** A place items can be dropped on (a plate, a bowl, the scanner...). Children draw what it looks like. */
export function DropTarget({ id, position, radius = 3, ring = true, children }: DropTargetProps) {
  const arena = useArena()
  const [x, y, z] = position
  useEffect(() => {
    arena.targets.set(id, { position: new THREE.Vector3(x, y, z), radius })
    return () => void arena.targets.delete(id)
  }, [arena.targets, id, x, y, z, radius])
  const active = arena.dragging !== null
  const hot = arena.hovered === id
  return (
    <group position={position}>
      {children}
      {ring && active && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[radius * 0.55, radius * 0.7, 32]} />
          <meshBasicMaterial color={hot ? '#ffd500' : '#ffffff'} transparent opacity={hot ? 0.95 : 0.6} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

export interface DragItemProps {
  id: string
  /** Where the item rests (its home); it glides back here after a missed drop. */
  position: Vec3
  /** Height above its home while carried (studs). */
  lift?: number
  /** Size of the invisible grab box (studs): big, for small fingers. */
  grabSize?: Vec3
  /**
   * Called on release with the target under it (null: none). Return true to accept: the item stays
   * on the target (until `position` changes or it unmounts); false sends it home with a wobble.
   */
  onDrop: (targetId: string | null) => boolean
  /** Called when a drag starts (e.g. to hide a hint). */
  onPickUp?: () => void
  disabled?: boolean
  children: ReactNode
}

const plane = new THREE.Plane()
const hit = new THREE.Vector3()
const ndc = new THREE.Vector2()
const raycaster = new THREE.Raycaster()

/** Something the kid can pick up and drop on a `DropTarget`. */
export function DragItem({ id, position, lift = 1.5, grabSize = [3, 3, 3], onDrop, onPickUp, disabled = false, children }: DragItemProps) {
  const arena = useArena()
  const group = useRef<THREE.Group>(null)
  const el = useThree((s) => s.gl.domElement)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const [x, y, z] = position
  /** Where the item rests now: its home, or the target that accepted it. */
  const [rest, setRest] = useState<Vec3>(position)
  const [restKey, setRestKey] = useState(`${x},${y},${z}`)
  const [gliding, setGliding] = useState(false)
  // A new home from the game: glide there.
  if (restKey !== `${x},${y},${z}`) {
    setRestKey(`${x},${y},${z}`)
    setRest([x, y, z])
    setGliding(true)
  }
  // The group is placed once; after that it moves only by dragging and gliding (no jumps).
  useLayoutEffect(() => {
    group.current?.position.set(x, y, z)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])
  const wobble = useRef(0)
  useFrameRequest(gliding)

  const onDropRef = useRef(onDrop)
  useEffect(() => {
    onDropRef.current = onDrop
  })

  useFrame((_, delta) => {
    const g = group.current
    if (!g || !gliding) return
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 14)
    g.position.x += (rest[0] - g.position.x) * k
    g.position.y += (rest[1] - g.position.y) * k
    g.position.z += (rest[2] - g.position.z) * k
    wobble.current = Math.max(0, wobble.current - delta * 1.6)
    g.rotation.z = Math.sin(wobble.current * 30) * 0.35 * wobble.current
    const close = Math.abs(g.position.x - rest[0]) + Math.abs(g.position.y - rest[1]) + Math.abs(g.position.z - rest[2]) < 0.02
    if (close && wobble.current === 0) {
      g.position.set(...rest)
      g.rotation.z = 0
      setGliding(false)
    }
  })

  /** Removes the active drag's window listeners; the item leaving mid-drag drops nothing. */
  const detachRef = useRef<(() => void) | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (detachRef.current) {
        detachRef.current()
        arena.setDragging(null)
        arena.setHovered(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, [])

  const start = (e: ThreeEvent<PointerEvent>) => {
    if (disabled || arena.dragging !== null) return
    e.stopPropagation()
    const g = group.current
    if (!g) return
    const pointerId = e.pointerId
    const height = rest[1] + lift
    plane.set(new THREE.Vector3(0, 1, 0), -height)
    let offset: THREE.Vector3 | null = null
    const project = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const r = el.getBoundingClientRect()
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray.intersectPlane(plane, hit)
    }
    const first = project(e.nativeEvent.clientX, e.nativeEvent.clientY)
    if (first) offset = new THREE.Vector3(g.position.x - first.x, 0, g.position.z - first.z)
    arena.setDragging(id)
    setGliding(false)
    g.position.y = height
    onPickUp?.()
    pop()
    invalidate()
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !alive.current) return
      const p = project(ev.clientX, ev.clientY)
      if (!p) return
      g.position.x = p.x + (offset?.x ?? 0)
      g.position.z = p.z + (offset?.z ?? 0)
      arena.setHovered(nearestTarget(arena.targets, g.position.x, g.position.z))
      invalidate()
    }
    const detach = () => detachRef.current?.()
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      if (!alive.current) return
      const target = ev.type === 'pointercancel' ? null : nearestTarget(arena.targets, g.position.x, g.position.z)
      arena.setDragging(null)
      arena.setHovered(null)
      const accepted = onDropRef.current(target)
      if (accepted && target) {
        const t = arena.targets.get(target)!.position
        setRest([t.x, t.y, t.z])
        snap()
      } else {
        wobble.current = target ? 1 : 0.5
      }
      setGliding(true)
    }
    detachRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      detachRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return (
    <group ref={group} onPointerDown={start}>
      {children}
      <mesh position={[0, grabSize[1] / 2, 0]}>
        <boxGeometry args={grabSize} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
