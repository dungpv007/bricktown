# BrickTown Phase 1 — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-01-bricktown-design.md`

Goal: kid-friendly, touch-first, offline PWA LEGO-style sandbox: Workshop (brick editor) → Guided Build templates → Blueprints → City → Drive.

## Global Constraints

These bind every task. Implementers and reviewers must follow them verbatim.

- Stack already scaffolded: Vite 8, React 19, TypeScript 6 (strict), @react-three/fiber 9, @react-three/drei 10, @react-three/rapier 2, three 0.186, zustand 5, dexie 4, vite-plugin-pwa, Vitest 5, Playwright. Do NOT upgrade TypeScript to 7 (typescript-eslint incompatible).
- Commands that must pass before every commit: `npm test`, `npx tsc -b`, `npm run lint`.
- `src/core/**` is pure TypeScript: no React, no DOM. It MAY import `three` only in files that build geometry (`src/core/parts/geometry.ts`, `src/core/bake.ts`). Everything in `src/core` is unit-tested with Vitest (`*.test.ts` next to the file).
- Units: 1 world unit = 1 stud. Vertical unit = 1 plate = 0.4 world. 1 brick = 3 plates. Constants in `src/core/units.ts` (`STUD`, `PLATE_HEIGHT`, `PLATES_PER_BRICK`, `platesToWorld`) — reuse them.
- Brick coordinates are integers. `(x, z)` = min corner of the rotated footprint in studs; `y` = bottom plate index (ground = 0).
- Rotation `r ∈ {0,1,2,3}` = r × 90° counter-clockwise around +Y (viewed from above). Footprint at r=0 is `w` along X and `d` along Z; for odd r it is `d` along X and `w` along Z. Occupied cells always start at `(x, z)`.
- Render transform of a brick: center = `(x + fx/2, platesToWorld(y) + platesToWorld(h)/2, z + fz/2)` where `fx,fz` = rotated footprint; mesh rotation Y = `r * Math.PI / 2`. Part geometry is built centered at origin with `w` along X, `d` along Z, height `platesToWorld(h)`.
- Shared types live in `src/core/types.ts` (created in Task 1). Never redefine them elsewhere.
- UI language: Vietnamese default, English alternative. All user-facing strings go through `t()` from `src/ui/i18n` (created in Task 4). Kid-first UI: icon buttons ≥ 64px touch targets, minimal text, no hover-only interactions.
- Touch first: every interaction must work with tap/drag/pinch; mouse also works. Tap = pointer down→up within 250ms and < 8px movement.
- State: zustand stores in `src/state/`. Persistent game data lives in ONE store `useGame` (Task 4) whose `data: SaveData` is what gets saved.
- No Phase 2 features (NPC, money, missions). Only keep the `tags` field on blueprints/templates.
- Add `data-testid` attributes to main UI controls so Playwright can drive them.
- Commit at the end of each task with a conventional message, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Core types, colors, part catalog, rotation

**Files:** create `src/core/types.ts`, `src/core/colors.ts`, `src/core/parts/catalog.ts`, `src/core/rotation.ts`, tests `src/core/colors.test.ts`, `src/core/parts/catalog.test.ts`, `src/core/rotation.test.ts`.

`src/core/types.ts` must contain exactly these exported types (add doc comments only):

```ts
export type Rot = 0 | 1 | 2 | 3

export interface Brick {
  id: string // unique within its model
  p: string // PartDef.id
  x: number
  y: number
  z: number
  r: Rot
  c: number // color index into COLORS
}

export type PartCategory =
  | 'brick' | 'plate' | 'slope' | 'round' | 'door_window' | 'wheel' | 'furniture' | 'nature'

export type PartShape =
  | 'box' | 'tile' | 'slope' | 'slope_inv' | 'cylinder' | 'cone' | 'wheel'
  | 'window' | 'door' | 'fence' | 'table' | 'chair' | 'counter' | 'stove'
  | 'fridge' | 'sign' | 'lamp' | 'tree' | 'bush' | 'flower'

export interface PartDef {
  id: string
  category: PartCategory
  shape: PartShape
  w: number // studs along X at r=0
  d: number // studs along Z at r=0
  h: number // plates
  studs: boolean // render studs on top
  sym: 1 | 2 | 4 // rotational symmetry order around Y
  tags?: string[] // e.g. ['wheel']
}

export interface Baseplate { w: number; d: number }

export type BlueprintKind = 'building' | 'vehicle' | 'prop'

export interface Blueprint {
  id: string
  name: string
  kind: BlueprintKind
  tags: string[]
  baseplate: Baseplate
  bricks: Brick[]
  createdAt: number
  updatedAt: number
  templateId?: string
}

export interface LocalizedText { vi: string; en: string }

export interface Template {
  id: string
  name: LocalizedText
  difficulty: 1 | 2 | 3
  kind: BlueprintKind
  tags: string[]
  baseplate: Baseplate
  bricks: Brick[]
  steps: number[][] // indices into bricks, in build order
}

export interface CityPlacement {
  id: string
  /** blueprint id, or `tpl:<templateId>` for ready-made template models */
  source: string
  cx: number // cell x of min corner
  cz: number // cell z of min corner
  rot: Rot
}

export interface CityState {
  size: number // cells per side
  roads: string[] // "cx,cz" keys
  placements: CityPlacement[]
}

export interface WorkshopState {
  kind: BlueprintKind
  baseplate: Baseplate
  bricks: Brick[]
  editingBlueprintId?: string
}

export interface GuidedState {
  templateId: string
  step: number // index of current step
  placed: string[] // brick ids of the template already placed
}

export interface SaveData {
  schemaVersion: number
  blueprints: Blueprint[]
  city: CityState
  workshop: WorkshopState
  guided: GuidedState | null
  completedTemplates: string[]
}
```

`src/core/colors.ts`: export `interface BrickColor { id: number; name: LocalizedText; hex: string; glass?: boolean }` and `COLORS: BrickColor[]` with exactly these 16 entries in this order (id = index):
0 white `#F4F4F4` (Trắng/White), 1 black `#1B2A34` (Đen/Black), 2 red `#C91A09` (Đỏ/Red), 3 blue `#0055BF` (Xanh dương/Blue), 4 yellow `#F2CD37` (Vàng/Yellow), 5 green `#237841` (Xanh lá/Green), 6 orange `#FE8A18` (Cam/Orange), 7 light gray `#A0A5A9` (Xám nhạt/Light gray), 8 dark gray `#6C6E68` (Xám đậm/Dark gray), 9 brown `#583927` (Nâu/Brown), 10 tan `#E4CD9E` (Be/Tan), 11 lime `#BBE90B` (Xanh nõn chuối/Lime), 12 pink `#FC97AC` (Hồng/Pink), 13 purple `#81007B` (Tím/Purple), 14 azure `#36AEBF` (Xanh ngọc/Azure), 15 glass `#CFE8F0` with `glass: true` (Kính/Glass). Export `DEFAULT_COLOR = 2`.

`src/core/parts/catalog.ts`: export `PARTS: PartDef[]`, `PART_BY_ID: Record<string, PartDef>`, `getPart(id): PartDef` (throws on unknown id), `PART_CATEGORIES: PartCategory[]` in display order `['brick','plate','slope','round','door_window','wheel','furniture','nature']`. Exactly these 41 parts (id: category, shape, w×d, h, studs, sym, tags):

- brick (shape box, h 3, studs true): `brick_1x1` 1×1 sym4, `brick_1x2` 1×2 sym2, `brick_1x3` 1×3 sym2, `brick_1x4` 1×4 sym2, `brick_1x6` 1×6 sym2, `brick_2x2` 2×2 sym4, `brick_2x3` 2×3 sym2, `brick_2x4` 2×4 sym2, `brick_2x6` 2×6 sym2
- plate (shape box, h 1, studs true): `plate_1x1` sym4, `plate_1x2` sym2, `plate_1x4` sym2, `plate_2x2` sym4, `plate_2x4` sym2, `plate_4x4` sym4, `plate_4x8` sym2; (shape tile, h 1, studs false): `tile_1x2` sym2, `tile_2x2` sym4
- slope (h 3, studs true, sym 1): `slope_1x2` shape slope 1×2, `slope_2x2` slope 2×2, `slope_2x4` slope 4×2 (w=4, d=2), `slope_inv_2x2` shape slope_inv 2×2
- round (h 3, studs true): `round_1x1` cylinder 1×1 sym4, `round_2x2` cylinder 2×2 sym4, `cone_1x1` cone 1×1 sym4 studs false
- door_window (studs true, sym 1): `window_1x2x2` window w2 d1 h6, `window_1x4x3` window w4 d1 h9, `door_1x4x6` door w4 d1 h18, `fence_1x4` fence w4 d1 h3
- wheel (studs false, sym 2, tags ['wheel']): `wheel_small` wheel w1 d2 h5, `wheel_large` wheel w2 d3 h8
- furniture (studs false, sym 1): `table_2x2` table 2×2 h3 sym4, `chair_1x1` chair 1×1 h3, `counter_1x2` counter w2 d1 h3, `stove_1x2` stove w2 d1 h3, `fridge_1x1` fridge 1×1 h6, `sign_1x2` sign w2 d1 h6, `lamp_1x1` lamp 1×1 h12 sym4
- nature (studs false, sym 4): `tree_2x2` tree 2×2 h12, `bush_2x2` bush 2×2 h3, `flower_1x1` flower 1×1 h2

`src/core/rotation.ts`: export
- `footprint(part: PartDef, r: Rot): { fx: number; fz: number }`
- `cellsOf(brick: Brick): Array<[number, number, number]>` — every occupied voxel `[x, y, z]` (footprint × h plates)
- `rotEquivalent(part: PartDef, a: Rot, b: Rot): boolean` — sym 4 → true; sym 2 → a%2 === b%2; sym 1 → a === b
- `nextRot(r: Rot): Rot`
- `brickCenter(brick: Brick): [number, number, number]` per the Global Constraints render transform.

Tests: palette length 16 and ids match index; catalog has 41 unique ids, every part has w,d,h ≥ 1, `getPart` throws on unknown; footprint swaps for odd r; `cellsOf` count = fx*fz*h and min corner at (x,y,z); rotEquivalent truth table for sym 1/2/4; brickCenter for `brick_2x4` at (0,0,0,r=0) = (1, 0.6, 2) and at r=1 = (2, 0.6, 1).

Done when tests, tsc, lint pass; commit.

---

### Task 2: Occupancy, model operations, serialization

**Files:** create `src/core/occupancy.ts`, `src/core/model.ts`, `src/core/serialize.ts`, `src/core/ids.ts` + tests.

`src/core/ids.ts`: `newId(prefix?: string): string` — short random id (use `crypto.randomUUID()` sliced or a counter+random; must be unique in practice).

`src/core/occupancy.ts`: `class Occupancy` built from `Brick[]`, keyed `"x,y,z"` → brick id. Methods: `static from(bricks)`, `add(brick)`, `remove(brick)`, `get(x,y,z): string | undefined`, `collides(brick, ignoreId?): boolean`, `isSupported(brick, ignoreId?): boolean` (true if `brick.y === 0` or at least one voxel directly below any footprint cell — at `y-1` — is occupied by a brick other than `ignoreId`).

`src/core/model.ts` — pure, immutable functions over `Brick[]` (return new arrays, never mutate input):
- `export const MAX_HEIGHT_PLATES = 72` and `export const MAX_BRICKS = 1500`
- `type PlaceError = 'collision' | 'unsupported' | 'out_of_bounds' | 'limit'`
- `canPlace(bricks, brick, baseplate, ignoreId?): PlaceError | null` — out_of_bounds if any cell outside `[0,w)×[0,d)` or y < 0 or top > MAX_HEIGHT_PLATES; limit if adding would exceed MAX_BRICKS (ignore when `ignoreId` set); then collision; then unsupported.
- `addBrick(bricks, brick, baseplate): { bricks: Brick[]; error: PlaceError | null }` (unchanged array on error)
- `removeBrick(bricks, id): Brick[]` — also removes nothing else (floating bricks are allowed to remain; kids expect only the tapped brick to vanish)
- `paintBrick(bricks, id, c): Brick[]`
- `rotateBrick(bricks, id, baseplate): { bricks; error }` — rotates in place keeping (x,z), validated with `canPlace(..., ignoreId=id)`
- `moveBrick(bricks, id, to: {x,y,z}, baseplate): { bricks; error }`
- `bounds(bricks): { minX, minY, minZ, maxX, maxY, maxZ } | null` (max exclusive, in studs/plates)

`src/core/serialize.ts`:
- `export const SCHEMA_VERSION = 1`
- `createEmptySave(): SaveData` — blueprints [], city `{ size: 48, roads: [], placements: [] }`, workshop `{ kind: 'building', baseplate: { w: 16, d: 16 }, bricks: [] }`, guided null, completedTemplates []
- `type Migration = (data: Record<string, unknown>) => Record<string, unknown>` (no `any` — lint forbids it); `MIGRATIONS: Record<number, Migration>` (empty for now; key N migrates from N to N+1)
- `migrate(raw: unknown): SaveData` — validates object shape minimally, applies migrations from `raw.schemaVersion` up to SCHEMA_VERSION, throws `Error('unsupported save')` for newer/invalid versions
- `exportSave(data: SaveData): string` (pretty JSON with `{ app: 'bricktown', ...data }`) and `importSave(json: string): SaveData` (checks `app === 'bricktown'`, then `migrate`)

Tests: collision of overlapping 2x4s; support rule (floating rejected, stacked on partial overlap accepted, y=0 accepted); out-of-bounds at baseplate edges incl. rotated footprint; MAX_BRICKS limit; immutability (input array unchanged); rotate blocked by neighbour returns error; move; bounds; export→import round-trip deep-equal; import rejects wrong app / newer version.

---

### Task 3: Procedural part geometry

**Files:** create `src/core/parts/geometry.ts` + `src/core/parts/geometry.test.ts`.

Export `getPartGeometry(partId: string): THREE.BufferGeometry` — built once per part and cached (same instance returned on repeated calls). Non-indexed or indexed is fine but all geometries must have `position` and `normal` attributes and be merged into ONE BufferGeometry per part (use `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`; convert pieces to non-indexed before merging if attributes mismatch). Geometry is centered on origin at r=0: X ∈ [-w/2, w/2], Z ∈ [-d/2, d/2], Y ∈ [-H/2, H/2] with H = platesToWorld(h); studs stick out above +H/2.

Low-poly targets (mobile): cylinders 12 segments; studs radius 0.3, height 0.17, 10 segments, one per stud cell when `studs` is true (centered in each 1×1 cell on the top face; for `slope`, only on the top back row z ∈ [-d/2, -d/2+1]). Shrink body by 0.01 on each side (gap between neighbours).

Shapes (all fit inside the bounding box above, excluding studs):
- box, tile: box. tile has no studs.
- slope: full-height back row (z from -d/2 to -d/2+1), then a wedge descending toward +Z down to 1 plate height at the front edge. For d=1 it degenerates to a wedge over the whole depth.
- slope_inv: mirror vertically (full top, slanted underside).
- cylinder: cylinder radius min(w,d)/2 - 0.02. cone: cone same radius.
- wheel: tire cylinder with axis along X: radius = H/2, length = w; plus a lighter hub is NOT needed (single geometry; colour comes from the brick).
- window: frame (box outline: two side posts 0.2 thick, top and bottom bars) with an empty middle — the glass is a separate thin box inside the frame (included in the same geometry).
- door: frame like window + a door slab box 0.15 thick filling it.
- fence: two posts + two horizontal rails.
- table: top slab 1 plate thick + 4 legs. chair: seat + back + 4 legs. counter: box with a slightly overhanging top slab. stove: box + 2 small cylinder burners on top. fridge: box + thin handle box. sign: post + panel in the top half.
- lamp: thin pole + small box head at the top. tree: trunk cylinder (lower 1/4) + cone/sphere canopy (low-poly, ≤ 12 segments). bush: low-poly sphere squashed to fit. flower: thin stem + small sphere.

Tests (Vitest, node env — three works without DOM): every part in PARTS returns a geometry with position+normal attributes; caching returns the same object; bounding box of the body (compute `geometry.boundingBox`) has X extent ≤ w + 0.001 and Z extent ≤ d + 0.001 and minY ≈ -H/2 (±0.02); parts with studs have maxY > H/2; total triangle count for `brick_2x4` < 1500 (perf guard).

---

### Task 4: App shell, i18n, stores, history

**Files:** create `src/ui/i18n/vi.ts`, `src/ui/i18n/en.ts`, `src/ui/i18n/index.ts`, `src/state/useApp.ts`, `src/state/useGame.ts`, `src/state/useEditor.ts`, `src/state/history.ts`, `src/ui/MainMenu.tsx`, `src/ui/TopBar.tsx`, `src/ui/theme.css`; modify `src/App.tsx`; tests `src/state/history.test.ts`, `src/state/useEditor.test.ts`.

i18n: `vi.ts` exports `const vi = { ... } as const`; `en.ts` exports `en: Record<keyof typeof vi, string>` (TypeScript must error on missing keys). `index.ts` exports `type TKey = keyof typeof vi`, `t(key: TKey, lang?)` reading `useApp.getState().lang` by default, and a hook `useT()` returning a `t` bound to the current lang (re-renders on change). Seed keys for: app title, menu buttons (workshop "Xưởng lắp ráp", guided "Lắp theo hướng dẫn", city "Thành phố", drive "Lái xe", settings), tools (place, paint, delete, rotate, move, undo, redo), kinds (building, vehicle, prop), sizes (small, large), save, back, done, difficulty easy/normal, language. Later tasks add keys to both files.

`useApp` (zustand): `{ mode: 'menu' | 'workshop' | 'guided' | 'city' | 'drive'; lang: 'vi' | 'en'; slotId: 1 | 2 | 3; difficulty: 'easy' | 'normal'; setMode, setLang, setDifficulty, setSlot }`. `lang` and `difficulty` persisted to localStorage via zustand `persist` middleware (key `bricktown-prefs`), wrapped so it never throws when storage is unavailable.

`useGame` (zustand): `{ data: SaveData; loaded: boolean; setData(data); update(fn: (d: SaveData) => SaveData) }` initialised with `createEmptySave()`. Helper actions: `upsertBlueprint(bp)`, `deleteBlueprint(id)` (also removes city placements whose source is that id), `setWorkshop(ws)`, `setCity(city)`, `setGuided(g | null)`, `markTemplateCompleted(id)`.

`history.ts`: generic snapshot history `createHistory<T>(limit = 100)` with `push(state)`, `undo(current): T | undefined`, `redo(current): T | undefined`, `canUndo`, `canRedo`, `clear()` — pure, tested.

`useEditor` (zustand) — the live Workshop editing session:
`{ tool: 'place' | 'paint' | 'delete' | 'rotate' | 'move'; partId: string (default 'brick_2x4'); color: number (DEFAULT_COLOR); rot: Rot; category: PartCategory; lastError: PlaceError | null; carried: Brick | null (move tool); setTool, setPart, setColor, setCategory, rotateCurrent(), place(x,y,z) , tapBrick(id), undo(), redo(), canUndo, canRedo, newModel(kind, baseplate), loadBricks(bricks, kind, baseplate, editingBlueprintId?) }`. The bricks live in `useGame.data.workshop` (single source of truth); every mutating action pushes the previous bricks onto history then calls `useGame.getState().setWorkshop(...)` with the result of the Task 2 model functions. `tapBrick(id)` applies the current tool: paint → paintBrick with current color; delete → removeBrick; rotate → rotateBrick; move → remove the brick and set it as `carried` (partId/color/rot follow it); place → no-op. `place(x,y,z)` adds a brick from current part/color/rot (or the carried brick, then clears carried). Errors set `lastError` (cleared on next success).

Tests: history undo/redo/limit; useEditor place→undo→redo restores bricks; paint/delete/rotate via tapBrick; error on collision sets lastError and leaves bricks unchanged; move tool round-trip.

UI: `App.tsx` renders by `useApp.mode`: `MainMenu` (big colourful icon cards for the 4 modes + language toggle VI/EN + slot selector 1/2/3; data-testid `menu-workshop`, `menu-guided`, `menu-city`, `menu-drive`, `lang-toggle`) or a placeholder `<div>` per mode (later tasks replace them) with a `TopBar` (back button `data-testid="back"` → menu, mode title). Keep the existing Canvas only inside the workshop placeholder for now. `theme.css`: CSS variables for bright kid palette, large rounded buttons, imported in main.tsx. Expose `window.__bt = { useApp, useGame, useEditor }` when `import.meta.env.DEV`.

---

### Task 5: Workshop 3D scene

**Files:** create `src/core/pick.ts` (+ test), `src/render/materials.ts`, `src/render/InstancedBricks.tsx`, `src/render/GhostBrick.tsx`, `src/scenes/workshop/WorkshopScene.tsx`, `src/scenes/workshop/Baseplate.tsx`, `src/scenes/workshop/WorkshopUI.tsx`, `src/ui/PartPalette.tsx`, `src/ui/ColorPicker.tsx`, `src/ui/Toolbar.tsx`, `src/input/useTap.ts`; modify `src/App.tsx` (mode 'workshop' renders the scene + UI), i18n files.

`src/core/pick.ts` (pure, tested): `targetAnchor(hit: { point: [x,y,z]; normal: [x,y,z]; brick: Brick | null }, part: PartDef, r: Rot): { x: number; y: number; z: number }`.
- Hit on baseplate (brick null, normal up): cell = floor(point.x), floor(point.z), y = 0.
- Hit on a brick top face (normal.y > 0.5): y = brick.y + brick part h; cell = floor of point x/z.
- Hit on a brick side face: y = brick.y; cell = floor(point + normal*0.5) in x/z.
- Hit on bottom face: y = brick.y - part.h (may be negative → caller rejects).
- Then center the new part's rotated footprint on that cell: `x = cellX - floor((fx-1)/2)`, `z = cellZ - floor((fz-1)/2)`.
Tests for each case and for rotated footprints.

`materials.ts`: one shared `MeshStandardMaterial({ roughness: 0.35, metalness: 0 })` for opaque bricks using instance colours, one transparent glass material (opacity 0.45, depthWrite false), a ghost material (opacity 0.5, emissive pulse handled in GhostBrick).

`InstancedBricks.tsx` props `{ bricks: Brick[]; onBrickPointer?: (e, brick) => void }`: groups bricks by partId and glass vs opaque; one `<instancedMesh>` per group using `getPartGeometry`; sets matrices from `brickCenter` + rotation and `setColorAt` from COLORS; resizes when counts change; `castShadow receiveShadow`. Map `instanceId` back to the brick for pointer events.

`GhostBrick.tsx`: translucent preview of current part at an anchor; green tint when `canPlace` is null, red when invalid.

`WorkshopScene.tsx`: `<Canvas shadows dpr={[1, 1.75]}>` with sky colour, hemisphere + directional light (shadow map 1024), drei `OrbitControls` (touch: one finger rotate, two fingers dolly+pan; limit polar angle to keep camera above ground; target baseplate center), `Baseplate` (studded plate of `workshop.baseplate` size — use one instanced stud mesh + a thin box; vehicle baseplates show a "front" arrow at −Z), `InstancedBricks`, `GhostBrick`. Pointer handling via `useTap`: a tap on baseplate/brick computes `targetAnchor`; in tool 'place' (or carrying) → `useEditor.place`; a tap on a brick in other tools → `useEditor.tapBrick`. Pointer move (mouse hover, or touch drag start) updates ghost position. Drags never place bricks.

`WorkshopUI.tsx` overlay (HTML over canvas): left vertical `Toolbar` (place/paint/delete/rotate/move + undo/redo, data-testid `tool-<name>`, `undo`, `redo`); bottom `PartPalette` with category tabs (icons) and part buttons (simple SVG/CSS silhouette or the part id label rendered small — thumbnails come later in Task 8), data-testid `part-<id>`; right `ColorPicker` (16 big swatches, data-testid `color-<id>`); a rotate-current button; a "new model" button opening a picker for kind+size: vehicle 8×16, building small 16×16, building large 32×32, prop 8×8 (data-testid `new-model`). On `lastError`, briefly shake the ghost / show a small red icon — no text walls.

Performance: must stay smooth at 500 bricks on the dev machine (check with drei `<Stats />` in dev only).

Verification: `npm run dev`, open in the browser at tablet size, place/paint/delete/rotate/move/undo bricks by tapping. Add an e2e test `e2e/workshop.spec.ts` that opens the workshop via `menu-workshop`, uses `window.__bt.useEditor.getState().place(0,0,0)` to add a brick, asserts `useGame.getState().data.workshop.bricks.length === 1`, clicks `undo` and asserts 0.

---

### Task 6: Persistence (IndexedDB), save slots, export/import

**Files:** create `src/persistence/db.ts`, `src/persistence/saves.ts`, `src/persistence/autosave.ts`, `src/persistence/file.ts`, `src/ui/SlotMenu.tsx`; modify `src/main.tsx` / `src/App.tsx`, `src/ui/MainMenu.tsx`, i18n; tests `src/persistence/saves.test.ts` (add dev dependency `fake-indexeddb` and import `fake-indexeddb/auto` in the test).

- `db.ts`: Dexie database `bricktown` version 1, table `slots` with primary key `id` (1|2|3) storing `{ id, name, updatedAt, data: SaveData }`.
- `saves.ts`: `loadSlot(id): Promise<SaveData | null>` (runs `migrate`), `saveSlot(id, data): Promise<void>`, `listSlots(): Promise<Array<{ id, name, updatedAt, blueprintCount }>>`, `deleteSlot(id)`. Never throws to the UI: log and return null/false on failure.
- `autosave.ts`: `startAutosave()` subscribes to `useGame` `data` changes; debounce 2000ms then `saveSlot(useApp.slotId, data)`; also flush immediately on `visibilitychange` (hidden) and `pagehide`. Calls `navigator.storage?.persist?.()` once. Returns an unsubscribe function.
- On app start: load the current slot (`useApp.slotId`) into `useGame.setData` (or create empty), set `loaded = true`, then start autosave. Show a simple loading screen until loaded. Switching slot in the menu flushes the current slot, then loads the other.
- `file.ts`: `downloadSave(data)` — creates a Blob from `exportSave` and triggers download `bricktown-slot<N>-<yyyy-mm-dd>.json`; `pickAndImportSave(): Promise<SaveData | null>` via a hidden `<input type=file accept=".json,application/json">` + `importSave`.
- `SlotMenu.tsx` (opened from main menu settings): 3 slot cards (updatedAt, number of blueprints), select/delete (delete asks confirm with a big ✓/✗), export and import buttons (data-testid `slot-<n>`, `export-save`, `import-save`).

Tests (fake-indexeddb): save → load round-trip; listSlots; load of a corrupted record returns null; migrate is applied.

E2E `e2e/persistence.spec.ts`: open workshop, add a brick via `__bt`, wait 2.5s, reload, open workshop, assert brick count 1.

---

### Task 7: Templates core + Guided Build mode

**Files:** create `src/core/template.ts` (+ test), `src/content/templates/builder.ts`, `src/content/templates/index.ts`, five template files `src/content/templates/{tree,lamp,bench,car,house_small}.ts`, `src/scenes/guided/GuidedPicker.tsx`, `src/scenes/guided/GuidedScene.tsx`, `src/scenes/guided/GuidedUI.tsx`, `src/state/useGuided.ts`; modify `App.tsx`, i18n.

`src/core/template.ts` (pure, tested):
- `autoSteps(bricks: Brick[], maxPerStep = 4): number[][]` — sort brick indices by y, then z, then x; group consecutive bricks of the same y layer into steps of at most `maxPerStep`; a new layer always starts a new step. Every index appears exactly once.
- `matchesTarget(placed: { p, x, y, z, r, c }, target: Brick): boolean` — same part, same color, same (x,y,z), `rotEquivalent`.
- `findMatch(template, step, placedIds, candidate): Brick | null` — the first not-yet-placed brick of the current step that `matchesTarget` the candidate.
- `stepComplete(template, step, placedIds): boolean`; `nextPending(template, step, placedIds): Brick | null`.
- `templateToBlueprint(template, lang): Blueprint` (new id, name from template, `templateId` set).
- `validateTemplate(t): string[]` — returns problems: steps don't cover every brick exactly once, a brick unplaceable in step order (use `canPlace` replaying the steps in order on the template's baseplate), unknown part, color out of range.

`builder.ts`: tiny helpers to author templates in code: `const b = createBuilder()`; `b.add(partId, x, y, z, r, c)` returns the brick; `b.layer(...)`; `b.done({ id, name, difficulty, kind, tags, baseplate, steps? })` → Template (steps default `autoSteps`).

Templates (each passes `validateTemplate`; keep brick counts small for kids): `tree` (prop 8×8, ⭐, 3–6 bricks), `lamp` (prop 8×8, ⭐), `bench` (prop 8×8, ⭐, plates+bricks), `car` (vehicle 8×16, ⭐⭐: 4 `wheel_small` at y=0, chassis plates on top at y=5, body bricks, windshield `window_1x2x2` glass color 15 or slope, forward is −Z), `house_small` (building 16×16, ⭐⭐: walls, door, windows, slope roof). `index.ts` exports `TEMPLATES: Template[]` and `getTemplate(id)`. A test runs `validateTemplate` on every template and expects `[]`.

`useGuided` (zustand) wraps `useGame.data.guided`. Guided Build NEVER reads or writes `data.workshop` (the kid's free-build model must survive); the placed bricks are derived as `template.bricks.filter(b => guided.placed.includes(b.id))` (export a selector `placedBricks(template, guided)`). `start(templateId)` (guided state step 0, placed [], auto-selects part/color/rot of `nextPending` in `useEditor`), `tryPlace(candidate)` → if `findMatch` then mark that template brick placed; when step complete advance step and auto-select next; when all steps done → `templateToBlueprint` → `upsertBlueprint`, `markTemplateCompleted`, set guided null, show celebration. Wrong placement → returns false (UI shakes ghost). `placeGhost(brickId)` (easy mode: tapping a ghost places it). `prevStep()/nextStep()` only for viewing (does not remove placed bricks). Progress persists via `useGame` (resume on re-entry).

`GuidedPicker`: grid of template cards (thumbnail placeholder = coloured emoji/icon per template + stars + ✓ if completed), data-testid `tpl-<id>`. `GuidedScene`: reuses Workshop pieces (Canvas, Baseplate, InstancedBricks for placed bricks) plus pulsing translucent ghosts for the current step's pending bricks; tapping a ghost in easy mode → `placeGhost`; in normal mode taps go through `targetAnchor` + `tryPlace`. `GuidedUI`: step counter "3/8" with big arrows, a "needed" panel showing each pending brick as count × part icon in its colour, difficulty toggle (easy/normal, data-testid `difficulty`), palette restricted to the parts of the current step in normal mode. Celebration overlay with confetti (CSS) and buttons "Thêm vào thành phố" (go to city) and "Sửa tự do" (open in workshop via `useEditor.loadBricks`).

E2E `e2e/guided.spec.ts`: start `tree`, in easy mode place all pending bricks via `__bt` (expose `useGuided` on `window.__bt`), assert a blueprint with `templateId === 'tree'` exists.

---

### Task 8: Blueprint bake, thumbnails, save-as-blueprint, library

**Files:** create `src/core/bake.ts` (+ test), `src/render/thumbnails.ts`, `src/ui/BlueprintLibrary.tsx`, `src/ui/SaveBlueprintDialog.tsx`; modify `WorkshopUI.tsx`, `GuidedPicker.tsx` (real thumbnails), `PartPalette.tsx` (part thumbnails), i18n.

- `bake.ts`: `bakeBricks(bricks: Brick[]): THREE.BufferGeometry` — clone each part geometry, apply the brick transform (center + rotation), add a `color` attribute from COLORS (linear colour space: `new THREE.Color(hex)`), merge into one geometry; glass bricks go into a second geometry: return `{ opaque: BufferGeometry; glass: BufferGeometry | null }`. Cache by a content hash string of the bricks (`p,x,y,z,r,c` joined). Tests: vertex count = sum of parts; bounding box matches `bounds()` (converted to world units, ignoring studs on top); cache hit returns same object.
- `thumbnails.ts`: one lazily created offscreen `WebGLRenderer` (256×256, preserveDrawingBuffer, alpha); `getThumbnail(key: string, bricks: Brick[]): Promise<string>` renders the baked model with a fixed 3/4 isometric camera fit to the bounding box, returns a PNG data URL, memoised by key; `getPartThumbnail(partId, color)`. Must not throw if WebGL unavailable (return '' and UI falls back to an icon). Dispose geometries it creates.
- Workshop: "Lưu" button (data-testid `save-blueprint`) → dialog with name field (prefilled e.g. "Nhà của bé 1"), kind shown as icon → `upsertBlueprint` (updates if `editingBlueprintId`). After saving editing an existing blueprint, all its city placements automatically use the new bricks (they reference by id).
- `BlueprintLibrary`: grid of the user's blueprints with thumbnails; actions open-in-workshop, delete (confirm), used by Workshop ("Mở") and City (Task 10).

---

### Task 9: City core (roads auto-tile, placement)

**Files:** create `src/core/city.ts`, `src/core/roads.ts` (+ tests).

- `export const CELL = 8` (studs per city cell).
- `roads.ts`: `roadKey(cx, cz)`, `type RoadTile = 'isolated' | 'end' | 'straight' | 'corner' | 'tee' | 'cross'`; `roadTileAt(roads: Set<string>, cx, cz): { tile: RoadTile; rot: Rot }` from neighbours N(−Z) E(+X) S(+Z) W(−X). Conventions at rot 0: `end` connects N only; `straight` connects N+S; `corner` connects N+E; `tee` connects N+E+S (missing W); rot rotates counter-clockwise like bricks (so rot 1 maps N→W). `paintRoadLine(roads, from, to): string[]` — cells on an L-shaped path (first along X then Z), returns new road list (deduped).
- `city.ts`: `footprintCells(baseplate: Baseplate, rot: Rot): { cw, cd }` = ceil(w/CELL), ceil(d/CELL), swapped for odd rot. `canPlaceInCity(city, placement, sizeOf: (source) => Baseplate, ignoreId?): 'out_of_bounds' | 'overlap' | 'road' | null` — inside `[0,size)`, no overlap with other placements, not on road cells. `addPlacement`, `removePlacement`, `rotatePlacement` (validated), `movePlacement`, pure/immutable. `addRoads(city, keys)` rejects cells covered by placements.
- Tests: every neighbour combination maps to the right tile+rot (16 cases); L-path; footprint rounding (16×16 → 2×2, 8×16 rot1 → 2×1); overlap/out-of-bounds/road rejections; immutability.

---

### Task 10: City scene

**Files:** create `src/scenes/city/CityScene.tsx`, `src/scenes/city/CityGround.tsx`, `src/scenes/city/Roads.tsx`, `src/scenes/city/Placements.tsx`, `src/scenes/city/CityUI.tsx`, `src/state/useCityEditor.ts`, `src/render/sources.ts`; modify `App.tsx`, i18n.

- `sources.ts`: `resolveSource(source: string, data: SaveData): { name: string; kind; baseplate; bricks } | null` — `tpl:<id>` → template (ready-made), otherwise a blueprint by id.
- `useCityEditor`: `{ tool: 'road' | 'place' | 'erase' | 'rotate'; selectedSource: string | null; ... }` mutating `useGame.data.city` through Task 9 functions, with undo via `createHistory`.
- Scene: `<Canvas shadows dpr={[1, 1.5]}>` top-down-ish camera with drei `MapControls` (one-finger pan, pinch zoom, two-finger rotate), green ground plane of `size*CELL` studs, subtle grid lines, `Roads` rendering each road cell as a flat dark-gray tile (one InstancedMesh per tile type built from simple boxes: asphalt + white dashed markings according to `roadTileAt`), `Placements` rendering each placement with the baked geometry (`bakeBricks`) positioned at `cx*CELL, cz*CELL` with rotation around its footprint center — use one `InstancedMesh` per source so repeated buildings are one draw call.
- Interaction: road tool — drag across cells paints roads (`paintRoadLine` from drag start to current cell, preview while dragging); place tool — tap a cell places `selectedSource` with ghost preview (green/red by `canPlaceInCity`); erase — tap road or placement removes it; rotate — tap placement rotates it.
- `CityUI`: tools (data-testid `city-tool-<name>`), undo, bottom drawer "Kho" listing all templates (ready-made, with thumbnails, data-testid `src-tpl-<id>`) then the user's blueprints (`src-<id>`); selecting a source switches to place tool; tapping an existing placement whose source is a blueprint shows an "edit" button (opens it in Workshop via `useEditor.loadBricks` with `editingBlueprintId`). A "Lái xe" button opens drive mode.
- Perf: 48×48 city with 150 placements must stay smooth; build road instance matrices only when roads change.

E2E `e2e/city.spec.ts`: open city, add roads and a `tpl:house_small` placement via `__bt`, reload, assert they persist.

---

### Task 11: Remaining starter templates

**Files:** create in `src/content/templates/`: `bush_flowers.ts` (prop ⭐), `house_blue.ts` (building 16×16 ⭐⭐), `house_tall.ts` (building 16×16 ⭐⭐⭐, two floors), `restaurant.ts` (building 32×32 ⭐⭐⭐: walls, big windows, door, sign, inside tables + chairs + counter + stove + fridge, tags ['restaurant']), `garage.ts` (building 32×32 ⭐⭐⭐, wide opening, tags ['garage']), `fire_station.ts` (building 32×32 ⭐⭐⭐, red, tags ['fire_station']), `police_station.ts` (building 32×32 ⭐⭐⭐, blue/white, tags ['police']), `police_car.ts` (vehicle 8×16 ⭐⭐, tags ['police']), `fire_truck.ts` (vehicle 8×16 ⭐⭐⭐, tags ['fire']), `truck.ts` (vehicle 8×16 ⭐⭐, wheel_large). Register all in `index.ts`, sorted by difficulty then name. Use builder loops (walls via helper `b.wall(...)` you may add to builder.ts) to keep files short. Every template passes `validateTemplate`; buildings ≤ 220 bricks, vehicles ≤ 60. Steps: use `autoSteps` but for buildings override so furniture goes in an early step (after the floor) — kids see the inside before walls block it.

Verification: the template validation test covers all; open each template in Guided mode in the browser and visually check it looks like what its name says (screenshot each and fix ugly ones).

---

### Task 12: Vehicle core

**Files:** create `src/core/vehicle.ts` (+ test).

`analyzeVehicle(bricks: Brick[]): { ok: true; config: VehicleConfig } | { ok: false; reason: 'no_wheels' | 'one_axle' }` where
```ts
interface VehicleConfig {
  chassis: { halfExtents: [number, number, number]; center: [number, number, number] } // world units, from bounds() of non-wheel bricks (fallback all)
  wheels: Array<{ position: [number, number, number]; radius: number; steer: boolean; width: number }>
  mass: number // 0.2 per brick, min 2
  origin: [number, number, number] // model-space point used as rigid body origin (center of bounds at ground level)
}
```
Wheel bricks = parts with tag 'wheel'. Wheel position = brick center (relative to `origin`), radius = platesToWorld(h)/2, width = footprint along X. Need ≥ 2 wheels at ≥ 2 distinct Z positions (front/back), else `one_axle`. Front = smallest Z (forward is −Z); wheels whose Z is within 0.5 of the minimum steer. Tests: the `car` template → 4 wheels, 2 steer; a model with wheels in one row → one_axle; no wheels → no_wheels; mass/extents sane.

---

### Task 13: Drive mode

**Files:** create `src/scenes/drive/DriveScene.tsx`, `src/scenes/drive/Vehicle.tsx`, `src/scenes/drive/CityColliders.tsx`, `src/scenes/drive/DriveUI.tsx`, `src/input/VirtualJoystick.tsx`, `src/state/useDriveInput.ts`, `src/scenes/drive/VehiclePicker.tsx`; modify `App.tsx` (lazy-load DriveScene with `React.lazy` so Rapier WASM loads only here), i18n.

- `VehiclePicker`: lists vehicle templates + user vehicle blueprints with thumbnails; blueprints failing `analyzeVehicle` show a hint icon (needs wheels) and are disabled; data-testid `veh-<source>`.
- `DriveScene`: `<Canvas shadows dpr={[1, 1.5]}>` + `<Physics>` from @react-three/rapier (fixed timestep 1/60). Renders the city visuals (reuse `CityGround`, `Roads`, `Placements` from Task 10) plus `CityColliders`: fixed cuboid collider per placement (footprint × baked bbox height) and a large ground cuboid. Spawn the vehicle on the first road cell if any (else city center), facing −Z.
- `Vehicle.tsx`: RigidBody (dynamic, `ccd`) with a cuboid collider from `config.chassis`, mass via `additionalMass`/density; visual = baked mesh offset by `-origin`. Use Rapier's `DynamicRayCastVehicleController` (`world.createVehicleController(rigidBody)` via `useRapier()`), add wheels from `config.wheels` (suspension rest length 0.3, stiffness 30, friction slip 1.5, axle +X... direction −Y). Each frame: engine force from throttle (max 30×mass, reverse 50%), brake, steering angle ±0.5 rad on steer wheels with smoothing, speed clamp ~ 15 units/s, `updateVehicle(dt)`. Lower the centre of mass (set via `setAdditionalMassProperties` or by offsetting the collider) to reduce flipping. "Flip" action resets rotation upright and lifts 1 unit.
- Chase camera: smooth follow behind and above the vehicle (lerp), looking ahead.
- Input: `useDriveInput` `{ steer: -1..1; throttle: -1..1; brake: boolean; horn }` fed by `VirtualJoystick` (left thumb, horizontal axis = steer) and big right buttons ga (accelerate) / lùi (reverse) / flip / horn, plus keyboard arrows/WASD/space on desktop. data-testid `drive-gas`, `drive-reverse`, `drive-flip`, `drive-horn`.
- Horn: short WebAudio beep (no audio files).

Verification: in the browser at tablet size, drive the `car` template around a small road loop; buildings block the car; flip works. E2E `e2e/drive.spec.ts`: open drive, pick `veh-tpl:car`, hold `drive-gas` 1s, assert no page errors and the canvas is present.

---

### Task 14: Polish, audio, onboarding, PWA, perf

**Files:** create `src/audio/sfx.ts`, `src/ui/Onboarding.tsx`, PNG icons `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` (generate from `public/icon.svg` with a small Node script using `sharp` as a dev dependency, script `scripts/icons.mjs`); modify `vite.config.ts` (manifest icons incl. maskable, `index.html` apple-touch-icon link), `App.tsx` (lazy-load each scene), i18n, `src/ui/MainMenu.tsx`.

- `sfx.ts`: WebAudio synthesized sounds (no files): `snap()` on place, `pop()` on delete, `paint()`, `error()`, `success()` on step/template complete, `horn()`; a mute toggle persisted in `useApp`. AudioContext created/resumed on first user gesture (iOS).
- Onboarding: first launch only (flag in localStorage, guarded): 3 picture cards (tap to place, drag to look around, pinch to zoom) using simple CSS/SVG illustrations; skippable.
- Code-split: `React.lazy` for workshop/guided/city/drive scenes so the main chunk is smaller; Vite `build.chunkSizeWarningLimit` only if three still exceeds after splitting.
- Storage hint: if not running as installed PWA (`display-mode: standalone` false) on iOS, show a dismissible tip to "Thêm vào màn hình chính" and to export backups.
- Full e2e `e2e/flow.spec.ts`: menu → guided tree (easy, via __bt) → city place the new blueprint → drive car → reload → data persists. Run all e2e tests.
- `npm run build && npm run preview`: verify service worker precache includes the WASM and that the app loads offline (Playwright `context.setOffline(true)` after first load, reload, canvas visible).
