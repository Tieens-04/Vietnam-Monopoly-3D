# ANIMATION TEST MATRIX — Ma Trận Kiểm Thử Bảo Vệ Hồi Quy & Hiệu Năng Phase 2

- **Ngày lập:** 2026-11-24 · **Nhánh:** `feature/3d-animation-overhaul`
- **Mốc so sánh bắt buộc:** Stable Gameplay Baseline (`main @ 68c8d50`).
- **Quy tắc chạy trình duyệt:** 100% kịch bản Playwright bắt buộc chạy ở chế độ **`--headed` (`headless: false`)** theo quy chuẩn dự án.

---

## 1. Hàng Rào Bảo Vệ Hồi Quy Bất Khả Xâm Phạm

Mọi Wave từ Wave 1 đến Wave 8 chỉ được đánh dấu PASS khi **không làm suy giảm bất kỳ hạng mục nào của Baseline `68c8d50`**:

| Hạng mục bảo vệ | Mức chuẩn Baseline (`68c8d50`) | Cách xác minh |
|---|---|---|
| Static TypeScript (`npm run lint`) | `0` lỗi | Chạy sau từng Wave |
| Unit & Integration (`npm test`) | **`106/106` PASS** (gồm 11 bug regressions + `simulation.test.ts` + `gameplayClock` + `graphicsQuality`) | Mở rộng thêm test cho `AnimationDirector`, `CameraDirector`, `GltfAssetPool`, `performanceAssets` |
| Playwright Headed E2E (`npx playwright test --headed`) | **`45/45` PASS** (gồm `online-resilience.spec.ts`) | Mở rộng thêm `e2e/animation-overhaul.spec.ts` |
| Seeded Bot-vs-Bot Simulations (`scripts/gameplay-audit/sim.ts --all-190`) | **`190/190` hoàn thành**, `0` deadlock, `160/160` FFA khớp bit-for-bit | Chạy chốt ở Wave 8 |
| Luật tùy chỉnh (`CUSTOM`) & Đồng bộ Online | Không thay đổi kết quả xúc xắc, `decisionRevision`, `actionId`, `isSynced`, thứ tự `onStep` | Kiểm chứng ở mọi test Online & `rules.test.ts` |

---

## 2. Phân Biệt Rạch Ròi Hai Môi Trường Đo Hiệu Năng

> [!IMPORTANT]
> **Không được kết luận game chạy mượt trên card onboard (iGPU) vật lý nếu chỉ mới đo qua kỹ thuật điều tiết `requestAnimationFrame` giả lập.**
> - **Nhóm A — Kiểm thử điều tiết RAF giả lập (Calibrated RAF Throttling):** Dùng `setTimeout` bọc `requestAnimationFrame` trong Playwright Chrome trên máy phát triển để ép tốc độ khung hình xuống chính xác `30 / 15 / 5 / 2.5 FPS`. Nhóm này **chứng minh tính đúng đắn của logic thời gian (`gameplayAnimDt` tách `visualAnimDt`, thứ tự `onStep`, thời lượng hoàn tất animation độc lập FPS)**.
> - **Nhóm B — Đo đạc trên Phần Cứng Vật Lý Thật (Real Hardware iGPU / CPU Throttled Profiling):** Đo bằng hook WebGL (`drawCalls`, `triangles`, `VRAM textures`) và Chrome CDP trên laptop dùng iGPU thật (Intel UHD / Iris Xe / AMD Radeon Graphics tích hợp ở chế độ tiết kiệm pin) không giả lập RAF, để kết luận độ mượt GPU thực tế.

---

## 3. Ma Trận 13 Tình Huống Kiểm Thử Bắt Buộc & Unit Tests Mới

### 3.1 Kiểm Thử Unit / Contract (`AT-UNIT-*`)
| Mã Test | Module mục tiêu | Kịch bản & Tiêu chí PASS | Wave áp dụng |
|---|---|---|---|
| `AT-UNIT-01` | `animationDirector.ts` | Kiểm tra `detachGsapFromGlobalTicker()` tắt hoàn toàn `gsap.ticker` toàn cục; timeline tiến đúng theo `visualAnimDt * speedMultiplier`; bằng `0` khi `isPaused === true`. | Wave 1 |
| `AT-UNIT-02` | `animationDirector.ts` | Kiểm tra `fastForwardToEnd()` đưa toàn bộ timeline về `progress === 1`, `cancel()` thu hồi pool không rò rỉ, và `hasBlockingVisualAnimations()` trả `false` khi đang `Idle` trên `Low`. | Wave 1 |
| `AT-UNIT-03` | `App.tsx` (`waitGameBeat`) | Kiểm tra đồng hồ đơn điệu `performance.now()` đóng băng khi `Pause` nhưng vẫn resolve đúng 1 lần tick khi bị browser throttle `1.000ms` ở tab nền (không giãn thành 10.5s). | Wave 1 |
| `AT-UNIT-04` | `gltfAssetPool.ts` | Kiểm tra topology/clip contract (tất cả 12 tên clip tồn tại trên 4 model, `<= 12` bones, `<= 1,800` tris), fallback tức thì sang `createPlayerTokenMesh` khi loader lỗi hoặc chưa xong. | Wave 1 & 2 |
| `AT-UNIT-05` | `cameraDirector.ts` | Kiểm tra tất cả 9 shot `ANIM-CAM-01..09`, vector `leadVec`, `USER_MANUAL_OVERRIDE` ngắt tức thì khi người dùng xoay chuột và **không bị `animateDiceRoll`/`animateTokenPath` xóa ngang**, giữ an toàn khung nhìn 4 khay tiền. | Wave 3 |
| `AT-UNIT-06` | `performanceAssets.test.ts` | Khẳng định tổng `InstancedMesh` mới `<= 2` pools, avatar offscreen batching `<= 14` meshes/tượng, `0` allocation tạo `BufferGeometry`/`Texture` lặp lại trong `update()`. | Wave 4–7 |

### 3.2 Kiểm Thử Thời Gian Thực Theo 5 Mức FPS (`AT-FPS-*` — Nhóm A: Calibrated RAF Throttling)
Kịch bản chuẩn: `?autostart=1&players=2&hotseat=1&dice=6-5` (đổ xúc xắc + nhảy 11 ô tới Phan Thiết + mở `buy-decision-modal`).

| Mã Test | Mức FPS giả lập (`intervalMs`) | Tiêu chí PASS (Thời gian hoàn thành & Kết quả Gameplay) | So với Baseline `68c8d50` |
|---|---|---|---|
| `AT-FPS-60` | `60 FPS` (`0ms` tự nhiên) | Hoàn tất `< 6,200ms`, đáp đúng Phan Thiết, `0` console error, đủ `11` lần `onStep` theo thứ tự. | `5,793ms` |
| `AT-FPS-30` | `30 FPS` (`33ms`) | Hoàn tất `5,000–6,500ms`, animation GSAP + `AnimationMixer` mượt mà không nhảy khựng, đáp đúng Phan Thiết. | `5,538ms` |
| `AT-FPS-15` | `15 FPS` (`67ms`) | Hoàn tất `5,000–6,500ms`, `visualAnimDt` giữ camera ổn định, đáp đúng Phan Thiết. | `5,680ms` |
| `AT-FPS-05` | `5 FPS` (`200ms` thuần RAF) | Hoàn tất `< 6,500ms`, chạy **100% thuần RAF** (không bị watchdog `500ms` cướp nhịp), quân cờ xoay đúng hướng 2 cạnh, đủ `11` `onStep`. | `5,650ms` (`23f`) |
| `AT-FPS-2.5` | `2.5 FPS` (`400ms` thuần RAF) | Hoàn tất `< 6,800ms`, chạy **100% thuần RAF**, đáp đúng Phan Thiết, `resolveOnce` bắn đúng `1` lần. | `6,102ms` (`14f`) |

### 3.3 Kiểm Thử Vòng Đời, Mạng & Khả Năng Tiếp Cận (`AT-LIFE-*` & `AT-NET-*`)
| Mã Test | Kịch bản kiểm thử thực tế (Chrome Headed) | Kết quả kỳ vọng (Acceptance Criteria) |
|---|---|---|
| `AT-LIFE-PAUSE` | Bấm `Esc` (`PauseModal`) đúng giữa pha nhảy quân + xây nhà + bay tiền (thử ở cả `60 FPS` lẫn `2.5 FPS`), chờ `3.5s` rồi Resume | Mọi timeline GSAP, `AnimationMixer`, `CameraDirector`, `treasurySystem` và `waitGameBeat` đóng băng hoàn toàn trong `3.5s`; khi Resume không nhảy cóc (`justResumedFromPauseRef`) và hoàn tất đúng ô đích. |
| `AT-LIFE-HIDDEN` | Bật background throttling gốc Chrome, đưa tab khác lên trước trong lúc tung xúc xắc & 3 Bot đi liên tiếp | Nhờ `waitGameBeat` đơn điệu + `gameplayAnimDt`, modal mở nhanh hơn nhiều so với `10.5s` cũ, 3 Bot hoàn tất trả lượt về người chơi với `<= 35` WebGL draws (tiết kiệm GPU tab nền). |
| `AT-LIFE-RESET` | Đang chạy chuỗi Landmark Reveal / Confetti Chiến Thắng → bấm **Chơi Ván Mới** / **Về Sảnh** | `cancelPendingAnimations()` + `director.cancelAll()` dọn sạch bục vinh quang, confetti, song sắt Đảo Hoang; không rò rỉ GSAP tween sang ván kế. |
| `AT-NET-RECONNECT` | Trận Online 2–4 người (`700ms RTT`), ngắt WS / nhấn `F5` ngay giữa lúc đang đổ xúc xắc hoặc nhảy quân + xây nhà | Sau khi `isSynced` trở lại `true`, `director.fastForwardAll()` chốt khớp 100% chủ sở hữu, cấp nhà, màu sắc & vị trí quân cờ với `ROOM_SNAPSHOT` server; `0` stale `GAME_ACTION`. |
| `AT-GPU-HOTSWAP` | Liên tục đổi nóng `Low → Medium → High → Low` giữa lúc quân cờ đang nhảy + tiền đang bay + pháo hoa | `0` `webglcontextlost`, `0` console error; khi về lại `Low` đang đứng yên thì WebGL ngủ `0 FPS` giữa giây (`<= 1` draw/s). |
| `AT-SPEED-2X` | Bật tốc độ `2×` trong Offline khi nhân vật đang chạy, xúc xắc lăn và nhà đang mọc | Cả `gameplayAnimDt` lẫn `AnimationDirector` (`AnimationMixer` + GSAP + `CameraDirector`) đều tăng tốc đồng bộ `2×`, hoàn tất nhanh gấp đôi mà vẫn giữ nguyên `onStep`. |
| `AT-A11Y-REDUCED` | Bật giả lập hệ thống `prefers-reduced-motion: reduce` (`page.emulateMedia({ reducedMotion: 'reduce' })`) | Tắt hoàn toàn rung Động Đất, tắt confetti `InstancedMesh`, tắt camera swoop/orbit; vẫn hiển thị rõ ràng trạng thái công trình/màu sở hữu/kết quả trận đấu. |
| `AT-GPU-CTXLOSS` | Kích hoạt `WEBGL_lose_context` (`loseContext()` → chờ `400ms` → `restoreContext()`) ngay giữa pha hiệu ứng | Phục hồi hoàn chỉnh cảnh 3D, `GltfAssetPool` không crash, `director.fastForwardAll()` đồng bộ đúng bàn cờ hiện tại (`BUG-44` tiếp tục PASS). |

### 3.4 Kiểm Thử Nghệ Thuật & Hiệu Năng So Sánh (`AT-VIS-*` — Wave 8)
- Chụp chuỗi ảnh đối chiếu **After** tại cùng góc máy/kịch bản với 5 ảnh Before (`audit_before_*.png`) để kiểm định trực quan: nhân vật xoay đúng hướng đi, bệ xe/thuyền/máy bay/vương miện nghiêng cua mượt, Landmark ★ nổi khối, khiên chặn Động Đất vỡ rõ nét, và bục Vinh Quang Solo/`2v2` cân đối trước khi `VictoryModal` hiện lên.
- Chạy lại kịch bản đo WebGL/CDP so sánh trước/sau các chỉ số trong `PERFORMANCE-BUDGET.md` trên cùng máy phát triển + ghi nhận rõ phần nào chưa kiểm chứng trên phần cứng iGPU rời nếu chưa có thiết bị vật lý tại thời điểm test.
