# PERFORMANCE BUDGET — Baseline Thực Đo (`68c8d50`) & Ngân Sách Định Lượng Phase 2

- **Ngày đo Baseline:** 2026-11-24 · **Phiên bản đo:** `main @ 68c8d50` (`dist/` production build)
- **Môi trường đo thực tế:** Headed Chrome `1440×900` (`channel: 'chrome'`), đo trực tiếp qua hook `WebGL2RenderingContext` + Chrome CDP `Performance.getMetrics` (`scratch/baseline_metrics.json`).
- **Nguyên tắc kiểm soát:** Mọi ngưỡng trần của Phase 2 bám sát số liệu đo thực tế, **tuyệt đối giữ nguyên `0 FPS` idle ở mức `Low`** và chỉ cho phép tăng chi phí phần cứng trong biên độ an toàn sau khi đã thực hiện tối ưu ở Wave 7.

---

## 1. Số Liệu Baseline Thực Đo Tại `68c8d50`

### 1.1 Kích Thước Bundle, Thời Gian Tải & JS Heap
| Chỉ số | Giá trị đo thực tế (`68c8d50`) | Ghi chú chi tiết |
|---|---|---|
| Bundle JS chính (`dist/assets/index-*.js`) | **`1,320.79 KiB`** (`1,352,485 B` · **`368.50 KiB` gzip**) | Đã chứa Three.js, cannon-es, React, Board & Rules |
| Bundle CSS (`dist/assets/index-*.css`) | `68.88 KiB` (`13.30 KiB` gzip) | Tailwind v4 + Casual 3D styles |
| Font (`be-vietnam-pro` WOFF/WOFF2) | `469.77 KiB` | Tải trước `fontLoader.ts` |
| Thời gian vào màn chơi (`initialInteractiveMs`) | **`4,134 ms`** | Với `?autostart=1&players=4&quality=low` trên localhost |
| Chrome CDP Memory & DOM (`JSHeapUsedSize` / `Nodes`) | **`28.46 MB` used / `92.28 MB` total · `356` DOM nodes** | UI cực gọn nhẹ |

### 1.2 Telemetry WebGL Thực Đo Theo 3 Tầng Đồ Họa
| Tình huống đo (`1440×900`) | Frames / 3s (`Effective FPS`) | Frame Time `P50 / P95` | Board Draw Calls / frame | Triangles / frame | Avatar Offscreen Draws/s | Live WebGL Textures (VRAM ước tính RGBA8+mip) | Shader Programs |
|---|---|---|---|---|---|---|---|
| **`Low` — Idle (3s)** | **`3` frames (`1.0 FPS`)** *(chỉ tick đồng hồ 1s; `0 FPS` giữa giây)* | N/A (`999.9ms` tick 1s) | **`318`** (`2` instanced) | `26,794` | **`0 / s`** | `99` (`~110 MB` thực RGBA8; upper-bound `229.72 MB`) | `16` |
| **`Low` — Active Roll+Hop (`6+5`)** | `259` frames (**`48.5 FPS`**) | **`16.7ms / 16.9ms`** (`mean 20.61ms`) | **`316.8`** | `26,736` | `0 / s` | `99` | `16` |
| **`Medium` — Idle (3s)** | `49` frames (`16.33 FPS`, paced `20 FPS`) | — | `318` (`2` instanced) | `26,794` | **`2,672.7 / s`** ⚠️ | `102` (`~122 MB` thực) | `35` |
| **`High` — Idle Day (3s)** | `81` frames (`27.0 FPS`) | `33.5ms / 66.6ms` (`mean 37.76ms`) | `321` (`2` instanced) | `26,797` | **`3,587 / s`** ⚠️ | `110` (`~180 MB` thực, gồm RT MSAA+GTAO) | `59` |
| **`High` — Idle Night (3s)** | `62` frames (`20.67 FPS`) | `49.9ms / 66.7ms` (`mean 48.35ms`) | `334` (`2` instanced) | `26,810` | **`4,220 / s`** ⚠️ | `121` (`~195 MB` thực) | `82` |
| **`High` — Active Roll+Hop (`6+5`)** | `153` frames (`24.8 FPS`, `6,096ms`) | `33.8ms / 66.6ms` (`mean 40.29ms`) | **`685.3`** ⚠️ | **`54,351`** ⚠️ | `~3,600 / s` | `110+` | `59+` |
| **`High` — Treasury Flight (1.8s)** | `46` frames (`25.56 FPS`) | `33.6ms / 50.1ms` (`mean 40.0ms`) | `362` (`2.3` instanced) | `29,487` | `4,220 / s` | `121` | `82` |

### 1.3 Giải Phẫu 3 Điểm Nghẽn Thực Tế Phát Hiện Từ Baseline
1. **VRAM Texture lớn (`~110 MB` RGBA8 trên `Low`):** Trong [textures.ts](file:///d:/Code/Project/cờ-tỷ-phú-3d-việt-nam/src/three/textures.ts#L635-L1685), 28 ô thường dùng canvas `512×768` + mipmaps (`~58.6 MB`), 4 góc `640×640` (`8.7 MB`), 28 nhãn giá `384×224` (`12.8 MB`), 12 mặt xúc xắc + bump `384×384` (`9.4 MB`), sân cỏ `1024×1024` (`5.6 MB`) và ô thuế `1536×576` (`4.7 MB`). Tổng gần `110 MB` chỉ cho texture 2D vẽ chữ trên một bàn cờ nhỏ!
2. **Offscreen `PlayerAvatar3D.tsx` tốn `2,672–4,220` Draw Calls/giây ở `Medium`/`High`:** Do mỗi tượng chân dung giữ ~40–45 mesh rời không gọi `mergeGroupMeshesByMaterial` (khác với `models.ts`), 4 khung avatar nhỏ chạy ở `15–30 FPS` tiêu tốn số draw calls/giây gấp 8 lần cả bàn cờ chính ở mức `Medium`!
3. **Bùng nổ `685.3` Draw Calls/frame ở `High` Active:** Khi bật `shadowMap` `2048` + `GTAOPass`, mỗi frame di chuyển đều bật `shadowMapDirty = true`, khiến toàn bộ 321 đối tượng tĩnh phải render lại 2 lần (`ShadowPass` + `MainPass` + `GTAO` depth/normal pass).

---

## 2. Ngân Sách Định Lượng Mục Tiêu Cho Phase 2 (Sau Wave 1–7)

| Chỉ số Ngân sách (8 Hạng mục bắt buộc) | Mức `Low` (iGPU / Tiết kiệm pin) | Mức `Medium` (Cân bằng) | Mức `High` (Chất lượng Thương mại) |
|---|---|---|---|
| **1. Frame Time mục tiêu (Active P50 / P95)** | **`<= 18 ms` / `<= 28 ms`** | **`<= 22 ms` / `<= 35 ms`** | **`<= 25 ms` / `<= 42 ms`** *(trên GPU rời; không quá `45ms` trên máy đo hiện tại)* |
| **2. FPS (Idle / Active)** | **Idle: `0 FPS` giữa giây (`<= 1` draw/s khi đồng hồ tick)** · Active: `>= 45 FPS` | **Idle: `20 FPS` ổn định** · Active: `>= 35–45 FPS` | **Idle: `>= 30–60 FPS`** · Active: **`>= 30 FPS`** *(tăng so với `24.8` baseline nhờ Wave 7)* |
| **3. Draw Calls / Frame (Board / Offscreen Avatar)** | Board: **`<= 325`** (Active & Idle) · Avatar: **`0 / s`** | Board: **`<= 345`** · Avatar: **`<= 750 / s`** *(giảm >70%)* | Board: **`<= 520`** *(giảm từ `685`)* · Avatar: **`<= 1,400 / s`** *(giảm >65%)* |
| **4. Triangle Count / Frame** | **`<= 31,000` tris** *(tăng nhẹ ~4K cho 4 pawn `.glb`)* | **`<= 33,500` tris** | **`<= 58,000` tris** *(đã gồm shadow pass)* |
| **5. GPU Texture & Buffer Memory** | Texture VRAM: **`<= 65 MB`** *(giảm từ `~110 MB`)* · Buffers: **`<= 4 MB`** | Texture VRAM: **`<= 85 MB`** · Buffers: **`<= 4.5 MB`** | Texture VRAM: **`<= 165 MB`** *(gồm Composer RT + Shadow `2048`)* · Buffers: **`<= 5 MB`** |
| **6. JS Bundle + `.glb` Assets** | JS chính: **`<= 1,420 KiB` raw (`<= 410 KiB` gzip)** *(chấp nhận `+gsap` ~`26 KiB` gzip và bù bằng code-splitting modal ít dùng)* | Giống `Low` + tải lazy `.glb` **`<= 230 KiB` tổng** (`~95 KiB` gzip) | Giống `Medium` |
| **7. Asset Loading Time & TTI** | TTI vào bàn cờ: **`<= 4,100 ms`** (`0 ms` chặn bởi `.glb` nhờ procedural fallback) | Tải nền 5 file `.glb` hoàn tất trong **`<= 600 ms`** trên localhost | Giống `Medium` |
| **8. CPU/GPU Utilization & Zero-GC** | `0` allocation `Vector3`/`Matrix4`/`Texture`/`Material` trong `onFrame`; `0` timer phụ lúc nghỉ; `1` `WebGLRenderer` chính | Giới hạn tối đa `60` confetti & `24` hạt sự kiện đồng thời qua `InstancedMesh` pool | Tối đa `140` confetti & `48` hạt sự kiện đồng thời qua `InstancedMesh` pool |

---

## 3. Chiến Lược Tối Ưu Trọng Tâm Trong Wave 7

1. **Giảm >40% VRAM `CanvasTexture` (`textures.ts`) mà giữ 100% độ sắc nét chữ Việt:**
   - Hạ `createTileTopTexture` trên mức `Low` (hoặc toàn cục với `maxAnisotropy` thích hợp) từ `512×768` xuống `384×576` (`-44%` pixel), `createOuterPriceTabTexture` từ `384×224` xuống `256×160`, và `create3DTaxGrassTexture` từ `1536×576` xuống `1024×384` (với `tex.generateMipmaps = false` + `LinearFilter` cho thẻ HUD phẳng không xoay nghiêng lớn như `cardDeck`/`clock`), giúp tiết kiệm **`~45–55 MB` VRAM** trên GPU onboard.
2. **Batching Mesh cho `PlayerAvatar3D.tsx`:**
   - Gộp các khối tĩnh cùng vật liệu trong `headGroup` và `torsoGroup` (bằng `mergeGroupMeshesByMaterial` ngoại trừ phần mí mắt/lông mày/miệng/prop động) để hạ số draw call mỗi lần dựng từ `~45` xuống `<= 14`, lập tức cắt **`~70%`** tải offscreen `2,672 → < 750` và `4,220 → < 1,400` avatar draws/s.
3. **Tối ưu Shadow Pass & Code-Splitting:**
   - Trên `High`, tách `shadowMapDirty` để những hạt nhỏ/vòng sáng decal/hiệu ứng `transparent` không kích hoạt vẽ lại toàn bộ `2048×2048` shadow map nếu không thay đổi bóng lớn.
   - Đánh giá tách `RulebookModal` & `VictoryModal` hoặc tải lazy `GLTFLoader` để giữ `index-*.js` gzip ở mức **`<= 395–410 KiB`** kể cả sau khi thêm `gsap`.
4. **Bảo Vệ Bằng Unit Test Tự Động:** Mở rộng [performanceAssets.test.ts](file:///d:/Code/Project/cờ-tỷ-phú-3d-việt-nam/src/three/performanceAssets.test.ts) với các assertion khóa trần: tổng tam giác nhân vật `.glb`, số `InstancedMesh` tối đa của hệ thống hạt sự kiện (`<= 2` pools mới), và số mesh mỗi tượng avatar sau batching.
