import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ShadowWatcher } from './staticShadows'

function scene() {
  const s = new THREE.Scene()
  const sun = new THREE.DirectionalLight()
  sun.castShadow = true
  const building = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  building.castShadow = true
  const car = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  s.add(sun, sun.target, building, car)
  s.updateMatrixWorld()
  return { s, sun, building, car }
}

describe('ShadowWatcher', () => {
  it('asks for a shadow redraw only when a caster or the light changed', () => {
    const { s, sun, building, car } = scene()
    const w = new ShadowWatcher()
    expect(w.changed(s)).toBe(true) // first frame
    expect(w.changed(s)).toBe(false)
    // Something that casts no shadow moves (city life): no redraw.
    car.position.x = 5
    s.updateMatrixWorld()
    expect(w.changed(s)).toBe(false)
    // A building moves, hides, or the sun moves: redraw.
    building.position.x = 3
    s.updateMatrixWorld()
    expect(w.changed(s)).toBe(true)
    expect(w.changed(s)).toBe(false)
    building.visible = false
    expect(w.changed(s)).toBe(true)
    sun.position.y = 50
    s.updateMatrixWorld()
    expect(w.changed(s)).toBe(true)
    sun.shadow.mapSize.set(2048, 2048)
    expect(w.changed(s)).toBe(true)
    expect(w.changed(s)).toBe(false)
  })

  it('sees instance data changes and new casters', () => {
    const { s } = scene()
    const w = new ShadowWatcher()
    w.changed(s)
    const bricks = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4)
    bricks.castShadow = true
    s.add(bricks)
    s.updateMatrixWorld()
    expect(w.changed(s)).toBe(true)
    bricks.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0))
    bricks.instanceMatrix.needsUpdate = true
    expect(w.changed(s)).toBe(true)
    bricks.count = 2
    expect(w.changed(s)).toBe(true)
    expect(w.changed(s)).toBe(false)
  })
})
