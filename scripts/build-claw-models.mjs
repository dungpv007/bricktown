// Builds public/models/claw/prizes.glb, the claw machine's prize models (src/play/claw/prizes.ts).
//
// Inputs: the unzipped Kenney packs (https://kenney.nl, licence CC0) in one folder:
//   kenney_cube-pets_1.0/, kenney_holiday-kit/, kenney_toy-car-kit/, kenney_car-kit/
//   (each with "Models/GLB format/*.glb")
// given as the first argument or KENNEY_DIR. Output: public/models/claw/prizes.glb (or the second argument).
//
// Each prize becomes a top-level node named by its prize id, scaled to fit a 1 x 1 x 1 box (centred on
// x/z, bottom at y = 0). Everything is merged into one file: textures embedded and deduplicated,
// vertices welded, attributes quantized (KHR_mesh_quantization: three.js reads it natively, no decoder).
//
// The gltf-transform packages are not project dependencies; install them for one run without saving:
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
//   node scripts/build-claw-models.mjs ~/Downloads/kenney
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, getBounds, mergeDocuments, prune, quantize, unpartition, weld } from '@gltf-transform/functions'

const args = globalThis.process.argv.slice(2)
const KENNEY = args[0] ?? globalThis.process.env.KENNEY_DIR
const OUT = args[1] ?? 'public/models/claw/prizes.glb'
if (!KENNEY) {
  console.error('usage: node scripts/build-claw-models.mjs <kenney packs folder> [out.glb]  (or KENNEY_DIR=...)')
  globalThis.process.exit(1)
}

/** Prize id → source model (the procedural ones, beach_ball, star, airplane and helicopter, are drawn in code). */
const SOURCES = {
  bunny: 'kenney_cube-pets_1.0/Models/GLB format/animal-bunny.glb',
  cat: 'kenney_cube-pets_1.0/Models/GLB format/animal-cat.glb',
  panda: 'kenney_cube-pets_1.0/Models/GLB format/animal-panda.glb',
  chick: 'kenney_cube-pets_1.0/Models/GLB format/animal-chick.glb',
  pig: 'kenney_cube-pets_1.0/Models/GLB format/animal-pig.glb',
  penguin: 'kenney_cube-pets_1.0/Models/GLB format/animal-penguin.glb',
  gift_box: 'kenney_holiday-kit/Models/GLB format/present-a-cube.glb',
  gift_round: 'kenney_holiday-kit/Models/GLB format/present-b-round.glb',
  monster_truck: 'kenney_toy-car-kit/Models/GLB format/vehicle-monster-truck.glb',
  racer: 'kenney_toy-car-kit/Models/GLB format/vehicle-racer.glb',
  loader: 'kenney_car-kit/Models/GLB format/tractor-shovel.glb',
  garbage_truck: 'kenney_car-kit/Models/GLB format/garbage-truck.glb',
  tractor: 'kenney_car-kit/Models/GLB format/tractor.glb',
  fire_truck: 'kenney_car-kit/Models/GLB format/firetruck.glb',
  police_car: 'kenney_car-kit/Models/GLB format/police.glb',
  ambulance: 'kenney_car-kit/Models/GLB format/ambulance.glb',
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const out = new Document()
out.createBuffer()
const scene = out.createScene('prizes')

for (const [id, rel] of Object.entries(SOURCES)) {
  const src = await io.read(`${KENNEY}/${rel}`) // reads the pack's external Textures/colormap.png too
  const srcScene = src.getRoot().listScenes()[0]
  const b = getBounds(srcScene)
  const s = 1 / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])
  const wrap = src
    .createNode(id)
    .setScale([s, s, s])
    .setTranslation([-((b.min[0] + b.max[0]) / 2) * s, -b.min[1] * s, -((b.min[2] + b.max[2]) / 2) * s])
  for (const child of srcScene.listChildren()) {
    srcScene.removeChild(child)
    wrap.addChild(child)
  }
  srcScene.addChild(wrap)
  const merged = mergeDocuments(out, src).get(srcScene)
  for (const n of merged.listChildren()) scene.addChild(n)
  merged.dispose()
}
await out.transform(unpartition())
for (const s of out.getRoot().listScenes()) if (s !== scene) s.dispose()
out.getRoot().setDefaultScene(scene)
await out.transform(dedup(), prune(), weld(), dedup(), prune(), quantize())
for (const t of out.getRoot().listTextures()) t.setURI('') // embedded in the .glb
await io.write(OUT, out)
console.log(`wrote ${OUT}`)
