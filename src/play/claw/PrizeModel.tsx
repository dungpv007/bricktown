import { forwardRef, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PRIZE_BY_ID } from './prizes'

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

/** The cars face -Z in their file: turned to show the kid their front, three-quarters on. */
const FACING: Readonly<Record<string, number>> = { monster_truck: Math.PI - 0.7, racer: Math.PI + 0.7 }

type GroupProps = Omit<ThreeElements['group'], 'ref'>

export interface PrizeModelProps extends GroupProps {
  kind: string
  /** The loaded prize file (see `loadPrizeModels`). */
  gltf: GLTF
  /** Drawn as a dark silhouette (not won yet). */
  silhouette?: boolean
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
export const PrizeModel = forwardRef<THREE.Group, PrizeModelProps>(function PrizeModel({ kind, gltf, silhouette = false, ...group }, ref) {
  const def = PRIZE_BY_ID[kind]
  const copy = useGlbCopy(gltf, def?.model === 'glb' ? kind : '', silhouette)
  return (
    <group ref={ref} {...group}>
      {def?.model === 'glb' && copy && (
        <group rotation={[0, FACING[kind] ?? 0, 0]}>
          <primitive object={copy} dispose={null} />
        </group>
      )}
      {def?.model === 'ball' && <mesh geometry={BALL.geometry} material={silhouette ? SILHOUETTE : BALL.material} rotation={[0.35, 0, 0.5]} position={[0, 0.5, 0]} dispose={null} />}
      {def?.model === 'star' && (
        <group dispose={null}>
          <mesh geometry={STAR.geometry} material={silhouette ? SILHOUETTE : STAR.material} dispose={null} />
          {!silhouette &&
            [-0.09, 0.09].map((x) => <mesh key={x} geometry={STAR.eye} material={STAR.eyeMaterial} position={[x, STAR.eyeY, STAR.front]} dispose={null} />)}
        </group>
      )}
    </group>
  )
})
