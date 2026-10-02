import * as THREE from 'three'

/** How the City camera looks at the town: from the south (+Z), tilted `tilt` radians from straight down. */
export interface FramingLens {
  fov: number // vertical, degrees
  aspect: number // width / height of the view
  tilt: number
  minDistance: number
  maxDistance: number
  /**
   * Where on screen the points must land, in normalised device coordinates (-1..1, y up): e.g. a
   * bottom limit of -0.6 keeps them clear of a drawer over the lowest fifth of the screen.
   */
  window: { left: number; right: number; bottom: number; top: number }
}

export interface CityFrame {
  /** Point on the ground the camera looks at. */
  target: [number, number, number]
  distance: number
  /** False when even the furthest distance cannot show every point (then the view is centred on them). */
  fits: boolean
}

const camera = new THREE.PerspectiveCamera()
const v = new THREE.Vector3()

function place(lens: FramingLens, x: number, z: number, distance: number) {
  camera.fov = lens.fov
  camera.aspect = lens.aspect
  camera.near = 1
  camera.far = 5000
  camera.position.set(x, distance * Math.cos(lens.tilt), z + distance * Math.sin(lens.tilt))
  camera.lookAt(x, 0, z)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

/** Screen extent (NDC) of `points` seen from the camera aimed at (x, z) from `distance`. */
function extent(points: ReadonlyArray<readonly [number, number, number]>, lens: FramingLens, x: number, z: number, distance: number) {
  place(lens, x, z, distance)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [px, py, pz] of points) {
    v.set(px, py, pz).project(camera)
    minX = Math.min(minX, v.x)
    maxX = Math.max(maxX, v.x)
    minY = Math.min(minY, v.y)
    maxY = Math.max(maxY, v.y)
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Where to aim the camera, and from how far, so that every point (world studs: ground corners and
 * model tops) is inside the lens window: the nearest distance within the lens limits, with the
 * points centred in the window. Up and down the screen the view is not symmetric (the near side
 * looks bigger), so the target is slid along Z until the points sit in the middle. When nothing
 * fits, the furthest distance is used.
 */
export function fitCityFrame(points: ReadonlyArray<readonly [number, number, number]>, lens: FramingLens): CityFrame | null {
  if (points.length === 0) return null
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const [px, , pz] of points) {
    x0 = Math.min(x0, px)
    x1 = Math.max(x1, px)
    z0 = Math.min(z0, pz)
    z1 = Math.max(z1, pz)
  }
  const x = (x0 + x1) / 2
  const z = (z0 + z1) / 2

  /** The target Z that centres the points vertically at `distance` (a few secant-free nudges). */
  const centred = (distance: number) => {
    let tz = z
    for (let i = 0; i < 6; i++) {
      const e = extent(points, lens, x, tz, distance)
      const mid = (e.minY + e.maxY) / 2 - (lens.window.bottom + lens.window.top) / 2
      if (Math.abs(mid) < 0.005) break
      // One NDC unit up the screen is about this many studs of ground further away at the target.
      const studsPerNdc = distance * Math.tan(THREE.MathUtils.degToRad(lens.fov / 2)) / Math.cos(lens.tilt)
      tz -= mid * studsPerNdc
    }
    return tz
  }
  const fitsAt = (distance: number) => {
    const tz = centred(distance)
    const e = extent(points, lens, x, tz, distance)
    const w = lens.window
    return { tz, ok: e.minX >= w.left && e.maxX <= w.right && e.minY >= w.bottom && e.maxY <= w.top }
  }

  const far = fitsAt(lens.maxDistance)
  if (!far.ok) return { target: [x, 0, far.tz], distance: lens.maxDistance, fits: false }
  let lo = lens.minDistance
  let hi = lens.maxDistance
  let best = far
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    const at = fitsAt(mid)
    if (at.ok) {
      hi = mid
      best = at
    } else lo = mid
  }
  return { target: [x, 0, best.tz], distance: hi, fits: true }
}
