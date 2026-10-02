import { createContext, useContext, useEffect, useRef } from 'react'

/**
 * Scenes render on demand (R3F `frameloop="demand"`): a frame is drawn only when something asks for
 * one. The frame driver is how continuous animation asks: while any request is active it invalidates
 * the canvas from the animation-frame clock, at most at the requested rate (the graphics frame cap for
 * motion, a lower rate for ambient pulses). It uses `requestAnimationFrame`, so the automated-browser
 * throttle (src/testLowPower.ts) still sets the pace in tests.
 */

/** 'motion': driving, a living city, water (the frame cap); 'ambient': a slow glow pulse. */
export type FrameKind = 'motion' | 'ambient'

/** Ambient pulses (selection glow, target ghosts) need no more than this. */
export const AMBIENT_FPS = 20
/** A frame is due this much before its exact time, so a 60 Hz display keeps an even 30 / 60. */
const EARLY_MS = 3

export class FrameDriver {
  private readonly requests = new Map<object, FrameKind>()
  private raf = 0
  private last = -Infinity
  private running = true
  private cap = 60

  constructor(private readonly invalidate: () => void) {}

  /** Starts (`kind`) or stops (null) the request held under `key`. */
  request(key: object, kind: FrameKind | null): void {
    if (kind) this.requests.set(key, kind)
    else this.requests.delete(key)
    this.update()
  }

  /** The frame cap for motion (fps). */
  setCap(fps: number): void {
    this.cap = fps
  }

  /** False while the scene is paused (hidden page, covered by a dialog). */
  setRunning(on: boolean): void {
    this.running = on
    this.update()
  }

  /** Frames per second wanted now (0: none). */
  rate(): number {
    let rate = 0
    for (const kind of this.requests.values()) rate = Math.max(rate, kind === 'motion' ? this.cap : Math.min(this.cap, AMBIENT_FPS))
    return rate
  }

  dispose(): void {
    this.requests.clear()
    this.update()
  }

  private update(): void {
    const want = this.running && this.rate() > 0
    if (want && this.raf === 0) this.raf = requestAnimationFrame(this.tick)
    else if (!want && this.raf !== 0) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private readonly tick = (t: number): void => {
    this.raf = 0
    const rate = this.rate()
    if (!this.running || rate <= 0) return
    if (t - this.last >= 1000 / rate - EARLY_MS) {
      this.last = t
      this.invalidate()
    }
    this.raf = requestAnimationFrame(this.tick)
  }
}

export const FrameDriverContext = createContext<FrameDriver | null>(null)

/** The canvas's frame driver (null outside a BtCanvas). */
export const useFrameDriver = (): FrameDriver | null => useContext(FrameDriverContext)

/** Keeps frames coming while `active` (see FrameDriver): for animation that runs on its own. */
export function useFrameRequest(active: boolean, kind: FrameKind = 'motion'): void {
  const driver = useFrameDriver()
  const key = useRef({})
  useEffect(() => {
    if (!driver || !active) return
    const k = key.current
    driver.request(k, kind)
    return () => driver.request(k, null)
  }, [driver, active, kind])
}
