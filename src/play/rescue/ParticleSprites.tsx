import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ParticlePool } from './particles'

/**
 * Draws a `ParticlePool` as camera-facing soft sprites: ONE instanced mesh for the whole pool, its
 * matrices and colours rewritten each frame from the pool's arrays (shared temporaries, no
 * allocation). The colour goes from `from` to `to` over each particle's life; additive pools fade by
 * darkening, normal ones by shrinking.
 */

let softTexture: THREE.CanvasTexture | null = null

/** A round, soft-edged white blob (made once, shared by every pool). */
function soft(): THREE.Texture {
  if (softTexture) return softTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.45, 'rgba(255,255,255,0.85)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  softTexture = new THREE.CanvasTexture(canvas)
  softTexture.colorSpace = THREE.SRGBColorSpace
  return softTexture
}

const tmpMatrix = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpColor = new THREE.Color()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

export interface ParticleSpritesProps {
  pool: ParticlePool
  from: string
  to: string
  additive?: boolean
  opacity?: number
}

export default function ParticleSprites({ pool, from, to, additive = false, opacity = 1 }: ParticleSpritesProps) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const colors = useMemo(() => [new THREE.Color(from), new THREE.Color(to)] as const, [from, to])
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: soft(),
        transparent: true,
        depthWrite: false,
        opacity,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false,
      }),
    [additive, opacity],
  )
  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )
  useEffect(() => () => material.dispose(), [material])

  // Every slot starts hidden, with a colour buffer to write into.
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < pool.capacity; i++) {
      m.setMatrixAt(i, ZERO)
      m.setColorAt(i, colors[0])
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [pool, colors])

  useFrame(({ camera }) => {
    const m = mesh.current
    if (!m) return
    const q = camera.quaternion
    for (let i = 0; i < pool.capacity; i++) {
      if (!pool.alive(i)) {
        m.setMatrixAt(i, ZERO)
        continue
      }
      const k = pool.progress(i)
      let s = pool.sizeOf(i)
      tmpColor.copy(colors[0]).lerp(colors[1], k)
      if (additive) tmpColor.multiplyScalar(1 - k * k)
      else s *= 1 - k * k * 0.6
      tmpPos.set(pool.px[i], pool.py[i], pool.pz[i])
      tmpScale.set(s, s, s)
      tmpMatrix.compose(tmpPos, q, tmpScale)
      m.setMatrixAt(i, tmpMatrix)
      m.setColorAt(i, tmpColor)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geometry, material, pool.capacity]} frustumCulled={false} renderOrder={5} />
}
