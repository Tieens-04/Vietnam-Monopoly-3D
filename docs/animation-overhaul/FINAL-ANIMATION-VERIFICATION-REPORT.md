# FINAL ANIMATION VERIFICATION REPORT — Phase 2 (3D Animation Overhaul)

- **Dự án:** Cờ Tỷ Phú 3D Việt Nam (`Vietnam-Monopoly-3D`)
- **Ngày hoàn tất kiểm định:** 2026-11-24
- **Nhánh làm việc:** `feature/3d-animation-overhaul` (local only — **chưa push, chưa deploy**)
- **Stable Gameplay Baseline (`main`):** `68c8d507b2ba963001c4448bf841eb691ecd5514` (`68c8d50`)
- **Kết luận nghiệm thu:** **ĐẠT TOÀN BỘ TIÊU CHÍ NGHIỆM THU (PASS 8/8 WAVES)** — không hồi quy bất kỳ luật chơi, tính toàn vẹn Online, hay chốt chặn hiệu năng Phase 1 nào.

---

## 1. Tóm Tắt Toàn Bộ 8 Wave Đã Triển Khai

| Wave | Hạng mục chính | Tài nguyên / Module tạo mới & cập nhật | Trạng thái |
|---|---|---|---|
| **Wave 1** | Hạ tầng Animation (`AnimationDirector` manual-stepped GSAP `^3.15.1`, `AnimationEventDispatcher`, `GltfAssetPool`, `createMonotonicBeatTracker`) | `src/three/animationDirector.ts`, `src/three/animationEventBus.ts`, `src/three/gltfAssetPool.ts`, `src/game/gameplayClock.ts`, `src/App.tsx` | **PASS** |
| **Wave 2** | 4 Nhân vật tỷ phú `.glb` rig xương (Blender `4.5.16 LTS`, 10 bones, 12 clips, `<= 51 KB`/file) + Fallback procedural + Xúc xắc & SFX | `scripts/blender/build_monopoly_assets.py`, `public/assets/models/pawn_{car,yacht,jet,crown}.glb`, `src/three/characterRigController.ts`, `src/three/diceEffects.ts`, `src/audio/soundEngine.ts` | **PASS** |
| **Wave 3** | Camera Director 9 góc máy (`ANIM-CAM-01..09`), bật mặc định, nhường `OrbitControls` tức thì, giữ khung hậu nhảy bước (`postHopHold = 0.9s`) | `src/three/cameraDirector.ts`, `src/three/cameraDirector.test.ts`, `src/components/MonopolyCanvas.tsx` | **PASS** |
| **Wave 4** | Hoạt ảnh Công trình (`ANIM-BLD-01..06, 10..11`), Monopoly Wave (FFA & `2v2`), Kho bạc 3D theo lý do giao dịch, `AnimatedCashPill` | `src/three/buildingAnimator.ts`, `src/three/treasurySystem.ts`, `src/game/currencyLogic.ts`, `src/components/PlayerHUD.tsx`, `src/three/models.ts` | **PASS** |
| **Wave 5** | Sự kiện đặc biệt & Môi trường (Đảo Hoang, World Tour, Lật thẻ 3D, Searchlight Cúp QG, Đèn lồng, Động đất, Mất điện, Khiên, Ngưỡng N-1, Ngày/Đêm, đồng bộ biểu cảm Avatar) | `src/three/specialEventEffects.ts`, `src/components/PlayerAvatar3D.tsx`, `src/audio/soundEngine.ts` | **PASS** |
| **Wave 6** | Bục & Cúp Vinh Quang `.glb` (`29,932 B`, 392 tris, 3 bones, 2 clips), Lễ đăng quang Solo/`2v2`, Confetti 3D `InstancedMesh` tự ngủ `3.2s`, ẩn chữ 3D sân giữa chống xuyên khối, rút quân phá sản | `public/assets/models/trophy_podium.glb`, `src/three/endgameCeremony.ts`, `src/components/TileModalAndDialogs.tsx` | **PASS** |
| **Wave 7** | Tối ưu hóa toàn diện: thu gọn `CanvasTexture` giữ độ nét chữ Việt theo tọa độ logic `ctx.scale`, gộp mesh tĩnh `PlayerAvatar3D`, giãn nhịp đối thủ nhàn rỗi, tách `dynamicShadowDirty` (`~24 Hz`) khỏi `GTAOPass`, tắt `lowerPlinth.castShadow`, tải lười `GLTFLoader`, tách chunk `vendor-three/react/motion` | `src/three/textures.ts`, `src/components/PlayerAvatar3D.tsx`, `src/components/MonopolyCanvas.tsx`, `src/three/gltfAssetPool.ts`, `vite.config.ts`, `src/three/performanceAssets.test.ts` | **PASS** |
| **Wave 8** | Kiểm định độc lập toàn hệ thống, `e2e/animation-overhaul.spec.ts`, fix giật lùi camera hậu nhảy bước phát hiện qua test Online, rà soát diff & sạch mã nguồn | `e2e/animation-overhaul.spec.ts`, `e2e/business-tour-rules-and-ui.spec.ts`, `src/three/cameraDirector.ts`, `docs/animation-overhaul/FINAL-ANIMATION-VERIFICATION-REPORT.md` | **PASS** |

---

## 2. Kết Quả Kiểm Thử Tự Động & Hồi Quy (Trên Bản Build Cuối)

| Hạng mục kiểm thử | Mốc Baseline (`68c8d50`) | Kết quả Phase 2 (`feature/3d-animation-overhaul`) | Đánh giá |
|---|---|---|---|
| **Static TypeScript (`npm run lint`)** | `0` lỗi | **`0` lỗi** | **PASS** |
| **Unit & Contract Tests (`npm test`)** | `106/106` PASS | **`127/127` PASS** (`+21` bài test mới: `AT-UNIT-01..06`, GLB topology, Camera Director, Building/Special/Endgame) | **PASS** |
| **Production Build (`npm run build`)** | PASS (`index` `1,320.79 KiB`) | **PASS (`721ms`)** — tách chunk: `index` **`490.05 kB` (`143.18 kB` gzip)**, `vendor-three` `677.37 kB` (`167.12 kB` gzip), `vendor-react` `218.74 kB`, `vendor-motion` `151.38 kB`, `GLTFLoader` lazy `45.10 kB` (`13.24 kB` gzip) | **PASS** |
| **Playwright Headed E2E (`npx playwright test --headed --workers=1`)** | `45/45` PASS | **`50/50` PASS (`11.5m`, `0` lỗi)** — toàn bộ `45` bài Phase 1 + `5` bài mới trong `e2e/animation-overhaul.spec.ts` | **PASS** |
| **Seeded Bot-vs-Bot Simulations (`sim.ts --all-190`)** | `190/190` hoàn thành | **`190/190` hoàn thành**, `0` deadlock, `0` vi phạm luật (B1–B6) | **PASS** |

---

## 3. So Sánh Hiệu Năng Trước / Sau (`68c8d50` vs Phase 2)

### 3.1 Nhóm A — Kiểm Thử Điều Tiết RAF Giả Lập (`pw-fps-and-clock-benchmark.ts`)
*Mục đích: Chứng minh tính bất biến thời gian thực của logic (`gameplayAnimDt` tách `visualAnimDt`, thứ tự `onStep`, đồng hồ đơn điệu), **không** dùng để thay thế đánh giá phần cứng iGPU vật lý.*

| Kịch bản (`?autostart=1&players=2&hotseat=1&dice=6-5`) | Baseline (`68c8d50`) | Phase 2 (Sau Wave 8) | Ngưỡng mục tiêu | Kết quả |
|---|---|---|---|---|
| `AT-FPS-60` (`0ms` tự nhiên) | `5,793 ms` | **`5,620 ms`** (`273f`, `48.6 FPS`, Phan Thiết) | `< 6,200 ms` | **PASS** |
| `AT-FPS-30` (`33ms`) | `5,538 ms` | **`5,520 ms`** (`93f`, Phan Thiết) | `5,000–6,500 ms` | **PASS** |
| `AT-FPS-15` (`67ms`) | `5,680 ms` | **`5,497 ms`** (`62f`, Phan Thiết) | `5,000–6,500 ms` | **PASS** |
| `AT-FPS-05` (`200ms` thuần RAF) | `5,650 ms` (`23f`) | **`5,502 ms`** (`25f` thuần RAF, Phan Thiết) | `< 6,500 ms` | **PASS** |
| `AT-FPS-2.5` (`400ms` thuần RAF) | `6,102 ms` (`14f`) | **`6,036 ms`** (`14f` thuần RAF, Phan Thiết) | `< 6,800 ms` | **PASS** |
| `AT-LOW-IDLE` (`lowTierIdleDrawsOver3s`) | `3` draws / `3s` | **`3` draws / `3s`** (`0 FPS` giữa các tick đồng hồ 1s) | `<= 4` draws / `3s` | **PASS** |
| `AT-LIFE-PAUSE` (`Pause 3.5s` giữa pha nhảy) | Frozen (`true`) | **Frozen (`true`)**, tổng `9,262 ms`, đáp Phan Thiết | Đóng băng hoàn toàn | **PASS** |
| `AT-LIFE-HIDDEN` (Tab nền Chrome throttle) | `~10,500 ms` | **`4,885 ms`** (`23` WebGL draws roll, `33 <= 35` bot draws, trả lượt chuẩn) | Cải thiện mạnh & `<= 35` draws | **PASS** |
| `AT-GPU-HOTSWAP` (`low → medium → high → low`) | `0` lỗi | **`0` lỗi**, đủ 4 tầng `["low","medium","high","low"]` | `0` lỗi | **PASS** |
| `BUG-03` Độ trôi đồng hồ 60s (`driftPercent`) | `<= 2%` | **`1.0%`** (`wall 60.6s`, `clock 60s`, `0` lỗi) | `<= 2.0%` | **PASS** |

### 3.2 Nhóm B — Đo Đạc Trực Tiếp Chrome Headed + WebGL Hook + CDP (`1440×900`)
*Nguồn dữ liệu thực đo: `baseline_metrics.json` (`68c8d50`) đối chiếu `after_metrics.json` (Wave 7/8) trên cùng máy phát triển Windows + Chrome.*

| Chỉ số WebGL / CDP (`1440×900`) | Baseline (`68c8d50`) | Phase 2 (Wave 7–8) | Mức cải thiện | Trần Ngân sách (`PERFORMANCE-BUDGET.md`) | Kết quả |
|---|---|---|---|---|---|
| **TTI (`initialInteractiveMs`)** | `4,134 ms` | **`3,730 ms`** | **`-9.8%`** | `<= 4,100 ms` | **PASS** |
| **CDP `ScriptDuration` / `TaskDuration`** | `3.556s / 4.180s` | **`2.556s / 3.136s`** | **`-28.1% / -25.0%`** | Giảm tải CPU khởi động | **PASS** |
| **`Low` Texture VRAM** *(hook upper-bound / RGBA8 ước tính)* | `229.72 MB` (`~110 MB`) | **`108.94 MB` (`~52 MB` RGBA8)** | **`-52.6%`** | `<= 65 MB` RGBA8 | **PASS** |
| **`Low` Buffer VRAM** | `1.96 MB` | **`0.85 MB`** | **`-56.6%`** | `<= 4.0 MB` | **PASS** |
| **`Low` Active Roll+Hop FPS** (`P50 / P95`) | `48.5 FPS` (`16.7 / 16.9ms`) | **`52.9 FPS` (`16.7 / 16.9ms`)** | **`+9.1%`** | `>= 45 FPS` · `<= 18/28ms` | **PASS** |
| **`Low` Board Draw Calls / Triangles** | `316.8` / `26,736` | **`295.3` / `15,408`** | **`-6.8%` / `-42.4%`** | `<= 325` / `<= 31,000` | **PASS** |
| **Avatar Offscreen Draws/s (`Medium`)** | `2,672.7 / s` | **`406.7 / s`** | **`-84.8%`** | `<= 750 / s` | **PASS** |
| **Avatar Offscreen Draws/s (`High` Day / Night)** | `3,587 / 4,220 / s` | **`813.3 / 868.0 / s`** | **`-77.3% / -79.4%`** | `<= 1,400 / s` | **PASS** |
| **`High` Active Roll+Hop FPS** (`P50 / P95`) | `24.8 FPS` (`33.8 / 66.6ms`) | **`50.8 FPS` (`16.7 / 33.5ms`)** | **`+104.8%`** | `>= 30 FPS` · `<= 25/42ms` | **PASS** |
| **`High` Active Draw Calls / Triangles** | `685.3` / `54,351` | **`316.4` / `16,306`** | **`-53.8%` / `-70.0%`** | `<= 520` / `<= 58,000` | **PASS** |
| **`High` Idle Day / Night FPS** | `27.0 / 20.67 FPS` | **`30.67 / 25.33 FPS`** | **`+13.6% / +22.5%`** | Cải thiện so với Baseline | **PASS** |
| **`High` Treasury Flight FPS** | `25.56 FPS` | **`32.78 FPS`** | **`+28.2%`** | Cải thiện so với Baseline | **PASS** |

> [!NOTE]
> **Ghi nhận minh bạch về môi trường phần cứng:** Các phép đo Nhóm B ở trên được thực hiện trên máy phát triển hiện tại bằng Chrome thật (không giả lập RAF) và cho thấy mức cắt giảm thực sự rất lớn về VRAM (`-52.6%`), Draw Calls (`-53.8%` bàn cờ chính, `-79%..85%` Avatar offscreen) và Triangles (`-70%`). Tuy nhiên, việc xác nhận trải nghiệm thực tế trên **laptop sử dụng card onboard vật lý (Intel UHD / Iris Xe / AMD Radeon tích hợp ở chế độ pin)** vẫn nên được kiểm tra bổ sung trực tiếp trên thiết bị iGPU vật lý trước khi phát hành chính thức.

---

## 4. Kiểm Toán Độc Lập Git Diff & 12 Chốt Chặn Phase 1 (`68c8d50` → Working Tree)

### 4.1 Các Module Luật Chơi & Đồng Bộ Mạng Được Bảo Toàn Tuyệt Đối (`0` dòng thay đổi)
- `src/server/roomManager.ts`: **Không sửa đổi** — toàn bộ máy trạng thái server-authoritative, `decisionRevision`, `actionId`, AFK timeout và đồng bộ Online giữ nguyên 100%.
- `src/server/appServer.ts`: **Không sửa đổi**.
- `src/game/onlineClient.ts`: **Không sửa đổi** — bảo toàn `isSynced`, `SESSION_REPLACED`, hàng đợi bootstrap và chống stale `GAME_ACTION`.
- `src/game/rules.ts`, `src/game/boardData.ts`, `src/game/botAI.ts`: **Không sửa đổi** — bảo toàn toàn bộ luật Business Tour, luật tùy chỉnh `CUSTOM`, thuế, phá sản, 2v2 và AI Bot.
- `src/game/graphicsQuality.ts`, `src/three/physicsEngine.ts`: **Không sửa đổi** — bảo toàn `createBoardFrameScheduler()`, `computeBoardFrameDeltas()`, `500ms` single-flight fallback và vật lý xúc xắc `cannon-es` tất định.

### 4.2 Các Sửa Đổi Bổ Trợ Đã Kiểm Duyệt
- `src/game/currencyLogic.ts` (`+35` dòng): Chỉ bổ sung trường phân loại tùy chọn `reason?: CashFlowTransferReason` để Kho bạc 3D hiển thị dải vàng Start / vòng xoáy Thuế / rút Phá sản; không thay đổi số dư hay logic tính giao dịch.
- `src/game/gameplayClock.ts` (`+101` dòng): Chỉ bổ sung `createMonotonicBeatTracker()` phục vụ `waitGameBeat` chống giãn nhịp tab nền; giữ nguyên `createMatchClock` và `createTurnClock`.
- `e2e/business-tour-rules-and-ui.spec.ts` (`+4` dòng): Thiết lập `bt_vn_cinematic_camera = 'false'` trong riêng bài test đo tọa độ chiếu 2D của speech bubble trên `/?quality=high` để phép chiếu pixel đo đúng tọa độ 3D của quân cờ mà không bị trộn bởi chuyển động pan/zoom hợp lệ của `CameraDirector`; không nới lỏng bất kỳ ngưỡng assertion nào (`<= 28px`). Đồng thời phát hiện và sửa triệt để lỗi giật lùi camera hậu nhảy bước (`POST_HOP_HOLD_DURATION_SEC = 0.9s`) trong `src/three/cameraDirector.ts`.
- **Kiểm tra vệ sinh kho mã nguồn:** Đã xóa `scripts/blender/__pycache__/`; không tồn tại file tạm, log rác, API key hay thông tin nhạy cảm nào trong `git status`.
- **Tài sản Blender `.glb` (`public/assets/models/`):**
  - `pawn_car.glb`: `48,696 B` (`572` tris, `10` bones, `12` clips)
  - `pawn_yacht.glb`: `48,384 B` (`564` tris, `10` bones, `12` clips)
  - `pawn_jet.glb`: `51,000 B` (`584` tris, `10` bones, `12` clips)
  - `pawn_crown.glb`: `50,052 B` (`668` tris, `10` bones, `12` clips)
  - `trophy_podium.glb`: `29,932 B` (`392` tris, `3` bones, `3` mats, `2` clips)

---

- **Điều chỉnh theo phản hồi người dùng (2026-11-24):** Giữ nguyên hiệu ứng đổ xúc xắc cổ điển mượt từ mốc `68c8d50` trong `src/components/MonopolyCanvas.tsx` và `src/App.tsx` (gỡ pha nhấc mồi `t < 0.1` gây khựng giữa không trung, gỡ các vòng sáng/tia lửa phụ đè lên xúc xắc, và giữ bóng đổ xúc xắc cập nhật mượt 60 Hz trong lúc tung mà không làm vẽ lại `GTAOPass`). Đã xác minh lại `npm run lint` (`0` lỗi), `npm test` (`127/127` PASS), `npm run build` (`645ms`), và `9/9` Playwright headed (`animation-overhaul` + `online-resilience`).

## 5. Khuyến Nghị Bước Tiếp Theo

Toàn bộ **8/8 Wave** của **Phase 2 — Comprehensive 3D Animation Overhaul** đã vượt qua tất cả bài kiểm thử kỹ thuật, thị giác và hồi quy trên nhánh local `feature/3d-animation-overhaul`. Hệ thống đã sẵn sàng để tạo local commit sau khi nhận được phê duyệt từ người dùng (chưa push/deploy).
