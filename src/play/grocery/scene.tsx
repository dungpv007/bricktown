import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { BrickModel, STAGE, useFrameRequest } from '../kit'
import { BASKET_BRICKS, REGISTER_BRICKS, SCANNER_BRICKS, SHELF_BRICKS } from './items'

/**
 * The 3D pieces of the grocery till: the belt, the scanner (with its flash), the till, the basket,
 * the shelves behind, a pop-in wrapper for goods and the price popup. Everything animates only
 * while it changes (frames are requested just then); nothing allocates per frame.
 */

export type Vec3 = [number, number, number]

const TOP = STAGE.counterTop
const BELT_H = 0.3

/** The till's layout (studs). */
export const LAYOUT = {
  /** Belt top surface height. */
  beltTop: TOP + BELT_H,
  beltFrom: -10.9,
  beltTo: -0.5,
  beltZ: 0.6,
  beltDepth: 3.4,
  /** Where the customer stands (x, z). */
  customer: [0.7, STAGE.customerZ - 0.2] as [number, number],
  scanner: [3.6, TOP, 0.6] as Vec3,
  scannerRadius: 3,
  register: [7, TOP, -2.1] as Vec3,
  basket: [8.3, TOP, 1.5] as Vec3,
} as const

/** Home of item `i` on the belt (up to 5 items). */
export function beltSlot(i: number): Vec3 {
  return [-9.7 + i * 2.15, LAYOUT.beltTop, LAYOUT.beltZ]
}

/** Where the customer holds things (goods before they go on the belt, and after). */
export const HANDS: Vec3 = [LAYOUT.customer[0] - 0.8, TOP + 1.6, -1.6]

/** Where scanned item number `k` lands in the basket (a little pile). */
export function basketSlot(k: number): Vec3 {
  const [x, y, z] = LAYOUT.basket
  return [x + ((k % 2) - 0.5) * 0.7, y + 0.45 + Math.floor(k / 2) * 0.55, z + ((k % 3) - 1) * 0.35]
}

/** Where scanned goods rest on the scanner glass. */
export const ON_SCANNER: Vec3 = [LAYOUT.scanner[0], TOP + 0.8, LAYOUT.scanner[2]]

/** The black rubber belt with silver rails and stripes, on the counter's left side. */
export function Belt() {
  const { beltFrom, beltTo, beltZ, beltDepth } = LAYOUT
  const len = beltTo - beltFrom
  const cx = (beltFrom + beltTo) / 2
  const stripes: number[] = []
  for (let x = beltFrom + 1; x < beltTo - 0.5; x += 1.5) stripes.push(x)
  return (
    <group>
      <mesh position={[cx, TOP + BELT_H / 2, beltZ]}>
        <boxGeometry args={[len, BELT_H, beltDepth]} />
        <meshStandardMaterial color="#2a3138" roughness={0.9} />
      </mesh>
      {stripes.map((x) => (
        <mesh key={x} position={[x, TOP + BELT_H + 0.005, beltZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.18, beltDepth - 0.3]} />
          <meshBasicMaterial color="#3c4650" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[cx, TOP + BELT_H + 0.1, beltZ + s * (beltDepth / 2 + 0.1)]}>
          <boxGeometry args={[len, 0.25, 0.2]} />
          <meshStandardMaterial color="#c4c8d0" metalness={0.4} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The scanner: a glass window with a soft red glow that flashes bright when something is scanned
 * (`flash` changes), plus a laser line sweeping once.
 */
export function Scanner({ flash }: { flash: number }) {
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const laser = useRef<THREE.Mesh>(null)
  const left = useRef(0)
  const [active, setActive] = useState(false)
  const [seen, setSeen] = useState(flash)
  if (seen !== flash) {
    setSeen(flash)
    setActive(true)
  }
  useLayoutEffect(() => {
    if (active) left.current = 1
  }, [active, flash])
  useFrameRequest(active)
  useFrame((_, delta) => {
    if (!active) return
    left.current = Math.max(0, left.current - Math.min(delta, 0.1) * 2.6)
    const k = left.current
    if (glow.current) glow.current.opacity = 0.25 + 0.7 * k
    if (laser.current) {
      laser.current.position.z = -1.2 + 2.4 * (1 - k)
      laser.current.visible = k > 0
    }
    if (k === 0) setActive(false)
  })
  return (
    <group position={LAYOUT.scanner}>
      <BrickModel bricks={SCANNER_BRICKS} />
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.2, 2.2]} />
        <meshBasicMaterial ref={glow} color="#ff3030" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <mesh ref={laser} position={[0, 0.86, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[2.6, 0.14]} />
        <meshBasicMaterial color="#ff0000" />
      </mesh>
    </group>
  )
}

/** The till (screen facing the kid), the shopping basket and the shelves on the back wall. */
export function ShopProps() {
  return (
    <>
      <BrickModel bricks={REGISTER_BRICKS} position={LAYOUT.register} scale={1.3} />
      <BrickModel bricks={BASKET_BRICKS} position={LAYOUT.basket} />
      <BrickModel bricks={SHELF_BRICKS} position={[-9.4, 0, STAGE.wallZ + 2]} scale={0.8} />
      <BrickModel bricks={SHELF_BRICKS} position={[10.8, 0, STAGE.wallZ + 2]} scale={0.8} />
    </>
  )
}

/**
 * Pops its children in (scale 0 → 1 with a little overshoot) on mount, and springs to `scale`
 * whenever it changes (e.g. smaller in the basket, 0 when the customer takes the goods).
 */
export function PopIn({ scale = 1, children }: { scale?: number; children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const cur = useRef(0)
  const vel = useRef(0)
  const [active, setActive] = useState(true)
  const [seen, setSeen] = useState(scale)
  if (seen !== scale) {
    setSeen(scale)
    setActive(true)
  }
  useFrameRequest(active)
  useFrame((_, delta) => {
    const g = group.current
    if (!g || !active) return
    const dt = Math.min(delta, 0.05)
    vel.current += (scale - cur.current) * 260 * dt
    vel.current *= Math.exp(-14 * dt)
    cur.current += vel.current * dt
    if (Math.abs(scale - cur.current) < 0.003 && Math.abs(vel.current) < 0.02) {
      cur.current = scale
      vel.current = 0
      setActive(false)
    }
    const s = Math.max(0.0001, cur.current)
    g.scale.set(s, s, s)
  })
  return (
    <group ref={group} scale={0.0001}>
      {children}
    </group>
  )
}

/** "🪙 3" floating up from the scanner after a scan (a CSS animation; `id` restarts it). */
export function PricePop({ id, price, emoji }: { id: number; price: number; emoji: string }) {
  if (id === 0) return null
  return (
    <Html key={id} position={[LAYOUT.scanner[0], TOP + 2.6, LAYOUT.scanner[2]]} center zIndexRange={[2, 2]} pointerEvents="none">
      <div className="g-price-pop" data-testid="grocery-price-pop" aria-hidden="true">
        <span className="g-price-emoji">{emoji}</span>
        <span className="g-coin g-coin-1">{price}</span>
      </div>
    </Html>
  )
}

/** A small speech bubble over the customer (the coins they pay with, a heart when happy). */
export function Bubble({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Html center zIndexRange={[1, 1]} pointerEvents="none">
      <div className="g-bubble" data-testid={testId}>
        {children}
      </div>
    </Html>
  )
}

export interface TestItem {
  state: string
  x: number
  y: number
}

/**
 * `window.__btGrocery` in development: where each item and the scanner are on screen (client
 * pixels), so e2e specs can drag goods over the scanner.
 */
export function TestHandle({ items }: { items: () => Array<{ state: string; at: Vec3 }> }) {
  const get = useThree((s) => s.get)
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const project = (p: Vec3): { x: number; y: number } => {
      const { camera, gl } = get()
      const v = new THREE.Vector3(...p).project(camera)
      const r = gl.domElement.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    }
    const w = window as unknown as { __btGrocery?: unknown }
    w.__btGrocery = {
      items: (): TestItem[] => itemsRef.current().map((it) => ({ state: it.state, ...project([it.at[0], it.at[1] + 0.6, it.at[2]]) })),
      scanner: () => project([LAYOUT.scanner[0], LAYOUT.scanner[1] + 1.4, LAYOUT.scanner[2]]),
    }
    return () => {
      delete w.__btGrocery
    }
  }, [get])
  return null
}
