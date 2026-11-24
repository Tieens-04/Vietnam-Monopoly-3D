# REGRESSION TEST REPORT — Post-Remediation Verification

- **Ngày thực thi:** 2026-11-24
- **Nguyên tắc bằng chứng:** 100% kết quả bên dưới được chạy mới trên mã nguồn và bản build **sau khi hoàn tất toàn bộ 3 Wave sửa lỗi + Audit Hardening + Independent Review Round 2** — tuyệt đối không tái sử dụng kết quả PASS từ đợt kiểm toán cũ (`515feab`).
- **Chế độ trình duyệt:** 100% bài kiểm thử Playwright chạy trực tiếp trên **Chrome Headed Mode** (`--headed` / `headless: false`).

---

## 1. Bộ Kiểm Thử Chuẩn Của Repository

| Hạng mục | Lệnh thực thi | Kết quả trước sửa (`515feab`) | Kết quả sau sửa Final (Fresh Post-Edit Run) | Ghi chú |
|---|---|---|---|---|
| **Static Type Check** | `npm run lint` (`tsc --noEmit`) | PASS (`0` lỗi) | **PASS (`0` lỗi)** | Bao phủ toàn bộ `src/`, `e2e/online-resilience.spec.ts` và `scripts/gameplay-audit/*.ts` |
| **Unit & Integration Tests** | `npm test` | `84/84` PASS (`~20s`) | **`106/106` PASS (`55.3s`, `0` fail)** | Bổ sung `+22` tests (`gameplayClock.test.ts` `+4`, `graphicsQuality.test.ts` `+3`, `rules.test.ts` `+5`, `roomManager.test.ts` `+8`, `onlineClient.test.ts` `+1`, `simulation.test.ts` `+1` chạy 10 trận), phủ đủ 11 lỗi + `Audit Hardening` + 5 Round 2 tests |
| **Production Build** | `npm run build` | PASS (`4.32s`) | **PASS (`0.71s`)** | Sinh trọn vẹn `dist/assets/index-Cn4B17R8.js` (`1,352.48 kB`) + `server.js` |
| **Full Headed Playwright E2E** | `npx playwright test --headed` | `41/41` PASS (`11.7m`) | **`45/45` PASS (`13.0m`, `0` fail)** | Chạy trọn vẹn cả 41 test gốc + 4 test mới trong `e2e/online-resilience.spec.ts` **sau bản sửa mã cuối cùng** |

---

## 2. Kết Quả 190 Trận Simulation Bot-vs-Bot (Khớp Đúng Seed Đợt Audit Gốc)

Thực thi bằng script đã đưa vào repo: [`scripts/gameplay-audit/sim.ts --all-190`](../../scripts/gameplay-audit/sim.ts).

| Lô | Cấu hình | Dải Seed | Hoàn thành | Bị kẹt | Vi phạm bất biến | Lượt (`min/med/max/avg`) Trước → Sau | Đối chiếu với Baseline (`515feab`) | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| **B1** | 4 Bot FFA, Tactical OFF, Festival OFF | `2000–2039` | **40/40** | `0` | `0` | `33/81/161/82` → **`33/81/161/82`** | **Khớp bit-for-bit 100%** (từng pha & điều kiện thắng) | **PASS** |
| **B2** | 4 Bot FFA, Tactical ON, Festival ON | `3000–3029` | **30/30** | `0` | `0` | `38/85/121/83` → **`38/85/121/83`** | **Khớp bit-for-bit 100%** (`1,238` `REROLL_DECISION`) | **PASS** |
| **B3** | 2 Bot FFA | `4000–4029` | **30/30** | `0` | `0` | `9/48/107/48` → **`9/48/107/48`** | **Khớp bit-for-bit 100%** (`winsBySeat: 15 / 15`) | **PASS** |
| **B4** | 4 Bot `TEAMS_2V2`, Tactical ON | `5000–5029` | **30/30** | `0` | `0` | `10/53/117/53` → **`10/49/132/52`** | `DEBT_RESOLUTION` giảm `70 → 60` đúng do `BUG-08` bảo vệ độc quyền đồng đội 2v2! | **PASS** |
| **B5** | 3 Bot FFA, Festival ON | `6000–6019` | **20/20** | `0` | `0` | `27/59/109/58` → **`27/59/109/58`** | **Khớp bit-for-bit 100%** | **PASS** |
| **B6** | 4 Bot FFA (Đo công bằng ghế) | `7000–7039` | **40/40** | `0` | `0` | `51/101/163/101` → **`51/101/163/101`** | **Khớp bit-for-bit 100%** (`winsBySeat: 10 / 10 / 9 / 11`) | **PASS** |
| **Tổng** | **6 cấu hình** | **190 seeds** | **190/190** | **`0`** | **`0`** | — | **160/160 trận FFA khớp tuyệt đối 100% — chứng minh 0 thay đổi luật ngoài ý muốn** | **PASS** |

---

## 3. Kiểm Chứng Tất Định & Trình Duyệt Thật (Migrated Audit Scripts)

### 3.1 Deterministic Engine Probes ([`scripts/gameplay-audit/probes.ts`](../../scripts/gameplay-audit/probes.ts))
- **`bug01AfkSingleTurn`:** Sau Lượt 1 AFK (`turnCount=2`): `p0IsBot: false, p0Missed: 1`; sau Lượt 3 AFK liên tiếp (`turnCount=4`): `p0IsBot: true, p0Missed: 2` → **PASS**.
- **`bug02Teams2v2SeatOrder`:** Ghế trống 1 & 3 bù Bot cho người ở ghế 0 & 2 → `["A(id=0,team=0,human)", "Chủ Tịch Lan Anh(id=1,team=1,bot)", "C(id=2,team=0,human)", "Phu Nhân Ngọc Diệp(id=3,team=1,bot)"]`, `teamsAlternate: true` → **PASS**.
- **`bug04And06Validation`:** `bErrCodes: ["NOT_YOUR_TURN"]`, `aErrCodes: ["INVALID_STATE", "STALE_ACTION", "DUPLICATE_ACTION"]`, `phaseAfterRoll: "BUY_DECISION"` → **PASS**.
- **`bug05TimeLimitDuringDebt`:** `condition: "TIME_LIMIT"`, `winnerId: 1`, `effectiveNetWorths: { 0: 600000, 1: 1900000 }`, `pendingDebtCleared: true` → **PASS**.
- **`bug08AutoSale2v2`:** `soldTiles: [5]`, `protectedTeamBrownMonopoly: true` → **PASS**.
- **`bug09BotWatchdog`:** `rescheduledByWatchdog: true`, `returnedToHuman: true` → **PASS**.

### 3.2 Headed Chrome Online & Test-Matrix Audit ([`scripts/gameplay-audit/pw-online-and-matrix-audit.ts`](../../scripts/gameplay-audit/pw-online-and-matrix-audit.ts))
- **`BUG-04 & BUG-01` Live Repro Check:** Host mất mạng ở Lượt 1, bấm `Space` + click `Đổ Xúc Xắc` lúc offline → server timeout đưa Host vào Đảo Hoang (sau Lượt 1 `isBot: false` — không takeover sớm!) → Guest xong Lượt 2 → Host tự nối lại ở Lượt 3 → `sentWire` chỉ gồm `CREATE_ROOM`, `START_MATCH`, `RECONNECT_ROOM` (**0 `GAME_ACTION` cũ xả lại**), `afterReconnect: { turnCount: 3, activePlayerIndex: 0, turnPhase: "AWAIT_ROLL", hostInJail: true, hostJailTurns: 0 }`, `staleActionReplayed: false` → **PASS**.
- **`BUG-11` Live Repro Check:** Bật `Xúc xắc chiến thuật`, Host chọn `Chẵn`, hết giờ Lượt 1 rơi Đảo Hoang → Lượt 3 bấm `bt-jail-roll-btn` **1 lần duy nhất** → gửi `{ kind: "ROLL_DICE", diceChoice: "NORMAL" }`, `serverErrors: []`, `phaseAfterFirstClick: "ROLLING_DICE"`, `succeededOnFirstClick: true` → **PASS**.
- **`RulebookModal` + `GEMINI_API_KEY=""` + Forced `HTTP 500`:** Mở thành công `"SỔ TAY LUẬT CỜ TỶ PHÚ 3D"`, chặn `4` request `/api/bot-quip` trả `500`, cả 3 Bot vẫn hoàn tất vòng và trả lượt về Người chơi với `pageErrors: []` → **PASS**.
- **Online 4 Người Thật (`4 Browser Contexts`):** Cả 4 cửa sổ đồng bộ số dư (`1,944,000 / 1,986,000 / 2,000,000 / 2,000,000`), tiền thuê `+14,000 / -14,000`, `all4HudIdentical: true`, `consoleErrors: [[], [], [], []]` → **PASS**.
- **Mạng Trễ `700ms RTT` + F5 Reload Giữa Nhảy Quân:** Tự động nối lại đúng modal **Phan Thiết** (`recoveredPhanThietModal: true`, `hostErrors: []`) → **PASS**.

### 3.3 Headed Chrome FPS & Offline Clock Benchmark ([`scripts/gameplay-audit/pw-fps-and-clock-benchmark.ts`](../../scripts/gameplay-audit/pw-fps-and-clock-benchmark.ts))
- **`BUG-10` tại 5 mức FPS (100% thuần RAF, `rafFallbackMs = 500ms`):** `60 FPS = 5,793ms (253f)`, `30 FPS = 5,538ms (87f)`, `15 FPS = 5,680ms (58f)`, `5 FPS = 5,650ms (23f / 4.1 FPS)`, `2.5 FPS = 6,102ms (14f / 2.3 FPS)` — 5/5 đáp đúng **Phan Thiết**, `0` console error → **PASS**.
- **`BUG-10` Hidden/Occluded Tab:** Đổ xúc xắc mở modal khi bị che tab (`buyModalOpenWhileHidden: true`, `10,524ms`), 3 lượt Bot hoàn thành trả lượt về người chơi (`rollBtnReturnedToHuman: true`, `23,578ms`, chỉ `33` WebGL frames — giảm `65%` so với bản nháp 120ms) → **PASS**.
- **`BUG-03` Offline Clock 61.0s:** `clockStart: 1199`, `clockEnd: 1138`, `clockElapsed: 61s`, `lostSeconds: 0.0s` (`-0.06%`), `clockFrozenDuringPause: true` → **PASS**.

---

## 4. Danh Sách Bộ Test Mới Đã Đưa Vào Repository

1. [`src/game/gameplayClock.test.ts`](../../src/game/gameplayClock.test.ts) — 4 unit tests hồi quy cho `BUG-03` (gồm bảo toàn `carryMs` ở `ensureFloor(..., wasActive)`).
2. [`src/game/graphicsQuality.test.ts`](../../src/game/graphicsQuality.test.ts) — 3 unit tests hồi quy mới cho `BUG-10` (`computeBoardFrameDeltas`, single-flight fallback và chống preemption 5/2.5 FPS + chống rò idle `handleVisibilityChange`).
3. [`src/game/rules.test.ts`](../../src/game/rules.test.ts) — 5 unit tests hồi quy mới cho `BUG-05` (kèm tie-break `effectiveCashByPlayerId` + `laps`), `BUG-11`, `BUG-08`, `BUG-07`.
4. [`src/server/roomManager.test.ts`](../../src/server/roomManager.test.ts) — 8 integration tests hồi quy mới cho `BUG-02`, `BUG-01`, `BUG-06`, `BUG-04`, `BUG-05`, `BUG-09`, `Audit Hardening`, và `Review Round 2` (scoping `actionId` theo từng người chơi, reconnect bảo toàn tương tác một phần + sàn 18s, invalid buyout, đồng thời reconnect + `TIME_LIMIT` giữa nợ).
5. [`src/utils/onlineClient.test.ts`](../../src/utils/onlineClient.test.ts) — cập nhật `BUG-30c & BUG-04` + thêm test chống socket cũ `onclose` làm mất đồng bộ socket mới.
6. [`src/server/simulation.test.ts`](../../src/server/simulation.test.ts) — suite simulation có seed chạy tự động trong `npm test` (10 trận qua cả 5 chế độ chơi + kiểm tra toàn bộ bất biến).
7. [`e2e/online-resilience.spec.ts`](../../e2e/online-resilience.spec.ts) — 4 kịch bản Playwright Chrome headed cho `BUG-04`, `BUG-06`, `BUG-02`, `BUG-11`, `BUG-03`, `BUG-10`.
8. [`scripts/gameplay-audit/`](../../scripts/gameplay-audit/) — 4 script kiểm chứng có thể tái lập (`sim.ts`, `probes.ts`, `pw-fps-and-clock-benchmark.ts`, `pw-online-and-matrix-audit.ts`).
