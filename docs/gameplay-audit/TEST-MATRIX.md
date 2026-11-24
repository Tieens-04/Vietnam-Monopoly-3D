# TEST MATRIX — Post-Remediation Verification (2026-11-24)

Quy ước trạng thái nghiêm ngặt:
- **PASS:** Đã trực tiếp thực thi lại trên mã nguồn **sau khi hoàn tất sửa 11/11 lỗi** và có bằng chứng đầu ra khớp kỳ vọng (không tái sử dụng dữ liệu PASS cũ).
- **FAIL:** Tái hiện lỗi thực tế.
- Mọi lượt chạy Playwright đều mở trình duyệt trực tiếp (**Chrome Headed Mode**, `--headed` / `headless: false`).

---

## A. Các lệnh kiểm tra nền tảng bắt buộc (Post-Fix Fresh Run)

| ID | Lệnh thực thi | Kết quả trước sửa (`515feab`) | Kết quả sau sửa (Fresh Run) | Trạng thái |
|---|---|---|---|---|
| **A1** | `npm run lint` (`tsc --noEmit`) | PASS (`0` lỗi) | **PASS (`0` lỗi TS trên toàn `src/`, `e2e/`, `scripts/gameplay-audit/`)** | **PASS** |
| **A2** | `npm test` | `84/84` PASS (`~20s`) | **`106/106` PASS (`55.3s`, `0` fail — gồm 11 bug regressions + `simulation.test.ts` + `Audit Hardening` + 5 Round 2 tests)** | **PASS** |
| **A3** | `npm run build` | PASS (`4.32s`, `1,345.24 kB`) | **PASS (`0.71s`, `dist/assets/index-Cn4B17R8.js` `1,352.48 kB` + `server.js`)** | **PASS (kèm warning bundle)** |
| **A4** | `npx playwright test --headed` | `41/41` PASS (`11.7m`) | **`45/45` PASS (`13.0m`, `0` fail — chạy trọn vẹn sau bản sửa mã cuối cùng)** | **PASS** |

---

## B. Simulation Bot-vs-Bot 190 Trận — Đúng Dải Seed Baseline (`scripts/gameplay-audit/sim.ts --all-190`)

| ID | Cấu hình trận đấu | Dải Seed | Hoàn thành | Bị kẹt | Vi phạm bất biến | Lượt (`min / med / max / avg`) | Phân bố điều kiện kết thúc & Đối chiếu Baseline | Trạng thái |
|---|---|---|---|---|---|---|---|---|
| **B1** | 4 Bot FFA, Tactical OFF, Festival OFF | `2000–2039` | **40/40** | `0` | `0` | `33 / 81 / 161 / 82` | `LAST_STANDING: 16`, `TRIPLE_MONOPOLY: 15`, `RESORT_MONOPOLY: 7`, `SIDE_MONOPOLY: 2` *(khớp 100% baseline)* | **PASS** |
| **B2** | 4 Bot FFA, Tactical ON, Festival ON | `3000–3029` | **30/30** | `0` | `0` | `38 / 85 / 121 / 83` | `TRIPLE_MONOPOLY: 12`, `LAST_STANDING: 9`, `RESORT_MONOPOLY: 8`, `SIDE_MONOPOLY: 1` *(khớp 100% baseline)* | **PASS** |
| **B3** | 2 Bot FFA | `4000–4029` | **30/30** | `0` | `0` | `9 / 48 / 107 / 48` | `LAST_STANDING: 18`, `RESORT_MONOPOLY: 5`, `TRIPLE_MONOPOLY: 5`, `SIDE_MONOPOLY: 2` *(khớp 100% baseline)* | **PASS** |
| **B4** | 4 Bot `TEAMS_2V2`, Tactical ON | `5000–5029` | **30/30** | `0` | `0` | `10 / 49 / 132 / 52` | `TRIPLE_MONOPOLY: 19`, `RESORT_MONOPOLY: 7`, `LAST_STANDING: 3`, `SIDE_MONOPOLY: 1` (`DEBT_RESOLUTION` `70→60` do `BUG-08` bảo vệ độc quyền đội!) | **PASS** |
| **B5** | 3 Bot FFA, Festival ON | `6000–6019` | **20/20** | `0` | `0` | `27 / 59 / 109 / 58` | `LAST_STANDING: 12`, `TRIPLE_MONOPOLY: 4`, `RESORT_MONOPOLY: 4` *(khớp 100% baseline)* | **PASS** |
| **B6** | Đo công bằng lợi thế ghế (4 Bot FFA) | `7000–7039` | **40/40** | `0` | `0` | `51 / 101 / 163 / 101` | Thắng theo ghế `0 / 1 / 2 / 3` = **`10 / 10 / 9 / 11`** *(khớp 100% baseline)* | **PASS** |

---

## C. Kiểm Thử Tất Định (`scripts/gameplay-audit/probes.ts` + Unit Tests)

| ID | Kịch bản kiểm tra | Kết quả trước sửa | Kết quả sau sửa (Fresh Run) | Trạng thái |
|---|---|---|---|---|
| **C1** | Người chơi B gửi `ROLL_DICE` trái lượt | `NOT_YOUR_TURN` | `bErrCodes: ["NOT_YOUR_TURN"]` | **PASS** |
| **C2** | Gửi `ROLL_DICE` trùng lặp (`actionId`) | Không dedup `actionId` | `DUPLICATE_ACTION`, chỉ tung đúng 1 lần (`BUG-04`) | **PASS** |
| **C3** | Gửi `BUY_PROPERTY` lệch phase ở `AWAIT_ROLL` | Bỏ qua im lặng (`BUG-06`) | Trả ngay `ERROR: INVALID_STATE` (`BUG-06`) | **PASS** |
| **C4** | Gửi payload sai phạm vi (`initialLevel: 99`, bán trùng ô) | Chặn nhưng vẫn reset AFK | Trả `INVALID_ACTION`, giữ nguyên modal (`BUG-07`), **không** reset `missedTurnsByPlayer` (`Audit Hardening`) | **PASS** |
| **C5** | Gửi `GAME_ACTION` có `expectedTurnCount` / `decisionRevision` cũ | Không kiểm tra (`BUG-04`) | Trả ngay `ERROR: STALE_ACTION` (`BUG-04`) | **PASS** |
| **C6** | AFK duy nhất Lượt 1 (`AWAIT_ROLL` + `BUY_DECISION`) | Takeover sớm ở Lượt 1 (`BUG-01`) | Sau Lượt 1: `p0IsBot: false, p0Missed: 1`; chỉ takeover sau Lượt 3 (`p0Missed: 2, p0IsBot: true`) | **PASS** |
| **C7** | Phòng `TEAMS_2V2` người thật ghế `0` & `2`, Bot bù ghế `1` & `3` | `[0, 0, 1, 1]` (`BUG-02`) | `["A(id=0,team=0,human)", "Chủ Tịch Lan Anh(id=1,team=1,bot)", "C(id=2,team=0,human)", "Phu Nhân Ngọc Diệp(id=3,team=1,bot)"]`, `teamsAlternate: true` | **PASS** |
| **C8** | Hết giờ `20:00` giữa `DEBT_RESOLUTION` (`900K` nợ P1) | Bỏ qua nợ (`BUG-05`) | `winnerId: 1`, `effectiveNetWorths: { 0: 600000, 1: 1900000 }`, `pendingDebtCleared: true` | **PASS** |
| **C9** | `computeOptimalAutoSale` ở `TEAMS_2V2` với độc quyền/Resort đồng đội | Phá vỡ độc quyền đội (`BUG-08`) | `soldTiles: [5]`, `protectedTeamBrownMonopoly: true` | **PASS** |
| **C10** | Rớt `botActionTimer` ở lượt Bot Online | Kẹt ở `00:00` (`BUG-09`) | `rescheduledByWatchdog: true`, `returnedToHuman: true`, `0` double roll | **PASS** |

---

## D & F. Kiểm Thử Trực Tiếp Trên Trình Duyệt Chrome Headed (Post-Fix Fresh Runs)

| ID | Chế độ | Kịch bản kiểm thử | Kết quả trước sửa | Kết quả sau sửa (Fresh Run & Script) | Trạng thái |
|---|---|---|---|---|---|
| **D1** | Offline (`Human + 3 Bot`) | Độ chính xác đồng hồ trận 20:00 qua các chuyển pha liên tục | Trôi chậm **`28.3%`** (`26s / 92s`) (`BUG-03`) | Sau **`61.0s`** thực, đồng hồ giảm **`61s`** (`1199 → 1138`, `lostSeconds: 0.0s`, `-0.06%`), `0` lỗi (`pw-fps-and-clock-benchmark.ts`, `e2e/online-resilience.spec.ts`) | **PASS** |
| **D2** | Offline (`Pass & Play`) | Chống bấm đúp `Đổ Xúc Xắc` / `Space` | PASS | PASS (`e2e/business-tour-rules-and-ui.spec.ts`, `e2e/responsive-a11y-webgl.spec.ts`) | **PASS** |
| **D3** | Offline (`Pass & Play`) | Pause `Esc` giữa lúc di chuyển 3.5s → Resume | PASS | `pausedState: "paused"`, `clockFrozenDuringPause: true`, `totalWith3500msPauseMs: 9583ms`, đáp đúng **Phan Thiết** (`pw-fps-and-clock-benchmark.ts`, `BUG-48` E2E) | **PASS** |
| **D4** | Offline (`Hotseat` & `Human + 3 Bot`) | Tab nền / bị tab khác che (bật throttling trình duyệt gốc) | `buyModalOpenWhileHidden: false`, `rollBtnReturnedToHuman: false` (`BUG-10`) | **`buyModalOpenWhileHidden: true`** (`10,524ms`), **`rollBtnReturnedToHuman: true`** sau 3 lượt Bot (`23,578ms`, chỉ `33` WebGL frames) (`pw-fps-and-clock-benchmark.ts`) | **PASS** |
| **D5 / F1** | **Online 4 Người Chơi Thật** | 4 cửa sổ Chrome tạo/vào phòng, mua đất, trả tiền thuê chéo, đồng bộ HUD | PASS | `roomCode: XUZXGH`, `all4HudIdentical: true`, cả 4 máy khớp số dư `1,944,000 / 1,986,000 / 2,000,000 / 2,000,000` (`+14,000 / -14,000`), `consoleErrors: [[],[],[],[]]` (`pw-online-and-matrix-audit.ts`) | **PASS** |
| **D6 / F2** | **Online Người + Bot & `2v2` Ghế Rỗng + `RECLAIM_CONTROL`** | Ghế trống không liên tục 2v2, AFK 1 lượt vs 2 lượt, giành lại quyền | `BUG-01`, `BUG-02` FAIL | Thứ tự HUD khớp `HostSeat0 → AI → GuestSeat2 → AI` (`e2e/online-resilience.spec.ts`); `BUG-01` 1 lượt AFK `isBot: false` (`pw-online-and-matrix-audit.ts`) | **PASS** |
| **D9** | Offline Interactive UI, Audio, WebGL | RulebookModal, Audio fault tolerance, WebGL context loss/restore | PASS | `RulebookModal` PASS, `BUG-44` WebGL restore PASS, `BUG-54a/54b` Audio PASS (`e2e/responsive-a11y-webgl.spec.ts`) | **PASS** |
| **F3** | **Online Mạng Trễ `700ms RTT` + F5 Reload Giữa Nhảy Quân** | Bơm trễ `700ms RTT`, bấm đổ, nhấn F5 reload giữa lúc quân nhảy 11 ô | PASS | `recoveredPhanThietModal: true`, `hostErrors: []` (`pw-online-and-matrix-audit.ts`), `Online action lock` PASS (`responsive-a11y-webgl.spec.ts` #44) | **PASS** |
| **F4** | **Online Reconnect Stale Action (`BUG-04`)** | Mất WS Lượt 1, bấm `Space` + click `Đổ` lúc offline → vào Đảo Hoang → nối lại Lượt 3 | FAIL (`reproduced: true`, mất trắng Lượt 3) | **`staleActionReplayed: false`**, `sentWire` chỉ có `CREATE_ROOM`, `START_MATCH`, `RECONNECT_ROOM`, giữ nguyên `turnCount: 3, hostJailTurns: 0` (`pw-online-and-matrix-audit.ts`, `e2e/online-resilience.spec.ts`) | **PASS** |
| **F5** | **FPS Thấp (`60 / 30 / 15 / 5 / 2.5 FPS`) + Đổi Nóng Graphics Quality** | Đo thời lượng xúc xắc + 11 bước tới Phan Thiết tại 5 mức FPS + đổi `low→medium→high→low` | PARTIAL (`15.9s` ở 5 FPS, `32.7s` thất bại ở 2.5 FPS) | **`60 FPS: 5,793ms (253f)` · `30 FPS: 5,538ms (87f)` · `15 FPS: 5,680ms (58f)` · `5 FPS: 5,650ms (23f / 4.1 FPS)` · `2.5 FPS: 6,102ms (14f / 2.3 FPS)`**, 5/5 đáp đúng **Phan Thiết**; `tiersObserved: ["low","medium","high","low"]`; idle Low `3` draws/3s (`pw-fps-and-clock-benchmark.ts`) | **PASS** |
| **F6** | **Bot vs Bot** | Tự chơi qua UI & 190 trận simulation không tương tác | PASS | `190/190` sim PASS + `business-tour-gameplay.spec.ts` #6 PASS (`1 Human vs 3 Bots`) | **PASS** |
| **F7** | **Không có `GEMINI_API_KEY` & Giả lập `HTTP 500`** | Chặn `/api/bot-quip` trả `500` (`4` requests) + mở `RulebookModal` | PASS | `rulebookTitle: "SỔ TAY LUẬT CỜ TỶ PHÚ 3D"`, `forced500Count: 4`, `turnReturnedToHumanCleanly: true`, `pageErrors: []` (`pw-online-and-matrix-audit.ts`) | **PASS** |
| **F8** | **Online Tactical Dice Reset tại Đảo Hoang (`BUG-11`)** | Lượt 1 chọn `Chẵn`, hết giờ vào Đảo Hoang → Lượt 3 bấm `bt-jail-roll-btn` 1 lần | FAIL (`INVALID_ACTION`, nuốt cú bấm đầu) | Gửi `diceChoice: "NORMAL"`, `serverErrors: []`, `phaseAfterFirstClick: "ROLLING_DICE"`, **`succeededOnFirstClick: true`** (`pw-online-and-matrix-audit.ts`, `e2e/online-resilience.spec.ts`) | **PASS** |
