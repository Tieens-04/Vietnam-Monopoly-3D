# RELEASE READINESS CHECKLIST — Gameplay Remediation & 3D Animation Upgrade Readiness

- **Ngày đánh giá:** 2026-11-24
- **Nhánh đánh giá:** `main` + uncommitted remediation working tree (base `515feab`)

---

## 1. Bảng Đối Chiếu Tiêu Chí Nghiệm Thu (Acceptance Criteria)

| # | Tiêu chí nghiệm thu | Bằng chứng xác minh thực tế (Post-Fix) | Trạng thái |
|---|---|---|---|
| 1 | **11/11 lỗi được khắc phục hoàn toàn (`0 P0`, `0 P1`, `0 P2`, `0 P3` mở)** | Toàn bộ 11 lỗi (`BUG-01` → `BUG-11`) đã vá theo đúng root cause với quy trình TDD RED → GREEN + `Audit Hardening` + 7 điểm gia cố Round 2; cập nhật đầy đủ trong `BUG-LIST.md` & `BUG-FIX-REPORT.md`. | **PASS** |
| 2 | **`npm run lint` PASS (`0` lỗi TypeScript)** | Chạy `tsc --noEmit` sau lần sửa cuối cùng: exit code `0`, `0` lỗi trên toàn repo (`src/`, `e2e/`, `scripts/gameplay-audit/`). | **PASS** |
| 3 | **`npm test` PASS (gồm regression tests 11 lỗi & `simulation.test.ts`)** | Chạy sau lần sửa cuối cùng: **`106/106` PASS (`0` fail, `55.3s`)**, bao gồm regression tests cho đủ 11 lỗi + `simulation.test.ts` + `Audit Hardening` + 5 Round 2 tests. | **PASS** |
| 4 | **`npm run build` PASS** | Chạy sau lần sửa cuối cùng: `vite build` + `server.js` thành công trong `0.71s` (`dist/assets/index-Cn4B17R8.js` `1,352.48 kB`). | **PASS** |
| 5 | **`npx playwright test --headed` PASS (gồm `e2e/online-resilience.spec.ts`)** | Chạy trọn vẹn bộ E2E trên Chrome headed **sau lần sửa mã cuối cùng**: **`45/45` PASS (`13.0m`, `0` fail)**. | **PASS** |
| 6 | **190/190 trận simulation hoàn thành, `0` trận kẹt, `0` vi phạm bất biến** | Chạy [`scripts/gameplay-audit/sim.ts --all-190`](../../scripts/gameplay-audit/sim.ts) với đúng 6 dải seed gốc (`2000–2039`, `3000–3029`, `4000–4029`, `5000–5029`, `6000–6019`, `7000–7039`): **`190/190` hoàn thành, `0` stuck, `0` violations** (`160/160` FFA khớp 100% bit-for-bit). | **PASS** |
| 7 | **Toàn bộ kịch bản `TEST-MATRIX.md` được xác minh lại bằng dữ liệu mới** | Đã chạy mới toàn bộ `probes.ts` (6/6), `pw-fps-and-clock-benchmark.ts`, `pw-online-and-matrix-audit.ts` (`all4HudIdentical: true`), `sim.ts --all-190` và 45/45 E2E sau lần sửa cuối. | **PASS** |
| 8 | **`BUG-10` đạt chuẩn ở `60, 30, 15, 5, 2.5 FPS` & bảo toàn kiến trúc iGPU** | Đo thực tế trên Chrome headed (`rafFallbackMs = 500ms`, 100% thuần RAF): `60 FPS = 5.79s (253f)`, `30 FPS = 5.54s (87f)`, `15 FPS = 5.68s (58f)`, `5 FPS = 5.65s (23f / 4.1 FPS)`, `2.5 FPS = 6.10s (14f / 2.3 FPS)`; tab ẩn mở modal + 3 Bot xong (`33` draws, `-65%`); idle Low `3` draws/3s; giữ nguyên 1 `WebGLRenderer`, Demand-Driven Rendering & Low/Medium/High. | **PASS** |
| 9 | **Không có luật `CUSTOM` nào bị thay đổi ngoài ý muốn** | Xác minh mã nguồn + 160/160 trận FFA khớp 100% bit-for-bit + toàn bộ test luật `rules.test.ts` & `business-tour-gameplay.spec.ts` PASS. | **PASS** |
| 10 | **Không tích hợp GSAP/Blender/hiệu ứng 3D mới, không đổi UI/UX, không commit/push/deploy** | `git status` sạch phạm vi, không thêm dependency mới, không commit/push/deploy, giữ nguyên giao diện & tài sản 3D hiện có. | **PASS** |
| 11 | **Independent Verification (Final Gameplay Audit)** | Hoàn thành vòng kiểm toán độc lập bởi Agent thứ hai tách biệt: rà soát toàn bộ `git diff`, tái hiện & vá triệt để 7 lỗi biên + 1 flaky test + 1 lỗi script theo TDD (RED → GREEN), và chạy lại mới toàn bộ `106/106` unit/sim + `45/45` headed E2E + `190/190` simulations + live Chrome audits. | **PASS** |
| 12 | **Đầy đủ tài liệu bàn giao trong `docs/gameplay-audit/` & scripts tái lập** | Đã cập nhật toàn bộ tài liệu trong `docs/gameplay-audit/` và 4 script tái lập tại `scripts/gameplay-audit/`. | **PASS** |

---

## 2. Kết Luận Mức Độ Sẵn Sàng Cho Giai Đoạn Nâng Cấp Animation 3D

- **Kết luận:** **SẴN SÀNG CHUYỂN GIAI ĐOẠN NÂNG CẤP ANIMATION 3D** *(12/12 tiêu chí nghiệm thu đạt **PASS**, working tree chờ người dùng duyệt trước khi commit).*
- **Nền tảng kiến trúc đã sẵn sàng cho nâng cấp 3D tiếp theo:**
  1. **Tách biệt hoàn toàn Gameplay Time khỏi Visual Time (`BUG-10`):** Các nâng cấp animation 3D tiếp theo (GSAP / Blender / hiệu ứng chuyển động mới) có thể cắm trực tiếp vào lớp visual (`visualAnimDt`) mà **không thể làm trễ, kẹt hay lệch kết quả gameplay** (`gameplayAnimDt` + `resolveOnce()` + `onStep` theo thứ tự + single-flight RAF fallback `500ms` không cản trở `5/2.5 FPS` thuần RAF).
  2. **Kiểm soát vòng đời chặt chẽ:** Đã có cleanup đầy đủ ở `Pause`, `Resume` (kèm latch `justResumedFromPauseRef` ở FPS thấp), `Reset`, `Unmount`, `Visibility` và `Online Reconnect` (`cancelPendingAnimations()`), đồng thời giữ nguyên Demand-Driven Rendering (`idle 0 FPS` trên mức `Low`) để bảo vệ ngân sách GPU cho iGPU.
  3. **Multiplayer & Kinh tế vững chắc:** Mọi lỗi P1 (`BUG-01`, `BUG-02`, `BUG-04`, `BUG-05`) đã được loại bỏ tận gốc và gia cố qua vòng Independent Review cùng lưới an toàn tự động (**106** unit/sim tests + **45** headed E2E + **190** seeded simulations).
