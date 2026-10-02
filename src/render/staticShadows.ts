import type * as THREE from 'three'
import { isShadowProxy } from './shadowProxies'

/**
 * Static shadows: the shadow map is redrawn only when what it shows changed, instead of every frame.
 * A cheap signature of everything the shadow pass depends on (each shadow caster that would be drawn:
 * its world matrix, geometry and instance data; each shadow-casting light: its pose, shadow camera and
 * map size) is compared with the previous frame's. Buildings that stand still, a camera that orbits
 * and ambient life that casts no shadow then cost no shadow pass at all; a moved brick, a placed
 * model, a dragged ghost that casts one, or a light that follows a car redraw it on that frame.
 */
export class ShadowWatcher {
  private prev = new Float64Array(0)
  private cur = new Float64Array(512)
  private n = 0

  private push(v: number): void {
    if (this.n === this.cur.length) {
      const grown = new Float64Array(this.cur.length * 2)
      grown.set(this.cur)
      this.cur = grown
    }
    this.cur[this.n++] = v
  }

  private pushMatrix(m: THREE.Matrix4): void {
    const e = m.elements
    for (let i = 0; i < 16; i++) if (i % 4 !== 3) this.push(e[i])
  }

  private walk(o: THREE.Object3D, shown: boolean): void {
    // Shadow stand-ins are hidden from the main pass but drawn in the shadow pass (render/shadowProxies).
    const visible = shown && (o.visible || isShadowProxy(o))
    if (!visible) return
    const mesh = o as THREE.Mesh & Partial<THREE.InstancedMesh>
    if (o.castShadow && (mesh.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine)) {
      this.push(o.id)
      this.pushMatrix(o.matrixWorld)
      this.push(mesh.geometry?.id ?? -1)
      if (mesh.isInstancedMesh && mesh.instanceMatrix) {
        this.push(mesh.count ?? 0)
        this.push(mesh.instanceMatrix.version)
      }
    }
    const light = o as THREE.DirectionalLight
    if (light.isLight && light.castShadow && light.shadow) {
      this.push(-o.id)
      this.pushMatrix(o.matrixWorld)
      if (light.target) this.pushMatrix(light.target.matrixWorld)
      const cam = light.shadow.camera as THREE.OrthographicCamera & THREE.PerspectiveCamera
      this.push(cam.left ?? 0)
      this.push(cam.right ?? 0)
      this.push(cam.top ?? 0)
      this.push(cam.bottom ?? 0)
      this.push(cam.near)
      this.push(cam.far)
      this.push(cam.fov ?? 0)
      this.push(light.shadow.mapSize.x)
      this.push(light.shadow.mapSize.y)
      this.push(light.shadow.map ? 1 : 0)
    }
    for (const child of o.children) this.walk(child, visible)
  }

  /** Whether the shadow map would look different from the last time this was asked. */
  changed(scene: THREE.Object3D): boolean {
    this.n = 0
    this.walk(scene, true)
    let same = this.prev.length === this.n
    for (let i = 0; same && i < this.n; i++) same = this.prev[i] === this.cur[i]
    if (same) return false
    if (this.prev.length !== this.n) this.prev = new Float64Array(this.n)
    this.prev.set(this.cur.subarray(0, this.n))
    return true
  }
}

/**
 * Switches `gl` to static shadows for `scene`: no automatic shadow pass, one whenever the watcher sees
 * a change (checked inside render(), after the world matrices are updated and before the shadow pass).
 * Returns the function that puts both back.
 */
export function installStaticShadows(gl: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const watcher = new ShadowWatcher()
  const previous = scene.onBeforeRender
  gl.shadowMap.autoUpdate = false
  gl.shadowMap.needsUpdate = true
  scene.onBeforeRender = (...args) => {
    if (watcher.changed(scene)) gl.shadowMap.needsUpdate = true
    previous.apply(scene, args)
  }
  return () => {
    scene.onBeforeRender = previous
    gl.shadowMap.autoUpdate = true
  }
}

/** Asks for one shadow pass with the next frame. */
export function refreshShadows(gl: THREE.WebGLRenderer): void {
  gl.shadowMap.needsUpdate = true
}

/**
 * After a shadow quality change: drops every shadow map whose size no longer matches its light's
 * `shadow.mapSize` (three.js only makes a map when there is none) and, with `recompile`, makes every
 * material recompile (shadows on or off change the shaders).
 */
export function applyShadowSettings(scene: THREE.Object3D, recompile: boolean): void {
  scene.traverse((o) => {
    const shadow = (o as THREE.DirectionalLight).shadow
    if ((o as THREE.Light).isLight && shadow?.map && (shadow.map.width !== shadow.mapSize.x || shadow.map.height !== shadow.mapSize.y)) {
      shadow.map.dispose()
      shadow.map = null
    }
    if (!recompile) return
    const m = (o as THREE.Mesh).material
    if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true))
    else if (m) m.needsUpdate = true
  })
}
