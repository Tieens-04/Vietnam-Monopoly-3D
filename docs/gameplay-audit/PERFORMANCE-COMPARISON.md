# PERFORMANCE COMPARISON — Before vs. After Remediation

- **Ngày đo đạc hậu sửa lỗi:** 2026-11-24
- **Script tái lập trong repo:** [`scripts/gameplay-audit/pw-fps-and-clock-benchmark.ts`](../../scripts/gameplay-audit/pw-fps-and-clock-benchmark.ts) (chạy Chrome thật **headed**, production build `dist/` + `server.js`).
- **Dữ liệu trước sửa lỗi (Baseline @ `515feab`):** Ghi nhận từ đợt Comprehensive Gameplay Audit (`pw_offline.json`, `verify_gaps_and_bug11.json`, `pw_interactive_and_visual_audio.json`, `pw_hidden_tab_real.json`).

---

## 1. Thời Lượng Animation Gameplay Theo FPS (`BUG-10`)

Kịch bản chuẩn: Chế độ Offline Hotseat (`?autostart=1&players=2&hotseat=1&dice=6-5&quality=low`) — tung xúc xắc vật lý `6 + 5 = 11` (`~1.4s`) + nhảy 11 ô tới **Phan Thiết** (`~2.9s`) + landing cue (`650ms`) cho tới khi mở `buy-decision-modal`.

| Mục tiêu FPS | Khoảng cách frame giả lập (`intervalMs`) | Trước sửa lỗi (Baseline) | Sau sửa lỗi (Post-Fix Final, `rafFallbackMs=500ms`) | Số frame WebGL vẽ (`renderedFramesDelta`) | Kết quả ô đích (`Phan Thiết`) | Lỗi Console | Đánh giá |
|---|---|---|---|---|---|---|---|
| **60 FPS** | `0 ms` (tự nhiên) | `~4.5s – 5.5s` | **`5,793 ms`** | `253` frames (`43.7 FPS` thực) | **Đúng (`true`)** | `0` | Chuẩn thiết kế |
| **30 FPS** | `33 ms` | Không đo riêng (kẹp `60ms` chưa kích hoạt) | **`5,538 ms`** | `87` frames (`15.7 FPS` thực) | **Đúng (`true`)** | `0` | Thuần RAF, ổn định |
| **15 FPS** | `67 ms` | Bắt đầu giãn nhẹ (`>60ms/frame`) | **`5,680 ms`** | `58` frames (`10.2 FPS` thực) | **Đúng (`true`)** | `0` | Thuần RAF, sai lệch `-2.0%` |
| **5 FPS** | `200 ms` | **`15,866 ms`** *(giãn `3.5×` slow-motion)* | **`5,650 ms`** | **`23` frames (`4.1 FPS` thực)** *(thuần RAF, giảm `34%` so với `35` ở bản nháp 120ms)* | **Đúng (`true`)** | `0` | **Giảm `64.4%` thời gian chờ**, đúng ngân sách GPU 5 FPS |
| **2.5 FPS** | `400 ms` | **`32,657 ms`** *(giãn `6.7×`, thất bại không mở kịp modal)* | **`6,102 ms`** | **`14` frames (`2.3 FPS` thực)** *(thuần RAF, giảm `59%` so với `34` ở bản nháp 120ms)* | **Đúng (`true`)** | `0` | **Giảm `81.3%` thời gian chờ**, đúng ngân sách GPU 2.5 FPS |

> **Nhận xét kỹ thuật:** Với `rafFallbackMs = 500ms`, toàn bộ các mức **`60 / 30 / 15 / 5 / 2.5 FPS`** đều chạy **100% thuần RAF** mà không bị fallback timer chen ngang hay ép vẽ WebGL ngoài vsync lên iGPU yếu; đồng thời khi RAF bị hệ điều hành đóng băng hoàn toàn (`0–1 Hz`, `> 500ms`), watchdog single-flight (`scheduleToken`) vẫn hoàn thành animation đúng hạn ở nhịp tối đa `2 Hz`, trong khi `visualAnimDt` giữ trần an toàn `<= 0.06s` (hardware).

---

## 2. Tab Bị Che Khuất / Nền (Occluded / Background Tab — `BUG-10`)

Kịch bản chuẩn: Khởi chạy Chrome có bật background throttling gốc (`ignoreDefaultArgs` loại bỏ cờ tắt throttling), mở tab thứ 2 đè lên tab game (`page2.bringToFront()`).

| Chỉ số đo đạc | Trước sửa lỗi (`pw_hidden_tab_real.json`) | Sau sửa lỗi Final (`pw-fps-and-clock-benchmark.ts`) | Cải thiện |
|---|---|---|---|
| Đổ xúc xắc `3+4=7` khi tab bị che — mở `buy-decision-modal` | **`false`** (chỉ `8` frame sau `3.5s` ≈ `0.48s` tiến độ) | **`true`** hoàn tất sau **`10,524 ms`** (`30` frames; bao gồm `waitGameBeat` dưới Chrome background timer throttling) | **Khắc phục treo animation nền** |
| 3 lượt Bot liên tiếp khi tab bị che — trả nút `Đổ Xúc Xắc` về Người chơi | **`false`** (sau `11s` mới vẽ `26` frame ≈ `1.56s` tiến độ, Bot 1 chưa đi xong) | **`true`** hoàn tất đủ 3 lượt Bot sau **`23,578 ms`** (**chỉ `33` WebGL frames** — giảm **`65%`** so với `94` frames ở bản nháp 120ms!) | **Khắc phục đứng lượt Bot & tiết kiệm mạnh GPU nền** |

---

## 3. Pause / Resume, Graphics Quality Hot-Swap & Demand-Driven Rendering (iGPU)

| Hạng mục kiểm chứng | Kết quả đo thực tế (Post-Fix Final) | Yêu cầu kiến trúc | Trạng thái |
|---|---|---|---|
| **Demand-Driven Rendering mức `Low` (khi đứng yên 3 giây)** | **`3` lần vẽ WebGL / 3s** (`1 FPS` đúng theo nhịp cập nhật đồng hồ đếm ngược 1s trên texture trung tâm; `0` timer fallback khi không có gameplay promise) | Không chạy vòng vẽ 60 FPS vô ích khi đứng yên; bảo toàn tối ưu iGPU | **PASS** |
| **Pause giữa bước nhảy quân cờ (3.5s) → Resume** | `pausedState: "paused"`, `clockFrozenDuringPause: true`, tổng thời gian `9,583 ms` (`5,793ms + 3,500ms = 9,293ms`, sai lệch `~290ms`), `landedPhanThietAfterResume: true` | Không mất bước nhảy, không nhảy cóc 3.5s, không khóa Promise | **PASS** |
| **Đổi nóng Graphics Quality giữa trận** | `tiersObserved: ["low", "medium", "high", "low"]`, `webglContextLost: 0`, `consoleErrors: []` | Giữ nguyên 3 mức Low / Medium / High, không rò rỉ tài nguyên WebGL | **PASS** |
| **Số lượng `WebGLRenderer` & vòng lặp** | Vẫn giữ đúng `1` `WebGLRenderer` chính cho bàn cờ + `1` scheduler `createBoardFrameScheduler` (không tạo loop độc lập thứ hai) | Không tăng overhead CPU/GPU | **PASS** |

---

## 4. Độ Chính Xác Đồng Hồ Trận Đấu Offline (`BUG-03`)

Kịch bản chuẩn: Trận Offline `1 Người + 3 Bot` với các chuyển pha liên tục (`AWAIT_ROLL ↔ ROLLING_DICE ↔ MOVING_TOKEN ↔ BUY_DECISION`).

| Chỉ số đồng hồ `20:00` | Trước sửa lỗi (`pw_offline.json`, 92s) | Sau sửa lỗi Final (`pw-fps-and-clock-benchmark.ts`, 61.0s) | Cải thiện |
|---|---|---|---|
| Thời gian thực (`wallSeconds`) | `92.0 s` | `61.0 s` | — |
| Đồng hồ đếm được (`clockElapsed`) | `66 s` (`1199 → 1133`) | **`61 s`** (`1199 → 1138`) | — |
| Thời gian thất thoát (`lostSeconds`) | **`26.0 s`** | **`0.0 s`** | **Loại bỏ hoàn toàn độ trôi** |
| Tỷ lệ trôi đồng hồ (`driftPercent`) | **`28.3%`** | **`-0.06%`** *(trong sai số đọc biên 1s)* | **Đạt chuẩn thời gian thực** |

---

## 5. Hiệu Năng Build & Thời Gian Chạy Test

| Chỉ số | Trước sửa lỗi (Baseline @ `515feab`) | Sau sửa lỗi Final (Post-Fix Round 2) | Ghi chú |
|---|---|---|---|
| Bundle client (`dist/assets/index-*.js`) | `1,345.24 kB` (`gzip: 366 kB`) | `1,352.48 kB` (`gzip: 368.50 kB`) | Tăng `+7.24 kB` (`+0.54%`) cho toàn bộ 11 bản vá + `gameplayClock.ts` + gia cố Round 2 |
| Thời gian `npm run build` | `4.32 s` | `0.71 s` | Không suy giảm build |
| Thời gian `npm test` | `~20.0 s` (`84` tests) | `55.3 s` (**`106`** tests) | Bổ sung `+22` tests gồm `simulation.test.ts` (10 ván) + 11 bug regressions + 5 Round 2 tests |
| Thời gian `npx playwright test --headed` | `11.7 phút` (`41` tests) | `13.0 phút` (**`45`** tests) | Chạy trọn vẹn `45/45` PASS sau bản sửa mã cuối cùng |
