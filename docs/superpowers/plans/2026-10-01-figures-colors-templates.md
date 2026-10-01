# BrickTown — Figures, Colours, Printed Tiles, New Templates (Plan)

Builds on Phase 1 (`docs/superpowers/plans/2026-10-01-bricktown-phase1.md`; its Global Constraints still bind) and the expandable baseplate.

## User decisions (2026-10-01)

- Minifigures: ready-made presets **and** customisation (torso/legs colour, hat/hair, face, torso print). Placed on studs like a brick, rotatable. Not walking NPCs (that is Phase 2).
- Colours: more brick colours (transparent red/blue/yellow/green like the siren lights in the user's photo, metallic silver/gold, more solids), **baseplate colours** (gray like the photo, green, blue, tan, white), **printed tiles** (signs, clock, police/fire logo, menu board, computer screen, robot eyes…).
- New guided templates: **tall building**, **rocket + launch pad**, **robot**, **police station with figures** (desk, jail cell, siren lights, police + robber, like the photo), **restaurant with figures** (chef + customers).

## Global Constraints (additions)

- Save compatibility: colour indices 0–15 keep their meaning; new colours are APPENDED. New optional fields only (`Brick.fig`, `Baseplate.c`). Bump `SCHEMA_VERSION` to 2 with a migration that fills defaults; v1 saves must load unchanged.
- Every new visual must render identically in: Workshop (InstancedBricks), Guided, thumbnails, City (bake), Drive (bake). Shared caches are never disposed by consumers.
- Kid-first UI: icons, ≥64px targets, no text walls; i18n vi + en for all labels/aria.
- Performance: a restaurant with 10 figures must stay smooth on tablets — figures are instanced by style key, not one mesh per figure with unique materials.
- Commands that must pass before each commit: `npm test`, `npx tsc -b`, `npm run lint`; before each task completes also `npm run build`, `npx playwright test`.

---

### Task 1: Colours + baseplate colour + schema v2

**Files:** `src/core/colors.ts`, `src/core/types.ts`, `src/core/serialize.ts` (+tests), `src/render/materials.ts`, `src/render/InstancedBricks.tsx`, `src/core/bake.ts`, baked materials users (city/drive), `src/ui/ColorPicker.tsx`, `src/scenes/workshop/{Baseplate,WorkshopUI}.tsx`, i18n, theme.css.

- `BrickColor` gains `trans?: true` (replaces/aliases `glass`) and `metal?: true`. Keep id 15 glass as trans clear. Append (ids 16+), exact hexes:
  16 trans-red `#C91A09` trans, 17 trans-blue `#0055BF` trans, 18 trans-yellow `#F5CD2F` trans, 19 trans-green `#237841` trans, 20 trans-orange `#F08F1C` trans, 21 dark blue `#0A3463`, 22 dark red `#720E0F`, 23 medium blue `#5A93DB`, 24 light bluish gray `#C8C8C8`, 25 dark tan `#958A73`, 26 sand green `#A0BCAC`, 27 lavender `#E1D5ED`, 28 silver `#A5A9B4` metal, 29 gold `#DBAC34` metal. vi/en names.
- Rendering: transparent colours render tinted with the transparent material (instance colour × opacity ~0.55, depthWrite false), metallic colours with a metal material (metalness ~0.7, roughness ~0.3). Group per (part, material kind). Bake returns an extra geometry group per material kind as needed (`opaque`, `trans`, `metal`) — update all bake consumers.
- ColorPicker: 30 swatches in a scrollable 2-column panel (still ≥ 56px swatches), trans swatches show a checker/shine, metal a gradient.
- Baseplate colour: `Baseplate.c?: number` (default green id 5). A baseplate-colour button in the Workshop (icon 🟩 with current colour) opens 5 choices: gray (24 light bluish gray), green (5), blue (3), tan (10), white (0). Undoable (part of editor history). Saved with workshop and blueprints. Guided uses template baseplate colour (default green). City/Drive do not render baseplates (unchanged).
- `SCHEMA_VERSION = 2`; migration 1→2 adds nothing destructive (fields optional) but normalises `glass`→`trans` if stored; tests: v1 save loads; round trip v2.

### Task 2: New parts + printed tiles

**Files:** `src/core/parts/catalog.ts`, `src/core/parts/geometry.ts` (+tests), print rendering module(s) in `src/render/`, bake/thumbnail/instanced paths, PartPalette (new category `decor` with icon 🖼️), i18n.

- New geometry parts: `cone_2x2` (nose cone, h 6, round), `dish_2x2` (radar dish, h 2), `antenna_1x1` (thin rod + ball, h 6), `bars_1x4x3` (jail bars: frame + vertical bars, h 9, door_window category), `steering_1x2` (steering wheel on post, h 3, furniture), `computer_1x2` (monitor + keyboard, h 4, furniture), `bed_2x4` (h 3, furniture), `flag_1x2` (pole + flag, h 9, decor), `fin_1x3` (rocket fin, slope-like wedge, h 6), `engine_2x2` (rocket nozzle cone, h 3).
- Printed tiles (category `decor`, shape `tile_print`, studs false, h 1): `print_police_2x2`, `print_fire_2x2`, `print_clock_2x2`, `print_stop_2x2`, `print_arrow_2x2`, `print_menu_1x2`, `print_screen_1x2`, `print_eyes_1x2` (robot eyes), `print_heart_1x1`, `print_star_1x1`, `print_number_1x2` (e.g. "112"). The tile body takes the brick colour; the print has its own fixed colours.
- Print rendering: choose ONE approach that works in every render path (instanced, thumbnails, bake): e.g. a procedural canvas texture atlas (drawn at startup with Canvas2D; one atlas, one textured material, UVs on the top face per print) with a dedicated instanced group and a dedicated bake group, OR print geometry built from small coloured shapes with per-vertex colours in a vertex-coloured group that ignores instance colour. Document the choice in the report. Prints must be readable at tablet zoom.
- Tests: every new part builds geometry within its footprint; prints produce the expected group; bake includes print groups; validate catalog ids unique.

### Task 3: Minifigures (presets + customisation)

**Files:** `src/core/types.ts` (`Brick.fig?: FigStyle`), `src/core/figures.ts` (+test: presets, style key, validation), geometry for figures (`src/core/parts/figureGeometry.ts` + test), catalog part `minifig` (category `figure`, footprint w2 d1, h 12 plates, studs false — top of head has 1 stud-like nub only visually), InstancedBricks + bake + thumbnails support, `src/ui/FigureEditor.tsx`, PartPalette `figure` category (icon 🧑), editor integration, guided matching, i18n.

- `FigStyle = { torso: number; legs: number; arms?: number; face: 'smile'|'grin'|'wink'|'surprised'|'beard'|'glasses'; hat: 'none'|'hair_short'|'hair_long'|'hair_ponytail'|'cap'|'police'|'chef'|'fire'|'construction'|'space'|'crown'|'robber_cap'; hatColor?: number; print: 'plain'|'police'|'chef'|'fire'|'space'|'vest'|'stripes'|'suit'|'apron'; accessory?: 'none'|'tool'|'pan'|'radio'|'flashlight' }`. Colours are colour ids. Skin is classic yellow `#F2CD37`-ish (fixed).
- Presets (id → style + vi/en name): police officer, police chief, robber (stripes), chef, waiter, customer (2 variants), firefighter, astronaut, construction worker, doctor, kid. Exported list.
- Geometry: blocky low-poly minifig (legs/hips/torso trapezoid/arms/hands/head cylinder/hat variants/face print) built per style with per-vertex colours; cached by style key; faces/prints can use the Task 2 print approach. Instanced by style key (vertex-coloured material, instance colour unused/white).
- Placement: like any part (support rule, collision with its voxels, rotation 4-way). Figures can stand on plates/bricks and sit at height; bricks may be placed on top of the head.
- Workshop UX: `figure` category shows preset thumbnails; a ✏️ button opens FigureEditor for the CURRENT style (big swatches for torso/legs, icon rows for hat/face/print/accessory, live 3D-ish preview via thumbnail) before placing; in paint tool, tapping a placed figure opens FigureEditor for that figure (undoable). Paint with a plain colour on a figure recolours the torso.
- Guided: template bricks may carry `fig`; `matchesTarget` for figures compares part + position + rotation and ignores style (the placed brick takes the template's style); normal mode auto-selects the template figure's style.
- Bake/thumbnails/city/drive include figures (vehicle templates may have a driver).
- Tests: style key stability, presets valid, geometry within footprint, guided match rule, editor undo for style edits, serialization round trip with fig.

### Task 4: New templates + figure-filled templates

**Files:** `src/content/templates/{skyscraper,rocket,robot,police_hq}.ts`, updates to `restaurant.ts` (+ figures) and `police_station.ts` (+ figures, or keep it and add `police_hq` modelled on the user's photo), `index.ts`, template tests.

- Raise `MAX_HEIGHT_PLATES` to 144 (48 bricks) for tall builds (check camera framing and guided step camera for tall models).
- `skyscraper` (building 16×16 or 24×24, ⭐⭐⭐, ~8 floors, glass windows trans-blue, lobby door, rooftop antenna + flag, ≤ 400 bricks).
- `rocket` (prop or vehicle-less "building" 16×16, ⭐⭐⭐: launch pad gray with tower, rocket white/red with `cone_2x2` nose, `fin_1x3` fins, `engine_2x2`, printed flag/star tile, astronaut figure on the gantry, ≤ 250 bricks).
- `robot` (prop 8×8 or 16×16, ⭐⭐: legs, body, arms, head with `print_eyes_1x2`, `antenna_1x1`, trans-red chest lights, ≤ 120 bricks).
- `police_hq` (building 32×24 on a **gray** baseplate, ⭐⭐⭐, modelled on the user's photo: front windows/doors, white/blue walls, desk with `computer_1x2`, jail cell with `bars_1x4x3` and `bed_2x4`, trans-red/blue siren lights (round_1x1), `print_police_2x2` sign, figures: 2–3 police officers + robber in the cell, ≤ 300 bricks).
- `restaurant`: add chef (in kitchen), waiter, 2–3 customers at tables, `print_menu_1x2` board.
- Steps: furniture + figures early as already required (no intra-step support; ≤ 6 per step).
- Visual check: render each new template in Guided mode at iPad landscape and look at it; fix anything that doesn't read as its name.

---

## Execution

Sequential (shared render pipeline): Task 1 → Task 2 → Task 3 → Task 4, each implementer + task review (+ fix loop), then one final review of the whole batch, merge to `main`.
