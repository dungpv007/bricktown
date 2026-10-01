# BrickTown — "Thế giới LEGO online" (World Map) — KẾ HOẠCH TƯƠNG LAI

> Chỉ là kế hoạch. **Không triển khai trong đợt này.** Khi bắt đầu, tách thành spec + plan riêng trong `docs/superpowers/` và chạy theo quy trình sub-agent như các đợt trước.

## Context

Hiện BrickTown chạy hoàn toàn offline (PWA + IndexedDB), chia sẻ qua link/file. User muốn một chế độ online: **một bản đồ thế giới khổng lồ**, mỗi người được cấp **một ô đất (plot)** để tự lắp LEGO, thay đổi **đồng bộ realtime** cho người khác, và **render vẫn mượt** dù bản đồ rất lớn. Người chơi chính là trẻ em → an toàn trẻ em là yêu cầu bắt buộc, không phải phần phụ.

## Mục tiêu / Phạm vi

- Bản đồ dạng lưới plot (ví dụ 1000×1000 plot), mỗi plot **32×32 núm** (= 4×4 ô City, đủ cho một công trình lớn). Một user = một plot (có thể mở thêm sau).
- Chủ plot lắp trong trình dựng giống Xưởng (tấm nền cố định bằng kích thước plot); người khác chỉ xem/đi dạo/lái xe ngang qua.
- Thay đổi plot hiện ra cho người đang xem khu đó trong ~1 s.
- Thế giới vẫn mượt trên tablet khi nhìn hàng nghìn plot.
- Ngoài phạm vi giai đoạn đầu: chat tự do, cùng sửa một plot nhiều người, kinh tế/mua bán.

## Kiến trúc đề xuất

### Backend (đề xuất: Supabase cho MVP)
- **Auth**: tài khoản phụ huynh (email/OTP) + hồ sơ con (không email, tên hiển thị chọn từ bộ từ có sẵn hoặc được duyệt).
- **Postgres**: `profiles`, `plots(id, px, py, owner, name, version, brick_count, updated_at, snapshot_path, lod_path, thumb_path, status)`, `plot_reports`, `moderation_actions`. RLS: chỉ chủ plot ghi plot của mình.
- **Storage**: snapshot plot (định dạng nén có sẵn của share codec), file LOD, thumbnail.
- **Realtime**: kênh theo **chunk** (16×16 plot/chunk); client chỉ subscribe các chunk trong tầm nhìn; sự kiện `plot_updated {id, version}`.
- **Edge Function "commit plot"**: nhận snapshot/ops → **validate như dữ liệu không tin cậy** (tái dùng `src/core/shareImport.ts` validate + `src/core/model.ts` canPlace, giới hạn số gạch, kích thước) → tăng version → lưu → sinh LOD/thumbnail (hoặc nhận LOD client gửi lên rồi kiểm tra kích thước) → broadcast.
- Khi cần scale realtime lớn: chuyển phần chunk realtime sang Cloudflare Durable Objects (1 DO/chunk), giữ Postgres làm nguồn sự thật.

### Mô hình chỉnh sửa & đồng bộ
- **Local-first**: chủ plot sửa offline như Xưởng hiện tại; thay đổi lưu IndexedDB và gom thành batch gửi lên mỗi ~1–2 s khi có mạng (hàng đợi khi mất mạng).
- Một chủ/plot → không cần CRDT; server là "last-writer theo version", client chỉ nhận version mới hơn.
- Người xem: nhận `plot_updated` → tải snapshot/LOD mới (debounce, ưu tiên plot gần camera).
- Định dạng: tái dùng **compact codec + fflate** của share (`src/core/shareCodec.ts`) — plot 1.500 gạch ≈ vài KB.

### Hiệu năng render (thế giới khổng lồ)
- **Streaming theo chunk**: chỉ tải dữ liệu các chunk quanh camera; LRU giải phóng mesh/texture chunk xa theo **ngân sách GPU** cố định.
- **LOD 4 mức**:
  - LOD0 (≤ ~2 plot quanh camera): gạch đầy đủ, baked geometry có núm (tái dùng `src/core/bake.ts`, `BakedMeshes`).
  - LOD1 (gần–trung): mesh gộp **không núm**, đơn giản hóa, lượng tử hóa — sinh sẵn trên server/khi lưu.
  - LOD2 (xa): hộp/height-map + texture mái nhìn từ trên (impostor).
  - LOD3 (zoom bản đồ): ảnh tile 2D cấp chunk (như Google Maps), không 3D.
- Giải mã/bake trong **Web Worker**, không chặn main thread; frustum culling theo chunk; instancing cho mẫu dùng lặp (template giống nhau dùng chung geometry); DPR/chất lượng tự hạ theo frame time.
- Hai chế độ xem: **Bản đồ** (2D/2.5D pan-zoom, tìm plot bạn bè, "dịch chuyển tới") và **Dạo phố** (3D gần, đi bộ/lái xe — tái dùng Drive với collider theo chunk).

### An toàn trẻ em (bắt buộc)
- Tài khoản do phụ huynh tạo; tuân thủ quy định bảo vệ dữ liệu trẻ em (COPPA/GDPR-K, Nghị định 13/2023 VN): đồng ý của phụ huynh, tối thiểu dữ liệu, xóa tài khoản.
- Không chat tự do; tên plot/nhân vật từ danh sách từ ghép sẵn hoặc qua duyệt.
- Nút báo cáo plot; hàng đợi kiểm duyệt; ẩn plot vi phạm; giới hạn tần suất commit; validate server-side mọi dữ liệu.
- Tùy chọn phụ huynh: chỉ xem plot của bạn bè đã mời.

### Tích hợp với game hiện tại
- Game vẫn offline-first; "Thế giới" là một chế độ mới trên menu, cần mạng.
- Plot = một Blueprint đặc biệt (tấm nền cố định 32×32) → dùng Xưởng, mẫu, nhân vật, gạch in hình hiện có; có nút "Đưa mô hình của tôi lên plot".

## Lộ trình đề xuất

| Giai đoạn | Nội dung | Xong khi |
|---|---|---|
| W0 Spike | Dựng thế giới giả lập 10.000 plot (dữ liệu ngẫu nhiên) chỉ client, thử LOD + streaming | ≥30 fps trên iPad đời thấp |
| W1 | Backend: auth phụ huynh/hồ sơ con, bảng plot, cấp plot, RLS | Tạo tài khoản, nhận plot |
| W2 | Trình sửa plot + commit (validate server, version, hàng đợi offline) | Sửa plot, reload thấy lại |
| W3 | Trình xem thế giới: chunk streaming, LOD0–3, Web Worker, chế độ Bản đồ/Dạo phố | Lướt bản đồ lớn mượt |
| W4 | Realtime theo chunk, cập nhật plot gần camera trong ~1 s | 2 thiết bị thấy nhau sửa |
| W5 | An toàn: báo cáo, kiểm duyệt, giới hạn tần suất, quyền phụ huynh | Qua checklist an toàn |
| W6 | Scale & vận hành: CDN cho LOD/tile, theo dõi chi phí, (tùy) Durable Objects | Load test đạt chỉ tiêu |

## Quyết định cần chốt khi bắt đầu
- Nhà cung cấp backend (Supabase vs Firebase vs Cloudflare) và ngân sách vận hành.
- Kích thước plot/bản đồ, cách cấp plot (ngẫu nhiên, chọn chỗ, theo khu bạn bè).
- Mô hình tài khoản & quy trình đồng ý phụ huynh; ai kiểm duyệt.
- Có cho bạn bè cùng sửa một plot không (nếu có → cần ops có thứ tự/CRDT).

## Kiểm chứng (khi triển khai)
- Load test client: 10.000 plot × tối đa 1.500 gạch, đo fps/bộ nhớ trên iPad và Android tầm trung.
- Độ trễ realtime: 2 thiết bị, thời gian từ commit đến hiển thị < 1 s.
- Fuzz test endpoint commit (tái dùng bộ test dữ liệu độc hại của share core).
- Kiểm tra checklist an toàn trẻ em và quyền dữ liệu trước khi mở công khai.
