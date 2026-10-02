# BrickTown — Living City: sample city, terrain, rails, NPC traffic (Plan)

Goal: a ready-made miniature city that looks like a real town, plus ambient life. The city has:
- roads, shops, a sushi restaurant, police and fire stations, tall buildings;
- a train on a loop line, trees, a park and a lake;
- cars, a train and pedestrians moving in loops.

User decisions (2026-10-02):
- **Sample city**: new players start with it. Anyone can reload it with "🏙️ Thành phố mẫu", after confirming that it replaces their current city. It is fully editable like the kid's own city.
- **Lake**: implement the Hanoi plan's H1 terrain now. Painting tools: 💧 water, ⬜ pavement, 🟨 sand, 🟩 grass. Rules for water are below.
- **Train**: a 🛤️ rail painting tool, used like roads. A rail crossing a road becomes a level crossing. Trains run along the rails automatically.
- **NPCs**: in the City screen only, not in Drive. Cars and the train; pedestrians as well.
- Testing policy: light. Unit tests for core logic, plus one happy-path e2e per flow. Keep the tests that protect saved data and untrusted share imports.

The Phase 1 Global Constraints still bind:
- the core is pure TypeScript;
- the UI is kid-first and touch-friendly (tokens `--bt-s` / `--bt-touch`);
- all text is translated to vi and en;
- consumers never dispose shared caches;
- rendering goes through brickGeometry and bake, with shared geometry and instancing.

New optional save fields are normalised on load and need no schema bump, as long as `normalize` repairs them. The share codec carries them, backward compatible, and validates them as untrusted data.

---

### Task L1: City layers — terrain and rails

**Terrain** (from the H1 plan):
- **Data**: `CityState.terrain?: { water: string[]; pavement: string[]; sand: string[] }`, keyed by "cx,cz". Grass is the default.
- **Tool**: a City tool `terrain` with the sub-palette 💧 / ⬜ / 🟨 / 🟩. Erasing paints grass. Painting works by dragging, like roads. Undo uses the city history.
- **Rules**:
  - Roads and rails cannot be painted on water.
  - Placements cannot overlap water, unless their blueprint or template has the tag `water` (bridge, island, boat).
  - `water` placements may sit only on water, or straddle water and land.
  - Pavement and sand accept everything.
- **Rendering**:
  - one InstancedMesh per terrain type: flat plates with a studs texture;
  - water is a translucent blue plate set slightly lower, with a cheap shared animated shimmer (one material, created once).

**Rails**:
- **Data**: `CityState.rails?: string[]` ("cx,cz").
- **Tool**: `rail` 🛤️. It paints and erases like roads, and auto-tiles from 4-neighbours (straight, curve, T, cross, end).
- **Level crossings**: a cell with both a road and a rail is a level crossing, rendered with road and rails plus crossing stripes. It is allowed only where the road and the rail are perpendicular straights; otherwise refuse with the usual feedback.
- **Placements**: they cannot overlap rail cells.
- **Rendering**: instanced ballast, sleepers and two steel rails per tile type.

**Shared**:
- Drive: water cells are blocked (static colliders); rails are drivable.
- Share: the city package gets optional terrain and rails, validated (in range, no water under roads or rails, counts ≤ size²) and backward compatible.
- Scale (`Placement.s`) rules apply with water and rails too.
- Tests: core terrain and rail ops plus the placement rules. One e2e: paint a lake and a rail loop, reload, and both persist.

### Task L2: New templates for a real town

Templates are Guided-buildable and pass the existing template tests (≤ 6 per step, figures and furniture early, no intra-step support). Add prints or parts only when needed, through the existing print atlas and brickGeometry.

- `sushi_restaurant` (building 16×16): a conveyor-belt counter, a sushi chef, customers, a "SUSHI" print sign and fish print tiles, a red/black/white palette.
- Shops (building 16×16): `bakery`, `toy_shop`, `grocery`, each with an awning or sign print and a shopkeeper figure.
- `apartment` (tall residential, 16×16, ≈ 6 floors, balconies) and `office_tower` (glass tower, 16×16, varied from `skyscraper`).
- **Park pieces** (props 8×8): `fountain`, `playground` (slide and swing), `flower_bed`, `pine_tree`, `round_tree`.
- **Train** (vehicle kind, ≤ 6 studs wide, fits a rail cell of 8 studs): `train_engine` and `train_carriage`, with windows and wheels on the rails. Tag both `train`. The drive picker excludes `train`-tagged vehicles.
- **NPC vehicles**: `bus` and `taxi` (vehicle 8×16 or less, drivable like the other vehicles).
- Visual check: a Guided screenshot of each finished template. Each must read as its name.

### Task L3: NPC life in the City (ambient, City screen only)

One simulation module in pure TS (`src/core/npc/*`), which is testable. It drives one render component that uses a single `useFrame`, shared baked geometry and instancing, and has no physics.

- **Cars**:
  - **Spawn**: about 1 car per 6 road cells, at most 14. Models are picked from car, taxi, bus, police_car, fire_truck and truck.
  - **Lanes**: cars drive on the right lane of the road graph and turn randomly at intersections, with a U-turn at dead ends.
  - **Spacing**: a car keeps its distance to the car ahead. It yields at intersections with a simple rule.
  - **Level crossings**: a car stops while a train is near the crossing.
- **Train**:
  - It follows the rail graph: an engine plus 2 carriages, spaced along the path.
  - On a closed loop it circles. On an open line it shuttles back and forth.
  - With several rail components, there is one train per component of ≥ 8 cells, at most 3 trains.
- **Pedestrians**:
  - **Spawn**: minifigs (preset styles), about 1 per 4 pavement cells, at most 20.
  - **Walking**: they walk on pavement cells and on the outer edges of road cells (sidewalks), never into water. They wander randomly, and use park and plaza pavement.
  - **Animation**: a simple bob and leg swing, cheap.
- **Controls**:
  - A 🚦 toggle in the City HUD (`city-npc-toggle`), on by default and persisted in `useApp` prefs.
  - Reduced motion → NPCs are static or off.
  - NPCs never intercept taps or drags. They are not pickable and are ignored by the gesture raycast.
  - They pause while the app is hidden, and rebuild their graphs when roads, rails or terrain change.
- **Performance**: smooth on tablets with the sample city, measured with DevStats.
- Tests: unit tests for the graph building, lane following, the stop at a crossing when a train is near, and shuttle versus loop. One e2e: the City shows NPCs when on and none when off.

### Task L4: Sample city + default for new players

- `src/content/cities/sample.ts`: a hand-authored `CityState` plus the template references it uses. It must look like a real miniature town:
  - a road grid with blocks;
  - a downtown with tall buildings (some scaled ×2 to ×3);
  - a shopping street with the sushi restaurant, bakery, toy shop and grocery;
  - the police and fire stations;
  - homes and apartments;
  - a park with a fountain, a playground, trees and flower beds on pavement;
  - a lake with a bridge or island where available;
  - a rail loop around the city with level crossings;
  - trees along the streets.
- New saves (fresh install or a new slot) start with a deep copy of the sample city (ids regenerated). Existing saves are untouched.
- A "🏙️ Thành phố mẫu" button in the City HUD (`city-load-sample`) opens a confirm dialog and replaces the city. The undo history resets through the `onCityReplaced` registry.
- Tests:
  - unit: the sample city is valid (every placement `canPlaceInCity`, roads and rails not on water, the template references exist);
  - e2e: a fresh profile opens the City and sees the sample city with NPCs;
  - e2e: the load button replaces an edited city after confirm.
- Screenshots: City overview at 1080×810 and 412×891. It must read as a real town.

## Execution

- L1 (layers) and L2 (templates) run in parallel worktrees.
- L3 (NPCs) starts after L1 is merged.
- L4 (sample city) starts after L2 and L3.
- Each task: implementer, then review (and a fix loop); then a final review of the whole feature; then merge to main and push.
