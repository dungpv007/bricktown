import type * as THREE from 'three'

/**
 * Shadow stand-ins: meshes drawn only into the shadow map, never on screen. A detailed model then
 * renders without casting a shadow itself, and a cheap copy of it (no studs, see `bakeShadowBricks`)
 * casts it instead, which halves what a full town costs per frame.
 *
 * three.js has no "shadow pass only" switch (the shadow pass tests layers against the main
 * camera), so a renderer with stand-ins gets its shadow pass wrapped: stand-ins stay hidden, and
 * are shown just while the shadow map renders, after the main render list was already built.
 */

const proxies = new Set<THREE.Object3D>()

/** Whether `object` is a registered shadow stand-in (its visibility is managed here: leave it alone). */
export const isShadowProxy = (object: THREE.Object3D): boolean => proxies.has(object)

/** Makes `object` a shadow stand-in (hidden from the normal pass); returns the function that undoes it. */
export function registerShadowProxy(object: THREE.Object3D): () => void {
  object.visible = false
  proxies.add(object)
  return () => {
    proxies.delete(object)
  }
}

/**
 * Lets the shadow pass of `gl` see the registered stand-ins (while it runs, and only then). Returns
 * the function that puts the renderer back.
 */
export function installShadowProxies(gl: THREE.WebGLRenderer): () => void {
  const shadowMap = gl.shadowMap
  const render = shadowMap.render
  shadowMap.render = function (this: THREE.WebGLShadowMap, ...args: Parameters<THREE.WebGLShadowMap['render']>) {
    for (const p of proxies) p.visible = true
    try {
      render.apply(this, args)
    } finally {
      for (const p of proxies) p.visible = false
    }
  }
  return () => {
    shadowMap.render = render
  }
}
