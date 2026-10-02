import * as THREE from 'three'
import { CELL } from '../../core/city'

/**
 * Distant LEGO-style scenery around the City: a ring of stepped, brick-like mountains (green foothills,
 * grey rock, snow on the tallest) with a band of stepped pine forest in front. Built once, around the
 * origin at unit radius, as one merged geometry with vertex colours (one draw call, about 12k
 * triangles), and scaled per city (see `horizonLayout`). Shared app-wide: never dispose it.
 */

/** Where the scenery and the haze go for a city of `size` cells (world studs). */
export interface HorizonLayout {
  /** City centre (x and z). */
  center: number
  /** Inner radius of the scenery ring: the scale of the unit-radius geometry. */
  radius: number
  fogNear: number
  fogFar: number
  /** Half the side of the far ground plane around the city, so its edge is always deep in the fog. */
  groundHalf: number
}

/** Furthest the City camera can be from its target horizontally (zoom-out limit at full tilt). */
const CAMERA_REACH = 340 * Math.sin(1.2)

export function horizonLayout(size: number): HorizonLayout {
  const span = size * CELL
  // Past the city's corners with room to spare; the camera can go a little past the forest at full
  // tilt and zoom-out, where the scenery is behind it.
  const radius = span * 0.71 + 160
  const fogNear = Math.max(450, radius)
  const fogFar = radius * 3.2
  return { center: span / 2, radius, fogNear, fogFar, groundHalf: span / 2 + CAMERA_REACH + fogFar + 200 }
}

/** Small deterministic random numbers (the scenery looks the same every time). */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLORS = {
  grass: ['#5c9a4c', '#4f8c44', '#67a653'],
  rock: ['#9ba3ab', '#8a929b', '#a8adb2', '#7b828a'],
  snow: ['#f3f6f9', '#e6edf3'],
  pine: ['#2f6b35', '#3a7a3c', '#28603a'],
}

class Builder {
  positions: number[] = []
  normals: number[] = []
  colors: number[] = []
  indices: number[] = []
  private c = new THREE.Color()

  /**
   * A box without its bottom face, centred at polar (angle, r) on the ring, turned to face the
   * centre: `w` along the ring, `d` across it, from y0 to y1.
   */
  box(angle: number, r: number, w: number, d: number, y0: number, y1: number, hex: string, shade = 1) {
    // Radial (u) and tangential (v) unit vectors.
    const ux = Math.sin(angle)
    const uz = Math.cos(angle)
    const vx = uz
    const vz = -ux
    const cx = ux * r
    const cz = uz * r
    const hw = w / 2
    const hd = d / 2
    const corner = (a: number, b: number): [number, number] => [cx + vx * a + ux * b, cz + vz * a + uz * b]
    const p00 = corner(-hw, -hd)
    const p10 = corner(hw, -hd)
    const p11 = corner(hw, hd)
    const p01 = corner(-hw, hd)
    this.c.set(hex).multiplyScalar(shade)
    const face = (q: Array<[number, number, number]>, n: [number, number, number], flip = true) => {
      const base = this.positions.length / 3
      for (const p of q) {
        this.positions.push(p[0], p[1], p[2])
        this.normals.push(n[0], n[1], n[2])
        this.colors.push(this.c.r, this.c.g, this.c.b)
      }
      if (flip) this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
      else this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    // Top.
    face([[p00[0], y1, p00[1]], [p01[0], y1, p01[1]], [p11[0], y1, p11[1]], [p10[0], y1, p10[1]]], [0, 1, 0], false)
    // Inner side (towards the centre: -u), outer (+u), and the two ends (-v, +v), wound to face outwards.
    face([[p00[0], y0, p00[1]], [p10[0], y0, p10[1]], [p10[0], y1, p10[1]], [p00[0], y1, p00[1]]], [-ux, 0, -uz])
    face([[p11[0], y0, p11[1]], [p01[0], y0, p01[1]], [p01[0], y1, p01[1]], [p11[0], y1, p11[1]]], [ux, 0, uz])
    face([[p01[0], y0, p01[1]], [p00[0], y0, p00[1]], [p00[0], y1, p00[1]], [p01[0], y1, p01[1]]], [-vx, 0, -vz])
    face([[p10[0], y0, p10[1]], [p11[0], y0, p11[1]], [p11[0], y1, p11[1]], [p10[0], y1, p10[1]]], [vx, 0, vz])
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3))
    g.setIndex(this.indices)
    g.computeBoundingSphere()
    return g
  }
}

/** Height of one stepped layer (unit radius): a "brick" of the mountain. */
const STEP = 0.026

/** One stepped mountain: layers shrinking upwards, each nudged a little off centre. */
function mountain(b: Builder, rand: () => number, angle: number, r: number, w: number, d: number, h: number) {
  const layers = Math.max(2, Math.round(h / STEP))
  const snowy = h > 0.17
  let a = angle
  let rr = r
  for (let k = 0; k < layers; k++) {
    const f = k / layers
    // Wide foothills, a steeper middle, a narrow peak.
    const shrink = 1 - Math.pow(f, 0.8) * 0.88
    const lw = w * shrink * (0.9 + rand() * 0.2)
    const ld = d * shrink * (0.9 + rand() * 0.2)
    a += ((rand() - 0.5) * w * 0.08) / r
    rr += (rand() - 0.5) * d * 0.06
    const y0 = k * STEP
    const y1 = y0 + STEP
    const fromTop = layers - k
    const palette = snowy && fromTop <= Math.max(1, Math.round(layers * 0.22)) ? COLORS.snow : f < 0.3 ? COLORS.grass : COLORS.rock
    const hex = palette[Math.floor(rand() * palette.length)]
    b.box(a, rr, lw, ld, y0, y1, hex, 0.94 + rand() * 0.1)
  }
}

/** A stepped pine: three shrinking blocks on a short trunk-less base. */
function pine(b: Builder, rand: () => number, angle: number, r: number, s: number) {
  const hex = COLORS.pine[Math.floor(rand() * COLORS.pine.length)]
  const shade = 0.9 + rand() * 0.15
  const tier = s * 0.75
  b.box(angle, r, s, s, 0, tier, hex, shade)
  b.box(angle, r, s * 0.66, s * 0.66, tier, tier * 2, hex, shade)
  b.box(angle, r, s * 0.33, s * 0.33, tier * 2, tier * 3.1, hex, shade)
}

function build(): THREE.BufferGeometry {
  const b = new Builder()
  const rand = rng(1234)
  const TAU = Math.PI * 2
  // Back row: big mountains, overlapping so no gap shows the ground beyond.
  const back = 26
  for (let i = 0; i < back; i++) {
    const angle = ((i + rand() * 0.6) / back) * TAU
    mountain(b, rand, angle, 1.3 + rand() * 0.14, 0.42 + rand() * 0.2, 0.24 + rand() * 0.08, 0.15 + rand() * 0.13)
  }
  // Front row: smaller green-and-grey hills between them.
  const front = 38
  for (let i = 0; i < front; i++) {
    const angle = ((i + 0.5 + rand() * 0.5) / front) * TAU
    mountain(b, rand, angle, 1.12 + rand() * 0.08, 0.24 + rand() * 0.1, 0.14 + rand() * 0.05, 0.06 + rand() * 0.07)
  }
  // Forest band in front of the hills.
  const trees = 240
  for (let i = 0; i < trees; i++) {
    const angle = ((i + rand()) / trees) * TAU
    pine(b, rand, angle, 0.99 + rand() * 0.11, 0.016 + rand() * 0.012)
  }
  return b.geometry()
}

let shared: THREE.BufferGeometry | null = null

/** The scenery geometry (built on first use, shared, never disposed). */
export function horizonGeometry(): THREE.BufferGeometry {
  return (shared ??= build())
}

let material: THREE.MeshLambertMaterial | null = null

/** Matte, vertex-coloured, in the fog (shared, never disposed). */
export function horizonMaterial(): THREE.MeshLambertMaterial {
  return (material ??= new THREE.MeshLambertMaterial({ vertexColors: true }))
}
