import { forwardRef, useMemo, useRef } from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GIFT_LOOKS, PRIZE_BY_ID } from './prizes'

/**
 * The prizes as smooth (non-LEGO) 3D models. Ten come from `public/models/claw/prizes.glb` (Kenney, CC0),
 * fetched only when the claw game opens (never precached, never imported by another chunk); the beach
 * ball and the star are drawn here. Every prize fits a 1 x 1 x 1 box standing on its origin: scale the
 * group to size it.
 *
 * Nothing here is disposed when a prize unmounts: the loaded file and the procedural meshes are shared
 * by every copy (pit, chute, reveal, cabinet) and kept for the session (about 0.3 MB).
 */

export const PRIZES_URL = `${import.meta.env.BASE_URL}models/claw/prizes.glb`

/** The prize file could not be fetched or read (offline on the first visit, most likely). */
export class PrizeLoadError extends Error {
  constructor(cause: unknown) {
    super('claw machine prizes failed to load', { cause })
    this.name = 'PrizeLoadError'
  }
}

let loading: Promise<GLTF> | null = null

/** The prize models, loaded once (a failed load is forgotten, so the next visit tries again). */
export function loadPrizeModels(): Promise<GLTF> {
  if (!loading) {
    const p = new GLTFLoader().loadAsync(PRIZES_URL).catch((e: unknown) => {
      if (loading === p) loading = null
      throw new PrizeLoadError(e)
    })
    loading = p
  }
  return loading
}

/** Drops a failed load so the next `loadPrizeModels` fetches again (the error screen's 🔄). */
export function forgetPrizeModels(): void {
  loading = null
}

/** One shared dark material for prizes not won yet (the cabinet's silhouettes). */
const SILHOUETTE = new THREE.MeshBasicMaterial({ color: '#2a2140' })

/** A beach ball: six coloured panels from pole to pole and white caps (vertex colours). */
const BALL = (() => {
  const g = new THREE.SphereGeometry(0.5, 36, 24)
  const panels = ['#e3000b', '#ffffff', '#ffd500', '#ffffff', '#0055bf', '#ffffff'].map((c) => new THREE.Color(c))
  const white = new THREE.Color('#ffffff')
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (Math.abs(y) > 0.44) c.copy(white)
    else {
      const a = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2)
      c.copy(panels[Math.min(5, Math.floor(a * 6))])
    }
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return { geometry: g, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }) }
})()

/** A plump five-pointed star standing up (an extruded, bevelled shape) with two little eyes. */
const STAR = (() => {
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.24
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 4, curveSegments: 4 })
  g.computeBoundingBox()
  const b = g.boundingBox!
  // Feet on the ground, centred on x/z.
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  g.computeVertexNormals()
  const eye = new THREE.SphereGeometry(0.055, 12, 8)
  return {
    geometry: g,
    material: new THREE.MeshStandardMaterial({ color: '#ffcc1a', roughness: 0.3, metalness: 0.15, emissive: '#5a3c00', emissiveIntensity: 0.25 }),
    eye,
    eyeMaterial: new THREE.MeshStandardMaterial({ color: '#1b2a34', roughness: 0.2 }),
    front: b.max.z - (b.min.z + b.max.z) / 2 + 0.005,
    eyeY: 0.5 - b.min.y + 0.03,
  }
})()

/** A part of a procedural toy: a shared geometry and material, placed. */
interface Part {
  g: THREE.BufferGeometry
  m: THREE.Material
  p: [number, number, number]
  r?: [number, number, number]
  s?: [number, number, number]
}

const toyMat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 })
const SPHERE = new THREE.SphereGeometry(0.5, 24, 16)
const ROD = new THREE.CylinderGeometry(0.5, 0.5, 1, 14)
const CAPSULE = new THREE.CapsuleGeometry(0.5, 1, 8, 20)
const RED = toyMat('#e3000b')
const YELLOW = toyMat('#ffcc1a')
const WHITE = toyMat('#f4f4f4')
const BLUE = toyMat('#2f7fe0')
const GLASS = new THREE.MeshStandardMaterial({ color: '#9fdcff', roughness: 0.05, metalness: 0.3 })
const DARK = toyMat('#2b2f38')

/** A plump toy airplane (nose toward +Z, the kid): red body, yellow wings, white tail, a propeller. */
const PLANE: Part[] = [
  { g: CAPSULE, m: RED, p: [0, 0.42, 0], r: [Math.PI / 2, 0, 0], s: [0.34, 0.42, 0.34] },
  { g: SPHERE, m: GLASS, p: [0, 0.56, 0.16], s: [0.24, 0.2, 0.3] },
  { g: SPHERE, m: YELLOW, p: [0, 0.4, 0.04], s: [1, 0.07, 0.28] },
  { g: SPHERE, m: YELLOW, p: [0, 0.46, -0.38], s: [0.46, 0.05, 0.16] },
  { g: SPHERE, m: WHITE, p: [0, 0.6, -0.38], s: [0.05, 0.3, 0.2] },
  { g: SPHERE, m: WHITE, p: [0, 0.42, 0.47], s: [0.12, 0.12, 0.08] },
  { g: SPHERE, m: DARK, p: [0, 0.42, 0.52], s: [0.42, 0.06, 0.03] },
  { g: ROD, m: DARK, p: [-0.12, 0.13, 0.08], s: [0.025, 0.2, 0.025] },
  { g: ROD, m: DARK, p: [0.12, 0.13, 0.08], s: [0.025, 0.2, 0.025] },
  { g: SPHERE, m: DARK, p: [-0.12, 0.06, 0.08], s: [0.12, 0.12, 0.06] },
  { g: SPHERE, m: DARK, p: [0.12, 0.06, 0.08], s: [0.12, 0.12, 0.06] },
]

/** A round toy helicopter (nose toward +Z): blue body, a big glass bubble, skids, a tail rotor. */
const HELI: Part[] = [
  { g: SPHERE, m: BLUE, p: [0, 0.42, -0.02], s: [0.55, 0.5, 0.66] },
  { g: SPHERE, m: GLASS, p: [0, 0.47, 0.17], s: [0.44, 0.38, 0.34] },
  { g: ROD, m: BLUE, p: [0, 0.48, -0.5], r: [Math.PI / 2, 0, 0], s: [0.07, 0.5, 0.07] },
  { g: SPHERE, m: YELLOW, p: [0, 0.56, -0.74], s: [0.04, 0.24, 0.12] },
  { g: ROD, m: DARK, p: [-0.2, 0.03, 0.02], r: [Math.PI / 2, 0, 0], s: [0.035, 0.7, 0.035] },
  { g: ROD, m: DARK, p: [0.2, 0.03, 0.02], r: [Math.PI / 2, 0, 0], s: [0.035, 0.7, 0.035] },
  { g: ROD, m: DARK, p: [-0.16, 0.12, 0.02], r: [0, 0, 0.4], s: [0.025, 0.2, 0.025] },
  { g: ROD, m: DARK, p: [0.16, 0.12, 0.02], r: [0, 0, -0.4], s: [0.025, 0.2, 0.025] },
  { g: ROD, m: DARK, p: [0, 0.72, -0.02], s: [0.04, 0.12, 0.04] },
]
/** The main rotor (spun on the reveal): two long blades. */
const ROTOR: Part[] = [
  { g: SPHERE, m: DARK, p: [0, 0, 0], s: [1.0, 0.025, 0.08] },
  { g: SPHERE, m: DARK, p: [0, 0, 0], r: [0, Math.PI / 2, 0], s: [1.0, 0.025, 0.08] },
  { g: SPHERE, m: RED, p: [0, 0.02, 0], s: [0.1, 0.06, 0.1] },
]

function Parts({ parts, silhouette }: { parts: readonly Part[]; silhouette: boolean }) {
  return (
    <>
      {parts.map((q, i) => (
        <mesh key={i} geometry={q.g} material={silhouette ? SILHOUETTE : q.m} position={q.p} rotation={q.r} scale={q.s} dispose={null} />
      ))}
    </>
  )
}

/** The helicopter; its rotor turns while `spin` (only when frames are drawn anyway: the reveal). */
function Helicopter({ silhouette, spin }: { silhouette: boolean; spin: boolean }) {
  const rotor = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (spin && rotor.current) rotor.current.rotation.y += Math.min(delta, 0.05) * 9
  })
  return (
    <group dispose={null}>
      <Parts parts={HELI} silhouette={silhouette} />
      <group ref={rotor} position={[0, 0.79, -0.02]}>
        <Parts parts={ROTOR} silhouette={silhouette} />
      </group>
    </group>
  )
}

/** The cars face -Z in their file: turned to show the kid their front, three-quarters on. */
const FACING: Readonly<Record<string, number>> = {
  monster_truck: Math.PI - 0.7,
  racer: Math.PI + 0.7,
  // The car kit's vehicles too.
  loader: 0.6,
  garbage_truck: -0.6,
  tractor: 0.6,
  fire_truck: -0.6,
  police_car: 0.6,
  ambulance: -0.6,
}

type GroupProps = Omit<ThreeElements['group'], 'ref'>

export interface PrizeModelProps extends GroupProps {
  /** A prize kind or a gift look (`GIFT_LOOKS`). */
  kind: string
  /** The loaded prize file (see `loadPrizeModels`). */
  gltf: GLTF
  /** Drawn as a dark silhouette (not won yet). */
  silhouette?: boolean
  /** Moving parts move (the helicopter's rotor), while frames are drawn anyway. */
  spin?: boolean
}

/** A copy of one GLB prize node: shares geometry and materials with the loaded file. */
function useGlbCopy(gltf: GLTF, kind: string, silhouette: boolean): THREE.Object3D | null {
  return useMemo(() => {
    const node = gltf.scene.getObjectByName(kind)
    if (!node) return null
    // The node's own transform is its normalisation (centred, 1 stud box): kept as it is.
    const copy = node.clone(true)
    copy.traverse((o) => {
      if (silhouette && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = SILHOUETTE
    })
    return copy
  }, [gltf, kind, silhouette])
}

/** One prize of `kind`, 1 stud tall-ish, standing on the group origin and facing +Z (the kid). */
export const PrizeModel = forwardRef<THREE.Group, PrizeModelProps>(function PrizeModel({ kind, gltf, silhouette = false, spin = false, ...group }, ref) {
  // A prize kind, or a gift box's look (drawn from the same file).
  const model = PRIZE_BY_ID[kind]?.model ?? ((GIFT_LOOKS as readonly string[]).includes(kind) ? 'glb' : undefined)
  const copy = useGlbCopy(gltf, model === 'glb' ? kind : '', silhouette)
  return (
    <group ref={ref} {...group}>
      {model === 'glb' && copy && (
        <group rotation={[0, FACING[kind] ?? 0, 0]}>
          <primitive object={copy} dispose={null} />
        </group>
      )}
      {model === 'ball' && <mesh geometry={BALL.geometry} material={silhouette ? SILHOUETTE : BALL.material} rotation={[0.35, 0, 0.5]} position={[0, 0.5, 0]} dispose={null} />}
      {model === 'plane' && (
        <group rotation={[0, 0.5, 0]} dispose={null}>
          <Parts parts={PLANE} silhouette={silhouette} />
        </group>
      )}
      {model === 'helicopter' && (
        <group rotation={[0, 0.5, 0]}>
          <Helicopter silhouette={silhouette} spin={spin} />
        </group>
      )}
      {model === 'star' && (
        <group dispose={null}>
          <mesh geometry={STAR.geometry} material={silhouette ? SILHOUETTE : STAR.material} dispose={null} />
          {!silhouette &&
            [-0.09, 0.09].map((x) => <mesh key={x} geometry={STAR.eye} material={STAR.eyeMaterial} position={[x, STAR.eyeY, STAR.front]} dispose={null} />)}
        </group>
      )}
    </group>
  )
})
