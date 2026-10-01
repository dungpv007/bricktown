# BrickTown — Game 3D LEGO-style chạy trên web (Plan)

## Context

User muốn game web 3D kiểu LEGO: dựng thành phố, nhà hàng, lắp ráp xe. Chơi local, lưu trạng thái. Thư mục `/Users/libra/Documents/Claude/Projects/games/lego` trống → greenfield.

**Đã chốt với user:**
- Phase 1 = sandbox thuần. Phase 2 = NPC, tiền, nhà hàng có khách, gara sửa xe, trạm cứu hỏa, cảnh sát + nhiệm vụ đơn giản.
- Xe lắp xong **lái được**, physics đơn giản (raycast vehicle).
- Build **2 tầng**: Workshop (từng viên brick) → lưu Blueprint → đặt Blueprint lên bản đồ City.
- Target: **trẻ em, tablet/mobile cảm ứng** (desktop chuột vẫn chạy, không ưu tiên).
- Stack: **Vite + TypeScript + React + React Three Fiber + drei + @react-three/rapier + Zustand**.
- Brick: **tự sinh ~40 loại procedural** (không dùng LDraw).
- UI **Việt + Anh**, mặc định Việt, chủ yếu icon.
- **PWA offline + IndexedDB**, export/import file `.json` backup.

**Bài học từ game tương tự** (LEGO 2K Drive, LEGO Worlds, Bricktales, Townscaper, Brick Rigs/Besiege, Mecabricks, BrickForge/brick-builder open-source):
- Build từng viên cho cả thành phố quá chậm → 2 tầng brick/prefab (giống 2K Drive garage + Townscaper city).
- Townscaper: click 1 phát ra kết quả đẹp → road auto-tile, đặt prefab nhanh.
- Brick Rigs: xe build xong chạy được = wow-factor lớn nhất → giữ, nhưng physics đơn giản.
- Mecabricks/BrickForge: chỉ là tool, thiếu gameplay → Phase 2 thêm mục tiêu nhẹ.

## Kiến trúc

### Hệ toạ độ & brick (pure TS, test được)
- Đơn vị: 1 stud = 1 (x,z); chiều cao theo **plate** (brick = 3 plate). Toạ độ brick = số nguyên `(x, y, z)` + `r ∈ {0,1,2,3}` (xoay 90° quanh Y).
- `Brick = { p: partId, x, y, z, r, c: colorIdx }`.
- `PartDef = { id, category, footprint:[w,d], height (plates), shape, tags[] }` — shape: box, plate, tile, slope, round, wheel, window, door, furniture (table/chair/counter/stove), tree, sign…
- **Occupancy map**: `Map<"x,y,z", brickId>` theo voxel 1×1×1plate → check va chạm O(volume).
- **Luật đặt**: không chồng voxel + phải tựa lên ground/baseplate hoặc brick bên dưới (≥1 ô overlap). Không cần mô phỏng stud connector thật.
- Palette ~16 màu LEGO kid-friendly, cố định index.

### Render
- Geometry mỗi part sinh procedural 1 lần (box + stud cylinders merged, low-poly, cache theo partId).
- Workshop: `InstancedMesh` theo partId, màu per-instance → vài chục draw call.
- Blueprint "bake": merge toàn bộ brick → 1 `BufferGeometry` với vertex color + render thumbnail PNG (offscreen) → City dùng `InstancedMesh` theo blueprint ⇒ 200 nhà cùng loại = 1 draw call.
- Material: `MeshLambertMaterial`/`MeshStandardMaterial` roughness cao (nhựa), 1 directional light + shadow map nhỏ, DPR cap 1.5–2. Target 60fps iPad đời thấp, ≥30fps Android tầm trung.

### 3 mode (scene)
1. **Workshop** — baseplate theo loại: nhà nhỏ 16×16, nhà lớn 32×32, xe 8×16, đồ vật 8×8.
   - Tool icon to: Đặt / Sơn / Xoá / Di chuyển / Xoay, Undo/Redo (command pattern), đổi màu, chọn part theo category.
   - Touch: tap = đặt brick tại ghost; 1 ngón kéo = orbit; 2 ngón = zoom/pan; nhấn giữ = chọn brick.
   - Lưu thành Blueprint (`kind: building | vehicle | prop`, tags ví dụ `restaurant`, `garage`, `fire_station`, `police` — hook cho Phase 2).
2. **City** — grid ô 8×8 stud (vd 48×48 ô).
   - Road tool kéo vẽ, auto-tile (thẳng/cong/ngã 3/ngã 4).
   - Kho Blueprint (starter + của user) → kéo thả, xoay, xoá. Footprint làm tròn lên số ô. Không chồng lấn.
   - Nút "Sửa" trên building → mở Workshop với blueprint đó; cập nhật mọi instance.
3. **Drive** — chọn vehicle blueprint, spawn trên đường.
   - Xe hợp lệ khi có ≥2 wheel part (tốt nhất 4); vị trí bánh lấy từ wheel brick → Rapier raycast vehicle (`DynamicRayCastVehicleController`).
   - Collider xe = cuboid theo bounds; khối lượng ∝ số brick. City collider = cuboid per placement + ground.
   - Touch: joystick ảo trái (lái), nút ga/phanh phải, nút còi. Camera chase.

### State & persistence
- Zustand stores: `appStore` (mode, slot, settings, lang), `editorStore` (model + history), `cityStore` (roads, placements), `blueprintStore`.
- IndexedDB qua **Dexie**: bảng `slots`, `blueprints`, `cities`, `thumbnails` (Blob).
- Schema `version` + hàm migrate tuần tự (`migrations.ts`).
- Autosave debounce 2s + on `visibilitychange`/`pagehide` (quan trọng trên iPad khi đóng tab). `navigator.storage.persist()` để tránh bị xoá.
- 3 save slot. Export/Import `.bricktown.json` (blueprints + city, thumbnail regenerate khi import).

### Cấu trúc thư mục
```
src/
  core/          # pure TS, không React — 100% unit test
    grid.ts, rotation.ts, occupancy.ts, model.ts (add/remove/move/paint),
    parts/catalog.ts, parts/geometry.ts, colors.ts,
    blueprint.ts (bounds, footprint, bake), vehicle.ts (wheel detect → config),
    roads.ts (auto-tile), city.ts (placement validate), serialize.ts, migrations.ts
  state/         # zustand stores, history.ts
  persistence/   # db.ts (Dexie), autosave.ts, exportImport.ts
  render/        # InstancedBricks.tsx, BlueprintInstances.tsx, materials.ts, thumbnail.ts
  scenes/        # workshop/, city/, drive/
  input/         # gestures.ts, VirtualJoystick.tsx
  ui/            # HUD, PartPalette, ColorPicker, SlotMenu, i18n/{vi,en}.json
  content/       # starter blueprints JSON
  audio/         # sfx snap/xoá/còi (WebAudio)
```

### Bộ brick cơ bản + Template dựng theo hướng dẫn (yêu cầu bổ sung)
- **Bộ brick cơ bản** có sẵn từ đầu: catalog ~40 part chia nhóm icon (Gạch, Tấm, Mái dốc, Tròn, Cửa/Cửa sổ, Bánh xe, Nội thất, Cây/Trang trí).
- **Template** = Blueprint + `steps: number[][]` (index brick theo từng bước). Steps tự sinh mặc định (sort theo y → gom 2–5 viên/bước theo vùng), cho phép chỉnh tay khi làm content.
- **Mode Guided Build** (dùng lại Workshop):
  - Mỗi bước: ghost nhấp nháy các viên cần đặt, panel "Cần: 2× gạch 2×4 đỏ" với hình part, palette tự chọn sẵn part/màu.
  - Đặt đúng (part + vị trí + xoay + màu) → viên "khoá" vào, hiệu ứng + âm thanh; sai → ghost rung nhẹ, không phạt.
  - 2 mức: **Dễ** (chạm ghost là đặt) cho bé nhỏ; **Thường** (tự chọn part/màu từ palette).
  - Nút Bước trước/Bước sau, xoay xem mô hình hoàn chỉnh; lưu tiến độ dở dang.
  - Hoàn thành → nhận Blueprint (dùng ở City/Drive), mở được "Tự do sửa" trong Workshop.
- `core/template.ts`: autoSteps, matchPlacement, progress — unit test.

### Starter content (để trẻ em có cái chơi ngay)
~15 template (đều có hướng dẫn từng bước, xếp theo độ khó ⭐–⭐⭐⭐): cây, đèn đường, ghế công viên, xe con, 3 nhà, xe cảnh sát, xe cứu hỏa, xe tải, nhà hàng (có bàn/ghế/bếp), gara, trạm cứu hỏa, đồn cảnh sát. Build bằng Workshop rồi export JSON vào `content/templates/`.

## Milestones Phase 1

| # | Nội dung | Done khi |
|---|---|---|
| M0 | Scaffold: Vite+TS+React, R3F, drei, rapier, zustand, dexie, vite-plugin-pwa, Vitest, Playwright, ESLint/Prettier. Ghi spec vào `docs/superpowers/specs/2026-10-01-bricktown-design.md`, `git init`. | `npm run dev` hiện canvas trống, test chạy |
| M1 | `core/`: catalog ~40 part, geometry procedural, grid/rotation, occupancy, luật đặt, serialize. TDD. | unit test xanh |
| M2 | Workshop: render instanced, ghost + tap place, xoá/sơn/xoay/move, undo/redo, gesture camera, palette UI | đặt được 200+ brick mượt trên iPad |
| M3 | Persistence: Dexie, slot menu, autosave, export/import, migrations | reload → state còn nguyên |
| M3b | Guided Build: template format, autoSteps, ghost theo bước, match placement, mức Dễ/Thường, 5 template đầu | bé dựng xong xe con theo hướng dẫn |
| M4 | Blueprint bake + thumbnail; City: grid, road auto-tile, đặt/xoay/xoá blueprint, sửa blueprint; đủ ~15 template | dựng được 1 khu phố từ template |
| M5 | Drive: wheel detect, raycast vehicle, joystick ảo, chase cam, colliders city | lái xe tự build quanh phố |
| M6 | Polish: SFX, i18n vi/en, onboarding 3 bước bằng hình, perf pass, PWA install + offline | Lighthouse PWA ok, chơi offline trên iPad |

## Phase 2 (sau, chỉ giữ hook trong data model — không build bây giờ)
- NPC đi bộ trên lưới vỉa hè/đường (A* trên grid city), xe NPC theo road graph.
- Tiền: kiếm từ nhà hàng/nhiệm vụ, mở khoá part/màu.
- Building theo tag: `restaurant` (khách vào ngồi bàn → trả tiền), `garage` (sửa xe hỏng), `fire_station` (nhiệm vụ dập lửa), `police` (đuổi xe/giao thông).
- Mission system đơn giản (trigger zone + timer).

## Rủi ro & xử lý
- **Perf mobile**: instancing + bake blueprint, cap DPR, giới hạn brick/workshop (~1500), shadow nhỏ. Đo sớm ở M2 trên thiết bị thật.
- **Touch conflict orbit vs place**: phân biệt tap (<200ms, <8px) vs drag; tool mode rõ ràng.
- **Safari xoá IndexedDB** (ITP 7 ngày nếu không install PWA): khuyến khích "Thêm vào màn hình chính" + nhắc export backup.
- **Physics xe lật/kỳ quặc với hình dạng lạ**: hạ trọng tâm nhân tạo, clamp tốc độ, nút "lật lại xe".

## Verification
- `npm test` (Vitest): grid/rotation, occupancy, luật đặt, serialize round-trip, migrations, road auto-tile, wheel detection, city placement.
- `npx playwright test` (mobile viewport + touch emulation): mở app → đặt brick → reload → brick còn; tạo blueprint → đặt lên city → vào drive mode không lỗi console.
- Manual: preview qua browser pane (mobile preset) mỗi milestone; test thật iPad Safari + Android Chrome (qua LAN `vite --host`), kiểm FPS bằng `r3f-perf`.
- PWA: build `npm run build && npm run preview`, tắt mạng → app vẫn mở, save còn.

## Bước tiếp theo khi plan được duyệt
1. M0: scaffold + ghi spec chi tiết vào `docs/superpowers/specs/`.
2. Viết implementation plan chi tiết cho M1–M2 (skill writing-plans), rồi code theo TDD.
