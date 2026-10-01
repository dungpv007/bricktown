# BrickTown — "Thành phố Hà Nội" pack (Plan)

Goal: let kids build a LEGO city like the user's reference image: Hoàn Kiếm lake with Tháp Rùa, red Thê Húc bridge and Ngọc Sơn temple, willow trees, rows of tube houses and shops (Phở, Bún), a colonial clock-tower building, a construction site with a crane and workers on a tan plate, roads, and a sky with LEGO clouds, a helicopter and kites.

User decisions (2026-10-02): include **terrain**, **Hanoi parts & templates**, **sky decorations**. Not now: living city (moving cars/pedestrians — Phase 2).
Testing policy (user, 2026-10-02): light — unit tests for core logic + one happy-path e2e per flow; keep data-safety tests.

Phase 1 Global Constraints still bind (pure-TS core, kid-first touch UI ≥64px, i18n vi+en, shared caches never disposed by consumers, render through brickGeometry dispatch, bake path for City/Drive).

---

### Task H1: City terrain painting (water, pavement, sand, grass) + bridges rule

- Data: `CityState.terrain?: { water: string[]; pavement: string[]; sand: string[] }` ("cx,cz" keys; grass = default). Additive optional field normalised on load; schema bump to 4 with migration filling `{water:[],pavement:[],sand:[]}` (coordinate: the maze branch is v3).
- City tool `terrain` with sub-palette 💧 water / ⬜ pavement / 🟨 sand / 🟩 grass (erase to grass); drag painting like roads; undo via existing city history.
- Rules: roads cannot be painted on water; placements cannot overlap water unless the source blueprint/template has tag `water` (bridges, islands, boats) — those may ONLY sit on water or straddle water/land; pavement and sand accept everything.
- Rendering: one InstancedMesh per terrain type (flat plates with studs texture like the maze floor); water = translucent blue plate with a cheap animated shimmer (e.g. scrolling UV/sin vertex colour in a tiny shader material, created once and shared) and a slightly lower height; edges look fine without blending.
- Drive: water cells are blocked (static colliders at the water edge or per-cell), pavement/sand drivable.
- Share: extend the share codec's city package with optional terrain (backward compatible: absent = grass) and validate it (counts ≤ size², keys in range, no overlap between types).
- Tests: core terrain ops + placement rules; one e2e: paint a lake, place a `water` template on it, reload persists.

### Task H2: New parts for the Hanoi pack

Add to the catalog (through brickGeometry dispatch; bake + thumbnails work; palette categories):
- `willow_2x2` (nature, h 12): trunk + drooping willow canopy (strands hanging down, low-poly).
- `roof_curve_2x4` (slope, h 3): red curved temple roof tile with upturned eave; `roof_corner_2x2` (h 3) upturned corner eave.
- `column_1x1` (round, h 9): tall round column (colonial/temple pillars).
- `awning_1x4` (decor, h 3): shop awning sloping outward with colour stripes (stripe = brick colour + white).
- `arch_1x6` (door_window, h 6): arch brick; `bridge_arch_2x8` (decor, h 6): red arched bridge segment with railings (for Thê Húc).
- `crane_mast_2x2` (h 9, lattice), `crane_jib_1x8` (h 3, lattice arm), `crane_hook_1x1` (h 3).
- `cloud_4x2` (nature, h 3, white puffy, studs false), `rotor_1x8` (h 1, helicopter rotor), `kite_2x2` (decor, h 1, diamond with tail).
- Printed tiles: `print_pho_1x2` ("PHỞ"), `print_bun_1x2` ("BÚN"), `print_cafe_1x2` (cup icon), `print_flag_vn_1x2` (red flag with yellow star), `print_clock_2x2` already exists (reuse), `print_turtle_2x2` (turtle icon).
- Geometry within footprint; one test that all new parts build and fit; palette shows them.

### Task H3: Hanoi templates

Templates (Guided build steps like the others; furniture/figures early; ≤6 per step; no intra-step support):
- `thap_rua` (prop 16×16, baseplate colour 3 blue "water", ⭐⭐⭐): small island (green/tan plates), 3-tier tower with arches and a red curved roof top; tag `water`.
- `cau_the_huc` (prop 8×24, baseplate blue, ⭐⭐): red arched bridge from `bridge_arch_2x8` segments with railings, a small gate at one end; tag `water`.
- `den_ngoc_son` (building 24×16, ⭐⭐⭐): temple on a stone base, red columns, curved red roofs with corner eaves, lanterns, a figure.
- `buu_dien` (building 24×24, ⭐⭐⭐): colonial yellow building with white columns, triangular pediment, clock tower with `print_clock_2x2`, flag.
- `quan_pho` (building 16×16, ⭐⭐): shop with `awning_1x4`, `print_pho_1x2` sign, tables/chairs/stove, chef + customers.
- `nha_pho` (building 8×16, ⭐⭐): narrow 3-floor tube house with balcony and rooftop plant; a second colour variant `nha_pho_2`.
- `cong_truong` (building 24×24, baseplate tan 10, ⭐⭐⭐): construction site with half-built walls, a crane (mast+jib+hook lifting a brick), workers (construction figures), a digger vehicle-like prop, safety fences, a blueprint board.
- `cay_lieu` (prop 8×8, ⭐): willow tree on grass.
- `truc_thang` (vehicle 8×16 or prop, ⭐⭐): helicopter with `rotor_1x8`, glass cockpit (not drivable — tag `sky`; exclude from drive picker).
- `dieu` (prop 8×8, ⭐): kite; `may` (prop 8×8, ⭐): LEGO cloud from `cloud_4x2` pieces. Tag both `sky`.
- Visual check: Guided screenshots of each finished template (iPad landscape) — must read as their names.

### Task H4: Sky decorations in City

- An ambient layer in the City scene (and optionally Drive): 3–6 LEGO clouds drifting slowly, one helicopter circling with spinning rotor, 1–2 kites bobbing on a string near the lake; uses the baked models of the `sky` templates (`may`, `truc_thang`, `dieu`).
- A 🌤️ toggle in City HUD (on by default) persisted in useApp prefs; reduced-motion users get static decorations.
- Cheap: no physics, no shadows from sky objects (or tiny), shared baked geometry, animation in one useFrame.
- One e2e: City shows sky decor when on, none when toggled off.

## Execution

H1 (terrain) and H2 (parts) in parallel worktrees → H3 (templates, needs H2) → H4 (sky, needs H3's sky templates). Each: implementer + review (+ fix loop); final review; merge to main.
