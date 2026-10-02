import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPart } from '../core/parts/catalog'
import { footprint } from '../core/rotation'
import type { Brick } from '../core/types'
import { platesToWorld } from '../core/units'
import { LAND_MS, easeOut, landingPose, type LandingPose } from '../input/dragLift'
import { useFrameRequest } from './frameDriver'
import InstancedBricks from './InstancedBricks'

/** Stud-dust puff: a ring of little white studs that spreads and fades as the brick touches down. */
const PUFF_COUNT = 10
const PUFF_RISE = 0.35
const puffGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12)
// One puff on screen at a time (a new landing replaces the last), so the fade can live on the shared material.
const puffMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })
const PUFF_DIRS = Array.from({ length: PUFF_COUNT }, (_, i) => {
  const a = (i / PUFF_COUNT) * Math.PI * 2 + 0.3
  return [Math.cos(a), Math.sin(a)] as const
})
const noRaycast = () => null
const pose: LandingPose = { y: 0, sxz: 1, sy: 1, puff: -1 }

interface Props {
  /** The brick just placed (already in the model, hidden from the main mesh while it lands). */
  brick: Brick
  /** Called once the landing is over (the brick then shows in the main mesh again). */
  onDone: () => void
}

/**
 * A placed brick landing: it drops in from a little above its spot, squashes and bounces once
 * (scaled about its base), and a ring of stud dust puffs out around its foot. LAND_MS long; asks for
 * frames only while it runs (render on demand) and allocates nothing per frame.
 */
export default function LandingBrick({ brick, onDone }: Props) {
  const body = useRef<THREE.Group>(null)
  const puff = useRef<THREE.Group>(null)
  const start = useRef<number | null>(null)
  const done = useRef(false)
  useFrameRequest(true, 'motion')

  const { fx, fz } = footprint(getPart(brick.p), brick.r)
  const base: [number, number, number] = [brick.x + fx / 2, platesToWorld(brick.y), brick.z + fz / 2]
  const reach = Math.max(fx, fz) / 2 + 0.1
  const bricks = useMemo(() => [brick], [brick])

  useFrame(() => {
    const g = body.current
    const ring = puff.current
    if (!g || !ring || done.current) return
    const now = performance.now()
    if (start.current === null) start.current = now
    const t = (now - start.current) / LAND_MS
    landingPose(t, pose)
    g.position.y = base[1] + pose.y
    g.scale.set(pose.sxz, pose.sy, pose.sxz)
    ring.visible = pose.puff >= 0
    if (pose.puff >= 0) {
      const e = easeOut(pose.puff)
      const r = reach + e * 0.9
      for (let i = 0; i < PUFF_COUNT; i++) {
        const m = ring.children[i]
        m.position.set(PUFF_DIRS[i][0] * r, e * PUFF_RISE, PUFF_DIRS[i][1] * r)
        m.scale.setScalar(1 - 0.5 * pose.puff)
      }
      puffMaterial.opacity = 0.95 * (1 - pose.puff)
    }
    if (t >= 1) {
      done.current = true
      onDone()
    }
  })

  return (
    <>
      <group ref={body} position={base}>
        <group position={[-base[0], -base[1], -base[2]]}>
          <InstancedBricks bricks={bricks} />
        </group>
      </group>
      <group ref={puff} position={base} visible={false}>
        {PUFF_DIRS.map((_, i) => (
          <mesh key={i} geometry={puffGeometry} material={puffMaterial} raycast={noRaycast} dispose={null} />
        ))}
      </group>
    </>
  )
}
