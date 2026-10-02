import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CELL } from '../../core/city'
import {
  blendLight,
  cloneLight,
  copyLight,
  cycleLight,
  DAY_SECONDS,
  linearToHex,
  nearestTime,
  presetPhase,
  smoothstep,
  TIME_PRESETS,
  type LightState,
} from '../../core/timeOfDay'
import { useFrameDriver, useFrameRequest } from '../../render/frameDriver'
import { setNight } from '../../render/nightGlow'
import { useSunShadow } from '../../render/useSunShadow'
import { prefersReducedMotion, useApp } from '../../state/useApp'
import { useGraphics } from '../../state/useGraphics'
import { horizonGeometry, horizonLayout, horizonMaterial } from './horizonGeometry'

const SHADOW_MAP_SIZE = 2048
/** A picked preset fades in over this long (seconds). */
const FADE_SECONDS = 0.8
/** During the automatic day the sun (and so the static shadow map) moves at most this often (ms). */
const SUN_MOVE_MS = 250
const SKY_RADIUS = 1500

/**
 * What the time of day shows right now, for the dev handle (e2e) and anything outside the scene:
 * the live light state and its sun colour as hex.
 */
export const cityLight: { state: LightState | null; sunHex: () => string | null; auto: boolean } = {
  state: null,
  sunHex: () => (cityLight.state ? linearToHex(cityLight.state.sunColor) : null),
  auto: false,
}

const SKY_VERTEX = /* glsl */ `
uniform float uRadius;
varying vec3 vDir;
void main() {
  vDir = position;
  // Centred on the camera, so the sky is always the same distance away.
  gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + position * uRadius, 1.0);
}
`

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uDisc;
uniform float uDiscSize;
uniform float uNight;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.5));
  float c = dot(d, uSunDir);
  // A soft glow around the sun (dimmer around the moon), then the disc itself.
  col += uDisc * pow(max(c, 0.0), 48.0) * mix(0.45, 0.18, uNight);
  float disc = smoothstep(cos(uDiscSize), cos(uDiscSize * 0.8), c);
  col = mix(col, uDisc * mix(1.6, 1.15, uNight), disc);
  // A sprinkle of stars at night.
  if (uNight > 0.01 && disc < 0.5) {
    vec3 q = floor(d * 160.0);
    float n = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    col += step(0.9965, n) * uNight * 0.9 * smoothstep(0.03, 0.25, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** The sky dome's shader settings (uniform values are updated in place each drawn frame). */
function skyParameters(): THREE.ShaderMaterialParameters {
  return {
    uniforms: {
      uRadius: { value: SKY_RADIUS },
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uDisc: { value: new THREE.Color() },
      uDiscSize: { value: 0.05 },
      uNight: { value: 0 },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  }
}

const SKY_GEOMETRY_ARGS: [number, number, number, number, number, number, number] = [1, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]
const noRaycast: THREE.Mesh['raycast'] = () => {}

/**
 * The City's lights and sky from the time of day: the sun (or moon) with its static shadow, the sky
 * light, the sky dome, fog and background, and the night factor (lamps, windows, headlights). A picked
 * preset fades in; the automatic day runs at the graphics frame cap only while it is on (otherwise the
 * City stays render-on-demand), and moves the sun, which redraws the shadow map, only a few times a
 * second.
 */
export function CityLights({ size }: { size: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const span = size * CELL
  const mid = span / 2
  const target = useMemo(() => new THREE.Object3D(), [])
  const { castShadow, mapSize } = useSunShadow(SHADOW_MAP_SIZE)
  const layout = horizonLayout(size)

  const time = useApp((s) => s.cityTime)
  const autoWanted = useApp((s) => s.cityTimeAuto)
  const allowed = useGraphics().autoDayNight
  const [reduced] = useState(prefersReducedMotion)
  const auto = autoWanted && allowed && !reduced

  // The live state and the fade's start (allocated once).
  const live = useRef<LightState>(cloneLight(TIME_PRESETS[useApp.getState().cityTime]))
  const from = useRef<LightState>(cloneLight())
  const fade = useRef(1)
  const phase = useRef(presetPhase(time))
  const lastSun = useRef(-Infinity)
  const dirty = useRef(true)
  useFrameRequest(auto, 'motion')
  // A fade asks for frames only while it runs.
  const driver = useFrameDriver()
  const fadeKey = useRef({})
  useEffect(() => {
    const key = fadeKey.current
    return () => driver?.request(key, null)
  }, [driver])

  const fog = useRef<THREE.Fog>(null)
  const background = useRef<THREE.Color>(null)
  const sky = useRef<THREE.ShaderMaterial>(null)
  const skyParams = useMemo(() => skyParameters(), [])

  useLayoutEffect(() => {
    const cam = light.current?.shadow.camera
    if (!cam) return
    const extent = span * 0.75
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    // From behind the light too: a x10 model can be taller than the light is high, and its top must
    // still cast a shadow (an orthographic shadow camera takes a negative near plane).
    cam.near = -span
    cam.far = span * 2
    cam.updateProjectionMatrix()
    dirty.current = true
  }, [span])

  // A preset picked by hand (or the automatic day switched off: back to its nearest preset) fades in.
  useEffect(() => {
    if (auto) return
    copyLight(from.current, live.current)
    fade.current = reduced ? 1 : 0
    dirty.current = true
    driver?.request(fadeKey.current, reduced ? null : 'motion')
  }, [time, auto, reduced, driver])

  // The automatic day starts from the preset on show.
  useEffect(() => {
    if (!auto) return
    phase.current = presetPhase(useApp.getState().cityTime)
    lastSun.current = -Infinity
    dirty.current = true
  }, [auto])

  useEffect(() => {
    cityLight.state = live.current
    cityLight.auto = auto
  }, [auto])
  useEffect(
    () => () => {
      cityLight.state = null
      cityLight.auto = false
      setNight(0)
    },
    [],
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const s = live.current
    // The sun moves (and so the shadow map redraws) a few times a second at most, and at the end of a fade.
    const now = performance.now()
    let moveSun = now - lastSun.current >= SUN_MOVE_MS
    if (auto) {
      phase.current = (phase.current + dt / DAY_SECONDS) % 1
      cycleLight(s, phase.current)
      // The 🕒 button shows the preset the sky looks most like (kept for when the cycle stops).
      const nearest = nearestTime(phase.current)
      const app = useApp.getState()
      if (app.cityTime !== nearest) app.setCityTime(nearest)
    } else if (fade.current < 1 || dirty.current) {
      fade.current = Math.min(1, fade.current + dt / FADE_SECONDS)
      blendLight(s, from.current, TIME_PRESETS[useApp.getState().cityTime], smoothstep(fade.current))
      if (fade.current >= 1) moveSun = true
      if (fade.current >= 1) driver?.request(fadeKey.current, null)
    } else return
    dirty.current = false

    if (moveSun) lastSun.current = now
    const l = light.current
    if (l) {
      l.color.setRGB(s.sunColor[0], s.sunColor[1], s.sunColor[2])
      l.intensity = s.sunIntensity
      if (moveSun) {
        const dist = span * 0.7
        l.position.set(mid + s.sunDir[0] * dist, Math.max(0.15, s.sunDir[1]) * dist, mid + s.sunDir[2] * dist)
      }
    }
    const h = hemi.current
    if (h) {
      h.color.setRGB(s.hemiSky[0], s.hemiSky[1], s.hemiSky[2])
      h.groundColor.setRGB(s.hemiGround[0], s.hemiGround[1], s.hemiGround[2])
      h.intensity = s.hemiIntensity
    }
    fog.current?.color.setRGB(s.skyHorizon[0], s.skyHorizon[1], s.skyHorizon[2])
    background.current?.setRGB(s.skyHorizon[0], s.skyHorizon[1], s.skyHorizon[2])
    const m = sky.current
    if (m) {
      const u = m.uniforms
      ;(u.uTop.value as THREE.Color).setRGB(s.skyTop[0], s.skyTop[1], s.skyTop[2])
      ;(u.uHorizon.value as THREE.Color).setRGB(s.skyHorizon[0], s.skyHorizon[1], s.skyHorizon[2])
      ;(u.uSunDir.value as THREE.Vector3).set(s.discDir[0], s.discDir[1], s.discDir[2])
      ;(u.uDisc.value as THREE.Color).setRGB(s.discColor[0], s.discColor[1], s.discColor[2])
      u.uDiscSize.value = s.discSize
      u.uNight.value = s.night
    }
    setNight(s.night)
  })

  const initial = TIME_PRESETS[useApp.getState().cityTime].sunDir
  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#7a9a6a', 1.6]} />
      <primitive object={target} position={[mid, 0, mid]} />
      <directionalLight
        ref={light}
        target={target}
        position={[mid + initial[0] * span * 0.7, initial[1] * span * 0.7, mid + initial[2] * span * 0.7]}
        intensity={2.2}
        castShadow={castShadow}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
      />
      <fog ref={fog} attach="fog" args={['#87ceeb', layout.fogNear, layout.fogFar]} />
      <color ref={background} attach="background" args={['#87ceeb']} />
      {/* Gradient sky dome with the sun or moon disc: drawn first, behind everything (one draw call). */}
      <mesh frustumCulled={false} renderOrder={-1000} raycast={noRaycast}>
        <sphereGeometry args={SKY_GEOMETRY_ARGS} />
        <shaderMaterial ref={sky} args={[skyParams]} />
      </mesh>
    </>
  )
}

/**
 * Distant LEGO mountains and forest around the city (graphics "horizon"; off: none, the far ground
 * and the fog still hide the edge of the world). Never casts or receives shadows and is never picked
 * (the City picks with its own boxes and the ground plane, and this ignores raycasts anyway).
 */
export function Horizon({ size }: { size: number }) {
  const on = useGraphics().horizon
  if (!on) return null
  const { center, radius } = horizonLayout(size)
  return (
    <mesh
      geometry={horizonGeometry()}
      material={horizonMaterial()}
      position={[center, -0.3, center]}
      scale={radius}
      raycast={noRaycast}
      dispose={null}
    />
  )
}
