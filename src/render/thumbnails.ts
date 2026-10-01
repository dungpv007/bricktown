import * as THREE from 'three'
import { bakeBricksUncached, bakedGeometries, disposeBaked, type BakedModel } from '../core/bake'
import { getPart } from '../core/parts/catalog'
import type { Brick } from '../core/types'
import { bakedMaterials } from './materials'

/**
 * Picture buttons: renders a brick model to a PNG data URL with one lazily created offscreen
 * WebGL renderer. Never throws; when WebGL is unavailable it resolves to '' and the UI falls back
 * to an icon. Not covered by unit tests (needs a GPU / DOM) - verified visually instead.
 */

export const BLUEPRINT_THUMB_SIZE = 256
export const PART_THUMB_SIZE = 128

/** Fixed 3/4 isometric viewing direction: front-right, from above (matches the Workshop view). */
const VIEW_DIR = new THREE.Vector3(1, 0.9, 1).normalize()
/** Steeper, from the front, for flat printed tiles: the picture is what tells them apart. */
const PRINT_VIEW_DIR = new THREE.Vector3(0.3, 1.6, 0.8).normalize()
const FIT_MARGIN = 1.12

let renderer: THREE.WebGLRenderer | null = null
let unavailable = false
let queue: Promise<unknown> = Promise.resolve()
const memo = new Map<string, Promise<string>>()

function getRenderer(): THREE.WebGLRenderer | null {
  if (unavailable || typeof document === 'undefined') return null
  if (renderer) return renderer
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    r.setPixelRatio(1)
    r.setClearColor(0x000000, 0)
    r.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      if (renderer === r) renderer = null
      r.dispose()
    })
    renderer = r
    return r
  } catch {
    unavailable = true
    return null
  }
}

function createScene(): THREE.Scene {
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#7a9a6a', 1.6))
  const sun = new THREE.DirectionalLight('#ffffff', 2.2)
  sun.position.set(0.5, 1, 0.6).multiplyScalar(50)
  scene.add(sun)
  return scene
}

/** Orthographic camera looking at the box's centre along VIEW_DIR, sized to just contain it. */
function fitCamera(box: THREE.Box3, viewDir: THREE.Vector3): THREE.OrthographicCamera {
  const center = box.getCenter(new THREE.Vector3())
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 8)
  camera.position.copy(center).addScaledVector(viewDir, radius * 4)
  camera.lookAt(center)
  camera.updateMatrixWorld(true)

  const view = new THREE.Box3()
  const corner = new THREE.Vector3()
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        view.expandByPoint(corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse))
      }
    }
  }
  const half = (Math.max(view.max.x - view.min.x, view.max.y - view.min.y) / 2) * FIT_MARGIN || 1
  const mid = view.getCenter(new THREE.Vector3())
  camera.left = mid.x - half
  camera.right = mid.x + half
  camera.top = mid.y + half
  camera.bottom = mid.y - half
  camera.updateProjectionMatrix()
  return camera
}

function render(bricks: Brick[], size: number, viewDir: THREE.Vector3): string {
  const gl = getRenderer()
  if (!gl || bricks.length === 0) return ''
  const scene = createScene()
  // Baked here (uncached) and disposed below, so thumbnails do not pin geometry in the shared cache.
  // Inside the try: an unknown part id throws, which must resolve '' rather than reject forever.
  let baked: BakedModel | null = null
  try {
    baked = bakeBricksUncached(bricks)
    const box = new THREE.Box3()
    for (const [kind, geometry] of bakedGeometries(baked)) {
      const mesh = new THREE.Mesh(geometry, bakedMaterials[kind])
      mesh.geometry.computeBoundingBox()
      if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox)
      scene.add(mesh)
    }
    gl.setSize(size, size, false)
    gl.render(scene, fitCamera(box, viewDir))
    return gl.domElement.toDataURL('image/png')
  } catch {
    return ''
  } finally {
    if (baked) disposeBaked(baked)
  }
}

/**
 * PNG data URL of a model, memoised by `key` (include whatever makes the picture change, e.g.
 * `${blueprint.id}:${blueprint.updatedAt}`). Resolves to '' if rendering is impossible.
 */
export function getThumbnail(
  key: string,
  bricks: Brick[],
  size = BLUEPRINT_THUMB_SIZE,
  viewDir: THREE.Vector3 = VIEW_DIR,
): Promise<string> {
  const cached = memo.get(key)
  if (cached) return cached
  // One render per macrotask so a burst of requests never blocks input.
  const result = queue
    .then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    .then(() => render(bricks, size, viewDir))
    .then((url) => {
      if (!url) memo.delete(key) // failures are not remembered, so a later request can retry
      return url
    })
  queue = result.catch(() => undefined)
  memo.set(key, result)
  return result
}

/** Thumbnail of a single part in the given colour index. */
export function getPartThumbnail(partId: string, color: number): Promise<string> {
  const brick: Brick = { id: 'thumb', p: partId, x: 0, y: 0, z: 0, r: 0, c: color }
  let viewDir = VIEW_DIR
  try {
    if (getPart(partId).shape === 'tile_print') viewDir = PRINT_VIEW_DIR
  } catch {
    // Unknown part: render() resolves '' for it anyway.
  }
  return getThumbnail(`part:${partId}:${color}`, [brick], PART_THUMB_SIZE, viewDir)
}
