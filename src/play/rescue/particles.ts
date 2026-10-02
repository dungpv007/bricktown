/**
 * A fixed pool of particles (flames, smoke, water, sparkles) in flat typed arrays: emitting reuses
 * the oldest slot, stepping ages and moves them, nothing is allocated after construction. Pure
 * (drawn by `ParticleSprites` as one instanced mesh).
 */
export class ParticlePool {
  readonly capacity: number
  readonly px: Float32Array
  readonly py: Float32Array
  readonly pz: Float32Array
  readonly vx: Float32Array
  readonly vy: Float32Array
  readonly vz: Float32Array
  /** Seconds since emitted; a slot is free when age >= life. */
  readonly age: Float32Array
  readonly life: Float32Array
  /** Size (studs) when emitted, and how much it grows per second. */
  readonly size: Float32Array
  readonly grow: Float32Array
  private cursor = 0

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity))
    const n = this.capacity
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.pz = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.vz = new Float32Array(n)
    this.age = new Float32Array(n).fill(1)
    this.life = new Float32Array(n).fill(0)
    this.size = new Float32Array(n)
    this.grow = new Float32Array(n)
  }

  /** Starts a particle (in the next slot round the ring: the oldest one is reused when all are busy). */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow = 0): void {
    const i = this.cursor
    this.cursor = (i + 1) % this.capacity
    this.px[i] = x
    this.py[i] = y
    this.pz[i] = z
    this.vx[i] = vx
    this.vy[i] = vy
    this.vz[i] = vz
    this.age[i] = 0
    this.life[i] = Math.max(0.01, life)
    this.size[i] = size
    this.grow[i] = grow
  }

  alive(i: number): boolean {
    return this.age[i] < this.life[i]
  }

  /** Live particles now. */
  count(): number {
    let n = 0
    for (let i = 0; i < this.capacity; i++) if (this.age[i] < this.life[i]) n++
    return n
  }

  /** Age 0..1 of slot `i` (1 = gone). */
  progress(i: number): number {
    return Math.min(1, this.age[i] / this.life[i])
  }

  /** Current size of slot `i`. */
  sizeOf(i: number): number {
    return Math.max(0, this.size[i] + this.grow[i] * this.age[i])
  }

  /** Moves every live particle on by `dt` seconds: `gravity` pulls (studs / s², down), `drag` slows (1 / s). */
  step(dt: number, gravity = 0, drag = 0): void {
    const k = drag > 0 ? Math.exp(-drag * dt) : 1
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= this.life[i]) continue
      this.age[i] += dt
      this.vy[i] -= gravity * dt
      if (k !== 1) {
        this.vx[i] *= k
        this.vy[i] *= k
        this.vz[i] *= k
      }
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt
      this.pz[i] += this.vz[i] * dt
    }
  }

  /** Kills every particle. */
  clear(): void {
    this.age.fill(1)
    this.life.fill(0)
  }
}

/** Particles per second to emit this frame, carried over as a fraction so low rates still emit. */
export function emitCount(rate: number, dt: number, carry: { v: number }): number {
  carry.v += Math.max(0, rate) * Math.max(0, dt)
  const n = Math.floor(carry.v)
  carry.v -= n
  return n
}

/** Pool sizes scale with the graphics level: half the particles in battery mode. */
export const particleScale = (battery: boolean): number => (battery ? 0.5 : 1)
