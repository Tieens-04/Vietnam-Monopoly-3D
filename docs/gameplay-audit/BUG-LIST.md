# BUG LIST — Comprehensive Gameplay Audit (2026-11-24)

Phân loại mức độ nghiêm trọng theo Mục 10:
- **P0 – Critical:** Crash game, treo/deadlock không thể tiếp tục trận đấu, sai lệch trạng thái nghiêm trọng hoặc lỗ hổng phá vỡ tính toàn vẹn của trận đấu.
- **P1 – High:** Sai luật chơi, sai giao dịch, sai lượt, lỗi multiplayer hoặc cơ chế gameplay chính hoạt động sai.
- **P2 – Medium:** Trải nghiệm gameplay không nhất quán, edge case thực tế, lỗi đồng bộ animation/thời gian hoặc hành vi reconnect/UI ảnh hưởng đến khả năng chơi.
- **P3 – Low:** Lỗi nhỏ về phản hồi biên, nhất quán nội bộ Offline/Online, tối ưu heuristic phụ của Bot hoặc rủi ro tiềm ẩn (latent).

> Nguyên tắc deduplication: **Mỗi mục dưới đây đại diện cho đúng một root cause duy nhất.** Mỗi lỗi ghi đầy đủ **12 trường bắt buộc**.

**Tổng hợp (Sau điều chỉnh mức độ ưu tiên & khắc phục 2026-11-24):**
- **Phân bố mức độ (đã nâng `BUG-04` P2→P1, `BUG-05` P3→P1):** `0 × P0` · `4 × P1` · `3 × P2` · `4 × P3` (Tổng cộng: **11 lỗi**)
- **Trạng thái hiện tại:** **11/11 ĐÃ KHẮC PHỤC & XÁC MINH (`FIXED & VERIFIED`)** + **Audit Hardening** + **Independent Review Round 2 (7 lỗi biên + 5 regression tests mới → `106/106` `npm test`, `45/45` headed E2E)** (chi tiết triển khai tại [`BUG-FIX-REPORT.md`](./BUG-FIX-REPORT.md) và bằng chứng chạy lại tại [`REGRESSION-TEST-REPORT.md`](./REGRESSION-TEST-REPORT.md)).

| Bug ID | Severity (Cập nhật) | Wave | Trạng thái | Bản vá chính | Regression Test |
|---|---|---|---|---|---|
| **BUG-01** | **P1 – High** | Wave 1 | **FIXED & VERIFIED** | `src/server/roomManager.ts` (`lastMissedTurnCountByPlayer`, `lastHumanActionTurnCountByPlayer`, `ensureSubPhaseTimeFloor`, `Audit Hardening`) | `roomManager.test.ts` (`BUG-01`, `Review Round 2`), `scripts/gameplay-audit/probes.ts`, `pw-online-and-matrix-audit.ts` |
| **BUG-02** | **P1 – High** | Wave 1 | **FIXED & VERIFIED** | `src/server/roomManager.ts` (`startMatch` 1 vòng lặp theo `seatIdx`) | `roomManager.test.ts` (`BUG-02`), `e2e/online-resilience.spec.ts` |
| **BUG-03** | **P2 – Medium** | Wave 2 | **FIXED & VERIFIED** | `src/game/gameplayClock.ts` *(mới)*, `src/App.tsx` | `gameplayClock.test.ts` (4 tests), `e2e/online-resilience.spec.ts`, `pw-fps-and-clock-benchmark.ts` |
| **BUG-04** | **P1 – High** *(↑ P2→P1)* | Wave 1 | **FIXED & VERIFIED** | `src/game/onlineTypes.ts`, `src/server/roomManager.ts` (`decisionRevision` + per-player `actionId`), `src/utils/onlineClient.ts` (`isSynced` + stale WS guard), `src/App.tsx`, `src/components/ActionDock.tsx` | `roomManager.test.ts` (`BUG-04`, `Review Round 2`), `onlineClient.test.ts` (`BUG-30c & BUG-04`, `BUG-04 Review Round 2`), `e2e/online-resilience.spec.ts`, `pw-online-and-matrix-audit.ts` |
| **BUG-05** | **P1 – High** *(↑ P3→P1)* | Wave 1 | **FIXED & VERIFIED** | `src/game/types.ts`, `src/game/rules.ts` (`computeEffectiveNetWorths`, `effectiveCashByPlayerId` + `laps`), `src/server/roomManager.ts`, `src/App.tsx`, `src/components/TileModalAndDialogs.tsx` | `rules.test.ts` (`BUG-05 (Audit)`, `BUG-05 Review Round 2`), `roomManager.test.ts` (`BUG-05 (Audit)`, `Review Round 2`), `scripts/gameplay-audit/probes.ts` |
| **BUG-06** | **P3 – Low** | Wave 1 | **FIXED & VERIFIED** | `src/server/roomManager.ts` (`rejectInvalidState` / `INVALID_ACTION`) | `roomManager.test.ts` (`BUG-06`), `e2e/online-resilience.spec.ts` |
| **BUG-07** | **P3 – Low** | Wave 3 | **FIXED & VERIFIED** | `src/game/rules.ts` (`validateInitialPropertyPurchase`, `validateChampionshipHostSelection`, `canBuyoutProperty`), `src/App.tsx`, `src/server/roomManager.ts` (`performConfirmBuyout`) | `rules.test.ts` (`BUG-07`), `roomManager.test.ts` (`Audit Hardening`, `Review Round 2`) |
| **BUG-08** | **P3 – Low** | Wave 3 | **FIXED & VERIFIED** | `src/game/rules.ts` (`computeOptimalAutoSale`), `roomManager.ts`, `App.tsx`, `TileModalAndDialogs.tsx` | `rules.test.ts` (`BUG-08`), `scripts/gameplay-audit/probes.ts`, `sim.ts --all-190` (`B4`) |
| **BUG-09** | **P3 – Low (Latent)** | Wave 3 | **FIXED & VERIFIED** | `src/server/roomManager.ts` (`runBotWatchdogIfNeeded`, `inFlightBeatCount`, `botScheduledMeta`) | `roomManager.test.ts` (`BUG-09`), `scripts/gameplay-audit/probes.ts` |
| **BUG-10** | **P2 – Medium** | Wave 2 | **FIXED & VERIFIED** | `src/game/graphicsQuality.ts` (`computeBoardFrameDeltas`, single-flight RAF fallback `500ms`), `src/components/MonopolyCanvas.tsx`, `src/App.tsx` | `graphicsQuality.test.ts` (3 tests), `e2e/online-resilience.spec.ts`, `pw-fps-and-clock-benchmark.ts` (60/30/15/5/2.5 FPS) |
| **BUG-11** | **P2 – Medium** | Wave 2 | **FIXED & VERIFIED** | `src/game/rules.ts` (`normalizeTacticalDiceChoice`), `src/App.tsx`, `src/components/ActionDock.tsx` | `rules.test.ts` (`BUG-11`), `e2e/online-resilience.spec.ts`, `pw-online-and-matrix-audit.ts` |

---

> **Lưu ý về hồ sơ gốc bên dưới (Baseline `515feab`):** Toàn bộ 11 mục chi tiết bên dưới (`BUG-01` → `BUG-11`) giữ nguyên mô tả tái hiện, số dòng mã nguồn và bằng chứng kiểm toán ban đầu tại commit `515feab` (các script tái lập đã được chuyển từ `%TEMP%/audit/` vào `scripts/gameplay-audit/` — xem Phụ lục cuối trang) để đảm bảo đối chiếu Before/After minh bạch. **Tất cả 11/11 lỗi hiện đã có trạng thái `FIXED & VERIFIED`**; mức độ ưu tiên cập nhật của `BUG-04` và `BUG-05` (`P1 – High`) được đánh dấu rõ tại từng mục và chi tiết bản vá cuối cùng nằm tại [`BUG-FIX-REPORT.md`](./BUG-FIX-REPORT.md).

## BUG-01 — AFK Takeover đếm theo từng lần hết giờ *phase* thay vì hết giờ *lượt*

1. **Bug ID:** `BUG-01` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P1 – High**
3. **Gameplay mode:** Online Multiplayer (FFA & 2v2, mọi số lượng người chơi)
4. **Description:** Biến đếm `missedTurnsByPlayer[active.id]` tăng lên `+1` ở **mỗi lần hết giờ của một sub-phase** trong `tickOneSecond`, thay vì mỗi *lượt chơi* bị bỏ qua. Do một lượt có thể đi qua nhiều phase có đồng hồ đếm ngược (`WORLD_TOUR` → `AWAIT_ROLL` → `REROLL_DECISION` → `BUY_DECISION` / `CARD_REVEAL` / `DEBT_RESOLUTION`), một người chơi chỉ AFK trong **duy nhất lượt đầu tiên** đã chạm ngưỡng `missed >= 2` ngay ở giây ~62 và bị Bot AI chiếm quyền điều khiển ngay trong Lượt 1 (thậm chí nhanh hơn cả ngưỡng 90 giây mất kết nối mạng).
5. **Steps to reproduce:**
   1. Tạo phòng Online 2 người chơi thật (`fillBots: false`, `tacticalDiceEnabled: false`).
   2. Bắt đầu ván đấu. Người chơi 1 (Host) ở `AWAIT_ROLL` không thao tác.
   3. Sau 45 giây hết giờ `AWAIT_ROLL`, server tự động đổ xúc xắc (ví dụ ra `1 + 2 = 3`, dừng tại Đà Lạt đang trống) và chuyển sang `BUY_DECISION` (đồng hồ lượt đặt sàn 18 giây).
   4. Tiếp tục không thao tác thêm 18 giây.
6. **Expected behavior:** Hết Lượt 1 của Người chơi 1 mới tính là `1` lượt AFK (`isBot === false`). Chỉ khi tới lượt kế tiếp của chính Người chơi 1 mà tiếp tục hết giờ lần thứ 2 liên tiếp thì mới kích hoạt Bot AI tiếp quản (`"AFK 2 lượt liên tiếp"`).
7. **Actual behavior:** Ngay khi `BUY_DECISION` của Lượt 1 hết giờ (tổng ~62 giây thực), `missedTurnsByPlayer[0]` tăng lên `2`, `active.isBot = true`, `active.onlineBotTakeover = true` ngay khi kết thúc Lượt 1, kèm dòng nhật ký sai sự thật: `"🤖 A AFK 2 lượt liên tiếp — Bot AI tạm thời tiếp quản!"`. Nếu bật Xúc xắc chiến thuật (`REROLL_DECISION`), takeover còn xảy ra ngay giữa Lượt 1 trước cả khi quân cờ di chuyển.
8. **Root cause:** Khối xử lý timeout trong `tickOneSecond` tăng trực tiếp `match.missedTurnsByPlayer[active.id]` cho mọi `turnPhase` khi `match.turnTimeLeft === 0`, không gắn khóa theo số thứ tự lượt (`match.turnCount`).
9. **Source file and line number:** `src/server/roomManager.ts:3296-3312`
10. **Evidence:**
    - Chạy deterministic probe `C:\Users\nguye\AppData\Local\Temp\audit\probes.ts` (`probeAfkSingleTurn`):
      ```json
      {
        "p0IsBot": true,
        "turnAtStart": 1,
        "takeoverTurn": 2,
        "timeline": [
          "0:AWAIT_ROLL:t1:missed=0",
          "44:BUY_DECISION:t1:missed=1",
          "62:AWAIT_ROLL:t2:missed=2"
        ],
        "log": ["🤖 A AFK 2 lượt liên tiếp — Bot AI tạm thời tiếp quản!"]
      }
      ```
    - Tái hiện thực tế trên trình duyệt Chrome headed ở `C:\Users\nguye\AppData\Local\Temp\audit\pw_online_deep_audit.json` (`onlineHumansAndBotsF2`: `botTookOverP0: true` ngay trong cùng lượt đầu tiên của P0).
11. **Proposed solution:** Lưu thêm bản đồ `lastMissedTurnCountByPlayer: Record<number, number>` trong `MatchRecord`. Khi `turnTimeLeft` về `0` với `!active.isBot`, chỉ tăng `missedTurnsByPlayer[active.id]` nếu `lastMissedTurnCountByPlayer[active.id] !== match.turnCount`, sau đó gán `lastMissedTurnCountByPlayer[active.id] = match.turnCount`. Giữ nguyên cơ chế reset về `0` khi người chơi chủ động gửi `GAME_ACTION` hợp lệ.
12. **Regression test:** Bổ sung test trong `src/server/roomManager.test.ts` (với `enableTickInterval: false`, `diceRng` cố định ra `[1, 2]` vào Đà Lạt): tick qua toàn bộ Lượt 1 của P0 (cả `AWAIT_ROLL` + `BUY_DECISION`), assert `players[0].isBot === false` và `missedTurnsByPlayer[0] === 1`; sau khi P1 hoàn tất Lượt 2, tick hết `AWAIT_ROLL` ở Lượt 3 của P0 mới assert `players[0].isBot === true`.

---

## BUG-02 — Thứ tự lượt Online xếp toàn bộ người thật trước Bot, làm hỏng luân phiên đội 2v2 và lệch góc HUD/Kho bạc

1. **Bug ID:** `BUG-02` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P1 – High**
3. **Gameplay mode:** Online Multiplayer (nghiêm trọng nhất ở `TEAMS_2V2` có Bù Bot; cũng làm lệch thứ tự ghế, góc thẻ HUD và khay tiền 3D ở `FFA`)
4. **Description:** Khi bắt đầu trận Online (`startMatch`), server khởi tạo mảng `players` bằng 2 vòng lặp tách rời: đẩy toàn bộ `room.humans` vào trước (`id = 0..H-1`) rồi mới đẩy toàn bộ Bot bù ghế trống vào sau (`id = H..maxPlayers-1`). Trong khi đó, `teamId` của người thật lại tính theo `h.seatIndex % 2` và `teamId` của Bot tính theo `emptySeatIndices[b] % 2`. Vì `getNextActivePlayerIndex` duyệt tuần tự theo chỉ số mảng `players` (`0 → 1 → 2 → 3`), nếu 2 người thật ngồi ở ghế chẵn (`seatIndex = 0` và `seatIndex = 2`), thứ tự lượt biến thành **Đội A → Đội A → Đội B → Đội B** thay vì luân phiên **Đội A → Đội B → Đội A → Đội B**, đồng thời đẩy người chơi ở Ghế 2 sang góc HUD số 1 (`PlayerHUD.tsx:542`) và khay tiền 3D số 1 (`treasurySystem.ts:701`).
5. **Steps to reproduce:**
   1. Host tạo phòng Online `Đấu Đội 2v2` (`maxPlayers = 4`, `fillBots = true`) → Host ngồi ghế `0` (Đội A).
   2. Người chơi B vào phòng → ngồi ghế `1` (Đội B).
   3. Người chơi C vào phòng → ngồi ghế `2` (Đội A).
   4. Người chơi B bấm Rời Phòng ở sảnh → ghế `1` trống (sẽ do Bot bù), còn người thật ở ghế `0` và `2`.
   5. Host bấm Bắt Đầu Ván Đấu.
6. **Expected behavior:** Thứ tự người chơi trong trận phải giữ đúng thứ tự ghế ở sảnh `0 → 1 → 2 → 3` (`Host [Đội A] → Bot 1 [Đội B] → C [Đội A] → Bot 2 [Đội B]`), đảm bảo hai đội luân phiên lượt chơi công bằng và đúng vị trí ghế trên bàn cờ.
7. **Actual behavior:** Thứ tự mảng `players` và thứ tự lượt thực tế trở thành: `Host (team 0) → C (team 0) → Bot 1 (team 1) → Bot 2 (team 1)`. Đội A được đi 2 lượt liên tiếp ngay đầu trận để thâu tóm đất và độc quyền trước Đội B.
8. **Root cause:** `startMatch` không duyệt theo `seatIndex = 0 .. room.maxPlayers - 1` mà nối mảng `sortedHumans` trước rồi mới nối mảng `botCount` sau.
9. **Source file and line number:** `src/server/roomManager.ts:1090-1145` (kết hợp duyệt tuần tự tại `src/game/rules.ts:1072-1084`, hiển thị HUD tại `src/components/PlayerHUD.tsx:542`, và gán khay tiền 3D tại `src/three/treasurySystem.ts:701`)
10. **Evidence:**
    - Output từ `C:\Users\nguye\AppData\Local\Temp\audit\probes.ts` (`probe2v2TurnOrder`):
      ```json
      {
        "turnOrder": [
          "A(team0)",
          "C(team0)",
          "Chủ Tịch Lan Anh(team1,bot)",
          "Phu Nhân Ngọc Diệp(team1,bot)"
        ]
      }
      ```
11. **Proposed solution:** Trong `startMatch` (`src/server/roomManager.ts:1090-1145`), duyệt `for (let seatIdx = 0; seatIdx < room.maxPlayers; seatIdx++)`: nếu có `human` tại `seatIdx` thì đẩy human đó vào `players` với `id = players.length` và gán `human.playerId = id`; ngược lại nếu `room.fillBots` bật thì tạo Bot tại đúng vị trí đó với `teamId = seatIdx % 2`.
12. **Regression test:** Thêm unit test trong `src/server/roomManager.test.ts`: tạo phòng `TEAMS_2V2` (`fillBots: true`), cho B join ghế 1, C join ghế 2, B `LEAVE_ROOM`, rồi `START_MATCH`; assert `match.players.map(p => p.teamId)` bằng `[0, 1, 0, 1]` và `match.players.map(p => p.isBot)` bằng `[false, true, false, true]`.

---

## BUG-03 — Đồng hồ trận 20:00 và đồng hồ lượt 45s ở Offline chạy chậm ~28.3% do reset `setInterval`

1. **Bug ID:** `BUG-03` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P2 – Medium**
3. **Gameplay mode:** Offline (`Human vs Bot`, `Bot vs Bot`, `Pass & Play`)
4. **Description:** Hai `useEffect` quản lý đồng hồ tổng trận đấu (`matchTimeLeft`, mặc định `1200s = 20:00`) và đồng hồ đếm ngược lượt chơi (`turnTimeLeft`, `45s`) ở chế độ Offline đều đưa `turnPhase` vào mảng dependency. Mỗi khi `turnPhase` chuyển trạng thái (`AWAIT_ROLL` → `ROLLING_DICE` → `MOVING_TOKEN` → `BUY_DECISION` → `AWAIT_ROLL`...), `window.setInterval(..., 1000)` bị `clearInterval` và khởi tạo lại từ đầu, làm rơi toàn bộ phần mili-giây lẻ chưa tròn 1.000ms. Mọi phase kéo dài dưới 1 giây không làm giảm đồng hồ giây nào.
5. **Steps to reproduce:**
   1. Mở trình duyệt Chrome chạy `http://127.0.0.1:3199/?autostart=1&players=4`.
   2. Chơi bình thường (người chơi đổ xúc xắc, 3 Bot lần lượt đi) trong 92 giây đồng hồ thực (`Date.now()`).
   3. So sánh số giây giảm trên `bt-match-clock` với thời gian thực đã trôi qua.
6. **Expected behavior:** Sau 92 giây thời gian thực (không mở Pause/Rulebook), đồng hồ trận đấu phải giảm xấp xỉ `91–92` giây (sai số ≤ 1–2s). Một ván giới hạn 20 phút kết thúc đúng sau ~20 phút thực.
7. **Actual behavior:** Sau **92 giây thực**, đồng hồ trận chỉ giảm **66 giây** (`1199s → 1133s`, mất 26 giây = **chậm ~28.3%**). Một trận đấu "20 phút" thực tế kéo dài ~27.5–28 phút. (Chế độ Online không bị lỗi này vì server chạy một `setInterval` 1000ms cố định tại `roomManager.ts:237-239, 3213-3215`).
8. **Root cause:** Đưa `turnPhase` vào dependency array của `useEffect` tạo `setInterval(1000)` mà không tích lũy phần dư mili-giây theo `performance.now()`.
9. **Source file and line number:** `src/App.tsx:3850-3865` (đồng hồ trận 20 phút) và `src/App.tsx:3944-3961` (đồng hồ lượt 45 giây)
10. **Evidence:**
    - Dữ liệu đo trực tiếp bằng Playwright Chrome headed trong `C:\Users\nguye\AppData\Local\Temp\audit\pw_offline.json`:
      ```json
      {
        "wallSeconds": 92,
        "clockStart": 1199,
        "clockEnd": 1133,
        "clockElapsed": 66,
        "lostSeconds": 26
      }
      ```
11. **Proposed solution:** Loại `turnPhase` khỏi dependency array của cả hai `useEffect`; đọc `turnPhaseRef.current`, `screenStateRef.current` bên trong callback và dùng bộ tích lũy `lastTickMs = performance.now()` (tick mỗi `250ms`, trừ `1s` mỗi khi tích lũy đủ `>= 1000ms` thời gian hợp lệ) để không mất phần mili-giây lẻ khi chuyển phase hoặc tạm dừng ở `ROLLING_DICE` / `MOVING_TOKEN`.
12. **Regression test:** Thêm test Playwright hoặc fake-timer test chuyển `turnPhase` mỗi `450ms` liên tục trong `10.000ms` và assert `matchTimeLeft` giảm đúng `10 ± 1` giây (và đứng yên khi `screenState === 'paused'`).

---

## BUG-04 — Online client xếp hàng `GAME_ACTION` khi mất mạng và phát lại hành động cũ sang lượt khác sau khi kết nối lại

1. **Bug ID:** `BUG-04` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P1 – High** *(đã nâng từ **P2 – Medium** ở baseline theo điều chỉnh ưu tiên)*
3. **Gameplay mode:** Online Multiplayer
4. **Description:** Khi WebSocket đang bị ngắt hoặc đang kết nối lại (`readyState !== WebSocket.OPEN`), các nút thao tác trên UI (`bt-roll-dice-btn`, modal Mua đất, v.v.) vẫn cho phép bấm, và `onlineClient.sendMessage` đẩy **mọi thông điệp** (bao gồm `GAME_ACTION` và `SEND_EMOTE`) vào `pendingQueueRef`. Ngay khi kết nối mạng khôi phục, `ws.onopen` gửi `RECONNECT_ROOM` rồi lập tức xả toàn bộ `pendingQueueRef` lên server trong cùng mili-giây. Do `OnlineGameAction` không chứa `expectedTurnCount` / `expectedPhase` và server chỉ kiểm tra `turnPhase` + ghế hiện tại, hành động cũ từ lượt trước bị thực thi ngoài ý muốn ở một lượt hoàn toàn khác.
5. **Steps to reproduce:**
   1. Tạo phòng Online 2 người chơi thật (`fillBots: false`). Bắt đầu trận đấu (Lượt 1, Host đứng ở ô `0` BẮT ĐẦU, `turnPhase = 'AWAIT_ROLL'`).
   2. Mạng của Host chập chờn / đứt WebSocket; trong lúc banner đang kết nối lại, Host bấm nút `Đổ Xúc Xắc` → `{ type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } }` nằm chờ trong `pendingQueueRef`.
   3. Trên server, Lượt 1 của Host hết thời gian chờ offline → server tự động đổ xúc xắc đưa Host vào ô `8` **Đảo Hoang** (`inJail = true`) và chuyển sang Lượt 2 cho Người chơi 2.
   4. Người chơi 2 đổ xúc xắc xong Lượt 2 → chuyển sang **Lượt 3** của Host (lúc này Host đang bị giam ở Đảo Hoang với 2M tiền mặt, lẽ ra có quyền chọn `Nộp phạt 200K` để ra đảo).
   5. Mạng của Host khôi phục (Host không bấm bất kỳ nút nào ở Lượt 3).
6. **Expected behavior:** Khi mất mạng, thao tác `GAME_ACTION` không được lưu hàng đợi để phát trễ sang lượt khác (hoặc server phải từ chối `STALE_ACTION` vì `expectedTurnCount = 1 !== currentTurnCount = 3`). Khi kết nối lại ở Lượt 3, Host phải thấy giao diện Đảo Hoang để tự quyết định nộp phạt 200K, dùng thẻ hoặc đổ đôi.
7. **Actual behavior:** Ngay khoảnh khắc `ws.onopen` khôi phục ở Lượt 3, `onlineClient` gửi `RECONNECT_ROOM` kèm theo `GAME_ACTION: ROLL_DICE` cũ của Lượt 1 trong cùng một mili-giây. Server chấp nhận lệnh `ROLL_DICE` đó tại Đảo Hoang, tự đổ trượt đôi (`jailTurns` tăng lên `1`) và mất trắng Lượt 3 của Host sang Lượt 4 trước khi Host kịp nhìn thấy màn hình. Ngoài ra, nếu mất mạng >6s, `submitOnlineDecision` tự mở khóa nút cho phép người dùng bấm nhiều lần và dồn nhiều `GAME_ACTION` vào `pendingQueueRef`.
8. **Root cause:** (1) `onlineClient.ts` dùng chung `pendingQueueRef` (vốn thiết kế cho `CREATE_ROOM`/`JOIN_ROOM` lúc mới mở socket lần đầu) cho cả `GAME_ACTION` trong trận; (2) `OnlineGameAction` thiếu khóa phiên quyết định (`expectedTurnCount`, `expectedPhase`).
9. **Source file and line number:** `src/utils/onlineClient.ts:147-161`, `src/utils/onlineClient.ts:265-276`, `src/game/onlineTypes.ts:74-139`, `src/server/roomManager.ts:1202-1424`, `src/App.tsx:486-505`
10. **Evidence:**
    - Đã tái hiện **live end-to-end trên 2 trình duyệt Chrome headed** bằng `C:\Users\nguye\AppData\Local\Temp\audit\pw_online_deep_audit.ts` (kết quả lưu tại `pw_online_deep_audit.json` → `bug04LiveReproF4`):
      ```json
      {
        "reproduced": true,
        "turnWhenClicked": 1,
        "posWhenClicked": 0,
        "stateBeforeHostReconnect": {
          "turnCount": 3,
          "activePlayerIndex": 0,
          "turnPhase": "AWAIT_ROLL",
          "hostInJail": true,
          "hostJailTurns": 0
        },
        "stateAfterHostReconnect": {
          "turnCount": 4,
          "activePlayerIndex": 1,
          "hostInJail": true,
          "hostJailTurns": 1,
          "sentWireMessagesOnHost": [
            { "t": 1795491338030, "type": "CREATE_ROOM" },
            { "t": 1795491340258, "type": "START_MATCH" },
            { "t": 1795491355236, "type": "RECONNECT_ROOM" },
            { "t": 1795491355236, "type": "GAME_ACTION", "kind": "ROLL_DICE" }
          ]
        }
      }
      ```
11. **Proposed solution:**
    - **Client (`onlineClient.ts` & `ActionDock.tsx`):** Chỉ cho phép xếp hàng `CREATE_ROOM`, `JOIN_ROOM`, `RECONNECT_ROOM` vào `pendingQueueRef` khi socket đang khởi tạo; nếu gửi `GAME_ACTION` hoặc `SEND_EMOTE` khi `ws.readyState !== WebSocket.OPEN`, hủy ngay thông điệp, kích hoạt `openSocket(true)` và hiển thị thông báo đang kết nối lại. Đồng thời vô hiệu hóa nút quyết định khi `connectionStatus !== 'connected'`.
    - **Server + Protocol (`onlineTypes.ts` & `roomManager.ts`):** Thêm trường tùy chọn `expectedTurnCount?: number` và `expectedPhase?: TurnPhase` vào thông điệp `GAME_ACTION`; nếu có gửi kèm mà lệch với `match.turnCount` hoặc `match.turnPhase`, server trả `ERROR` mã `STALE_ACTION` và giữ nguyên trạng thái bàn cờ.
12. **Regression test:** Cập nhật `src/utils/onlineClient.test.ts` (sửa `BUG-30c` để khẳng định `GAME_ACTION` gửi lúc `reconnecting` bị loại bỏ, không phát sau `RECONNECT_ROOM`) + thêm test `STALE_ACTION` trong `src/server/roomManager.test.ts`.

---

## BUG-10 — Kẹp cứng `animDt <= 0.06s` làm animation xúc xắc/quân cờ trôi chậm 3.5×–16.7× khi FPS < 16 hoặc cửa sổ bị che khuất

1. **Bug ID:** `BUG-10` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P2 – Medium**
3. **Gameplay mode:** Offline & Online (trên máy cấu hình yếu < 16 FPS hoặc khi cửa sổ trình duyệt bị thu nhỏ/che khuất mà `document.hidden === false`)
4. **Description:** Trong vòng lặp `onFrame` của `MonopolyCanvas`, khi sử dụng WebGL phần cứng (`!isSoftwareGl`) và `document.hidden === false`, biến `animDt` bị kẹp trần ở `Math.min(rawDt, 0.06)` (tối đa 60ms tiến độ animation cho mỗi frame vẽ). Biến `animDt` này được cộng trực tiếp vào `diceAnim.elapsed` (dòng `2066`) và `hopAnim.stepElapsed` (dòng `2110-2114`) để giải phóng hai Promise gameplay. Khi tốc độ khung hình thực tế giảm xuống dưới `16.7 FPS` (do GPU yếu/tiết kiệm pin, hoặc do hệ điều hành/trình duyệt giảm nhịp `requestAnimationFrame` xuống `1–2.4 Hz` khi cửa sổ bị che khuất hoặc thu nhỏ nhưng chưa đổi `visibilityState` sang `'hidden'`), toàn bộ chuyển động xúc xắc và quân cờ bị kéo giãn thời gian từ **3.5× đến 16.7×**.
5. **Steps to reproduce:**
   - **Cách A (Máy FPS thấp):** Mở `/?autostart=1&players=2&hotseat=1&dice=6-5&quality=high` trên Chrome headed, bật CPU throttling 4× kèm tải dựng hình làm FPS thực giảm còn `2.5–5.0 FPS`, sau đó bấm `Đổ Xúc Xắc` (di chuyển 11 ô tới Phan Thiết).
   - **Cách B (Cửa sổ thu nhỏ / bị cửa sổ khác đè làm RAF giảm còn 1–2.4 Hz khi `document.hidden === false`):** Bấm `Đổ Xúc Xắc` (`3+4=7`) rồi thu nhỏ cửa sổ Chrome qua hệ điều hành / đè tab khác trong môi trường giữ `visibilityState === 'visible'` trong 4.2 giây.
6. **Expected behavior:** Dù FPS rớt xuống 2–10 FPS hay RAF bị trình duyệt giảm tần số xuống 1–2 Hz, thời lượng thực tế của xúc xắc (~1.35s) và nhảy quân cờ (~2s) vẫn bám sát thời gian thực `performance.now()` (nhảy cóc vị trí theo mốc thời gian thực, không bị slow-motion kéo dài hàng chục giây), đảm bảo khớp với nhịp `waitRoomBeat` của server Online và không làm treo lượt Bot Offline.
7. **Actual behavior:**
   - Ở `5.0 FPS` (`verify_gaps_and_bug11.json` → `lowFpsHotSwapF5`): một lượt đổ + nhảy 11 ô tới Phan Thiết mất **`15.866ms` (`~15.9s` so với `~4.5s` bình thường, chậm `3.5×`)**; ở `2.5 FPS` (`pw_interactive_and_visual_audio.json` → `lowFpsAndQualityHotSwapF5`), mỗi frame `400ms` chỉ cộng `60ms` tiến độ (`6.7×` slow-motion, mất tới `32.657ms` cho 82 frame).
   - Ở cửa sổ thu nhỏ `1 Hz` RAF (`hiddenTabD4`): trong `4.2 giây` thực chỉ chạy `4` frame = `4 × 0.06s = 0.24s` tiến độ (`16.7×` slow-motion); modal mua đất chưa thể mở sau 4.2s.
   - Ở tab bị đè (`pw_hidden_tab_real.json`, `2.36 FPS`): sau **11 giây thực** (`26` frame = `1.56s` tiến độ), ngay cả Bot đầu tiên cũng chưa đi xong lượt của mình (`rollBtnReturnedToHuman: false`). Trong chế độ **Online**, vì server chỉ chờ ~3.3s thực rồi sang phase mới, hình ảnh trên máy FPS thấp sẽ bị tụt hậu 10–40 giây so với trạng thái thật của phòng.
8. **Root cause:** Dùng chung trần kẹp `0.06s` (vốn dùng để chống văng lò xo camera/hiệu ứng nhấp nhô trang trí) cho bộ đếm thời gian `diceAnim.elapsed` và `hopAnim.stepElapsed` của hai Promise gameplay `activeDiceAnimRef` và `activeHopAnimRef`.
9. **Source file and line number:** `src/components/MonopolyCanvas.tsx:2463-2467` (kẹp `animDt`), `src/components/MonopolyCanvas.tsx:2066` (`diceAnim.elapsed += animDt`), và `src/components/MonopolyCanvas.tsx:2110-2114` (`remainingHopDt = animDt` / `hopAnim.stepElapsed += consume` trên `ActiveHopAnim` tại `MonopolyCanvas.tsx:139-149`)
10. **Evidence:**
    - `C:\Users\nguye\AppData\Local\Temp\audit\verify_gaps_and_bug11.json` (`lowFpsHotSwapF5`: `measuredFps: 5, frames: 81, wallMsToModal: 15866, landedPhanThietModal: true`).
    - `C:\Users\nguye\AppData\Local\Temp\audit\pw_interactive_and_visual_audio.json` (`lowFpsAndQualityHotSwapF5`: `measuredFps: 2.5, frames: 82, elapsedMs: 32657`; `hiddenTabD4`: `framesRenderedWhileHidden4s: 4, buyModalOpenWhileHidden: false`).
    - `C:\Users\nguye\AppData\Local\Temp\audit\pw_hidden_tab_real.json` (`botWebglDrawsWhileHidden11s: 26, rollBtnReturnedToHuman: false`).
11. **Proposed solution:** Tách riêng `gameplayAnimDt = pausedNow ? 0 : Math.min(rawDt, 2.0)` cho tiến trình của `diceAnim.elapsed` (dòng `2066`) và `remainingHopDt` / `hopAnim.stepElapsed` (dòng `2110-2114`), trong khi vẫn giữ `visualAnimDt = pausedNow ? 0 : docHidden ? Math.min(rawDt, 2.0) : Math.min(rawDt, isSoftwareGl ? 0.35 : 0.06)` cho nội suy camera và chuyển động trang trí. Đồng thời trong `createBoardFrameScheduler` (`src/game/graphicsQuality.ts:391-406`), nếu `hasPendingGameplayPromises` đang `true` mà `rawDtSec > 0.25` (dấu hiệu RAF đang bị OS throttle do che khuất cửa sổ dù `document.hidden === false`), tự động đặt thêm fallback `setTimeout(tick, 80)` giống `background_sim`.
12. **Regression test:** Unit test / Playwright test giả lập `requestRaf` chỉ gọi mỗi `500ms` (2 FPS) với `document.hidden === false`: assert `animateDiceRoll` + `animateTokenPath(8 hops)` hoàn tất đúng trong `< 4.0s` thời gian thực.

---

## BUG-11 — Client Online không reset `selectedDiceChoice` (`EVEN`/`ODD`) đầu lượt mới, làm từ chối cú bấm `🎲 Đổ Săn Đôi` ở Đảo Hoang với lỗi `INVALID_ACTION`

1. **Bug ID:** `BUG-11` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P2 – Medium**
3. **Gameplay mode:** Online Multiplayer (khi bật tùy chọn `Xúc xắc chiến thuật`)
4. **Description:** Ở chế độ Offline, hàm `enterRollPhaseForPlayer` (`src/App.tsx:962-963`) luôn reset `selectedDiceChoiceRef.current = 'NORMAL'` và `setSelectedDiceChoice('NORMAL')` ở đầu mỗi pha đổ xúc xắc. Ngược lại, ở chế độ **Online**, `enterRollPhaseForPlayer` phía client không bao giờ được gọi; `selectedDiceChoice` chỉ được reset khi người chơi trực tiếp bấm nút `handleRollDice` (`App.tsx:2133-2134`) hoặc lúc mới bắt đầu ván (`App.tsx:683`). Do đó, nếu người chơi bấm chọn `Chẵn` (`EVEN`) hoặc `Lẻ` (`ODD`) rồi hết giờ `AWAIT_ROLL` (hoặc bị Bot tiếp quản dùng cạn `evenOddCharges` về `0` rồi bấm `Giành Lại Quyền Điều Khiển`), giá trị `'EVEN'`/`'ODD'` vẫn nằm im trong `selectedDiceChoiceRef.current` sang các lượt kế tiếp:
   - Nếu ở lượt sau người chơi đang bị giam tại **Đảo Hoang** (`inJail === true`), cụm nút Chẵn/Lẻ bị ẩn hoàn toàn (`ActionDock.tsx:509-549`), chỉ hiện nút `🎲 Đổ Săn Đôi` (`bt-jail-roll-btn`). Khi người chơi bấm `🎲 Đổ Săn Đôi`, `ActionDock` gọi `onRollDice()` → `handleDockRollDice()` → gửi `{ kind: 'ROLL_DICE', diceChoice: 'EVEN' }` lên server và bị server từ chối thẳng với `ERROR: INVALID_ACTION ("Không thể dùng xúc xắc Chẵn/Lẻ lúc này.")`, làm nuốt mất cú bấm đầu tiên và bật banner báo lỗi khó hiểu!
   - Tương tự nếu Bot tiếp quản đã tiêu hết `evenOddCharges = 0`, nút `Chẵn (0)` bị `disabled` trong trạng thái `aria-pressed="true"` (`ActionDock.tsx:568-570`) và cú bấm `Đổ Xúc Xắc` đầu tiên sau khi giành lại quyền cũng bị từ chối `INVALID_ACTION`; còn nếu vẫn ở ngoài Đảo và còn lượt Chẵn/Lẻ thì lượt sau sẽ âm thầm trừ mất 1 lượt Chẵn/Lẻ ngoài ý muốn.
5. **Steps to reproduce:**
   1. Tạo phòng Online 2 người chơi với tùy chọn `Xúc xắc chiến thuật` = **Đang Bật**.
   2. Ở Lượt 1, Host bấm nút `Chẵn (3)` (`bt-dice-even-btn`), sau đó để hết giờ `AWAIT_ROLL` → server tự động đổ xúc xắc (ví dụ `3 + 5 = 8`), Host bấm `Giữ Kết Quả & Đi` (`bt-confirm-roll-btn`) và rơi vào **Đảo Hoang** (`inJail = true`).
   3. Người chơi 2 hoàn thành Lượt 2 → sang Lượt 3 của Host trong Đảo Hoang (lúc này thanh chọn Thường/Chẵn/Lẻ không hiển thị, chỉ có nút `🎲 Đổ Săn Đôi`).
   4. Host bấm nút `🎲 Đổ Săn Đôi` (`bt-jail-roll-btn`).
6. **Expected behavior:** Khi bước sang lượt mới, hoặc khi người chơi đang ở Đảo Hoang (`inJail === true`) hoặc hết lượt Chẵn/Lẻ (`evenOddCharges <= 0`), lựa chọn xúc xắc phải tự động trở về `'NORMAL'`. Bấm `🎲 Đổ Săn Đôi` lần đầu tiên phải gửi `{ kind: 'ROLL_DICE', diceChoice: 'NORMAL' }` và đổ xúc xắc ngay lập tức.
7. **Actual behavior:** Cú bấm `🎲 Đổ Săn Đôi` đầu tiên gửi `{"type":"GAME_ACTION","action":{"kind":"ROLL_DICE","diceChoice":"EVEN"}}`, bị server trả về `{"type":"ERROR","code":"INVALID_ACTION","message":"Không thể dùng xúc xắc Chẵn/Lẻ lúc này."}`, bật banner cảnh báo màu đỏ trên màn hình và giữ nguyên `turnPhase = 'AWAIT_ROLL'` (người chơi phải bấm lần thứ 2 mới đổ được).
8. **Root cause:** (1) Thiếu `useEffect` đồng bộ reset `selectedDiceChoice` theo `viewTurnCount` / `viewActivePlayerIndex` / `inJail` / `evenOddCharges` khi chơi Online trong `src/App.tsx`; (2) `bt-jail-roll-btn` gọi `onRollDice()` không truyền tường minh `'NORMAL'` và `handleRollDice` không ép về `'NORMAL'` khi `currentPlayer.inJail || evenOddCharges <= 0`.
9. **Source file and line number:** `src/App.tsx:682-685`, `src/App.tsx:2122-2141`, `src/App.tsx:4176-4178`, `src/components/ActionDock.tsx:511-522, 566-590`, `src/server/roomManager.ts:1250-1258`
10. **Evidence:**
    - Đã tái hiện **live end-to-end trên 2 cửa sổ Chrome headed** bằng `C:\Users\nguye\AppData\Local\Temp\audit\verify_gaps_and_bug11.ts` (kết quả lưu tại `verify_gaps_and_bug11.json` → `bug11OnlineStaleDiceChoice`):
      ```json
      {
        "roomCode": "49K7X2",
        "evenPressedBeforeTimeout": "true",
        "evenBtnVisibleInJail": false,
        "firstJailClickPayload": [
          { "type": "GAME_ACTION", "action": { "kind": "CONFIRM_ROLL_MOVE" } },
          { "type": "GAME_ACTION", "action": { "kind": "ROLL_DICE", "diceChoice": "EVEN" } }
        ],
        "serverErrorsReceived": [
          {
            "type": "ERROR",
            "code": "INVALID_ACTION",
            "message": "Không thể dùng xúc xắc Chẵn/Lẻ lúc này."
          }
        ],
        "alertBannerText": "Không thể dùng xúc xắc Chẵn/Lẻ lúc này.\n✕",
        "stillAwaitingJailRollAfterFirstClick": true,
        "hostTurnPhaseAfterFirstClick": "AWAIT_ROLL"
      }
      ```
11. **Proposed solution:**
    1. Trong `src/App.tsx`, thêm `useEffect` theo dõi `[viewTurnCount, viewActivePlayerIndex, viewCurrentPlayer?.inJail, viewCurrentPlayer?.evenOddCharges]`: reset `selectedDiceChoiceRef.current = 'NORMAL'` và `setSelectedDiceChoice('NORMAL')` mỗi khi sang lượt mới hoặc khi `inJail === true` hoặc `(evenOddCharges ?? 0) <= 0`.
    2. Trong `handleRollDice` (`src/App.tsx:2124`), chuẩn hóa phòng vệ: nếu `!viewTacticalDiceEnabled || activePlayer?.inJail || (activePlayer?.evenOddCharges ?? 0) <= 0` thì ép `effectiveChoice = 'NORMAL'`.
12. **Regression test:** Bổ sung E2E test (hoặc integration test) bật `tacticalDiceEnabled`, chọn `bt-dice-even-btn`, để hết giờ `AWAIT_ROLL` rơi vào Đảo Hoang, tới lượt kế bấm `bt-jail-roll-btn` 1 lần → assert gửi `diceChoice: 'NORMAL'`, `0` thông điệp `ERROR` và chuyển pha đổ xúc xắc ngay ở lần bấm đầu tiên.

---

## BUG-05 — Hết giờ trận (`TIME_LIMIT`) ngay giữa `DEBT_RESOLUTION` bỏ qua khoản nợ chưa trả khi xếp hạng

1. **Bug ID:** `BUG-05` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P1 – High** *(đã nâng từ **P3 – Low** ở baseline theo điều chỉnh ưu tiên)*
3. **Gameplay mode:** Online & Offline
4. **Description:** Khi đồng hồ trận đấu 20:00 chạm `0` đúng lúc một người chơi đang ở trạng thái `DEBT_RESOLUTION` (đang nợ tiền thuê đối thủ, nợ thuế hoặc hàng đợi nợ thẻ Sinh Nhật `ch-10` nhưng chưa bấm Bán tài sản / Phá sản), cả hai engine lập tức gọi `evaluateTimeLimitWinner(players, properties)` mà không trừ `pendingDebt.amount` (và `pendingDebtQueue`) khỏi tài sản ròng của con nợ, cũng như không cộng khoản phải thu cho chủ nợ.
5. **Steps to reproduce:**
   1. Người chơi A có `cash = 10K` và BĐS trị giá `1.500K` (Tổng tài sản hiển thị = `1.510K`), đi vào đất Landmark của B có tiền thuê `1.000K` khi đồng hồ trận còn `00:03`.
   2. A rơi vào `DEBT_RESOLUTION` (`pendingDebt = { amount: 1_000_000, creditorId: B }`) và chờ 3 giây không bấm bán nhà cho tới khi `matchTimeLeft` về `0`.
6. **Expected behavior:** Khoản nợ bắt buộc đã phát sinh (`1.000K`) phải được khấu trừ khỏi Net Worth của A (và cộng tối đa theo khả năng thanh toán của A cho chủ nợ B) trước khi chấm thắng thua Sudden Death, tránh việc câu giờ 3–15s ở cuối trận để trốn nợ và lật ngược kết quả thắng cuộc.
7. **Actual behavior:** Trận đấu kết thúc ngay với `condition: 'TIME_LIMIT'`, `pendingDebt` bị bỏ qua hoàn toàn; A vẫn được tính nguyên vẹn `1.510K` Net Worth thay vì `510K`.
8. **Root cause:** `evaluateTimeLimitWinner` chỉ nhận `(players, properties, matchMode)` và tính `cash + realEstateValue`, không xét `pendingDebt` / `pendingDebtQueue`.
9. **Source file and line number:** `src/server/roomManager.ts:3216-3238`, `src/App.tsx:3867-3903`, `src/game/rules.ts:1240-1312`
10. **Evidence:**
    - Chạy `C:\Users\nguye\AppData\Local\Temp\audit\probes.ts` (`probeTimeLimitDuringDebt`):
      ```json
      {
        "status": "gameover",
        "cond": "TIME_LIMIT",
        "pendingDebtStillSet": true
      }
      ```
11. **Proposed solution:** Truyền danh sách các khoản nợ đang treo `[pendingDebt, ...pendingDebtQueue]` vào `evaluateTimeLimitWinner` (hoặc thực thi thanh lý nợ tự động bằng `computeOptimalAutoSale` / phá sản ngay trước khi gọi `evaluateTimeLimitWinner` khi `matchTimeLeft === 0`).
12. **Regression test:** Thêm unit test trong `src/game/rules.test.ts` và `src/server/roomManager.test.ts`: P0 có `1.51M` tài sản nhưng đang nợ P1 `1.0M` khi `matchTimeLeft` từ `1 → 0`; assert P1 xếp hạng trên P0.

---

## BUG-06 — Server bỏ qua im lặng `GAME_ACTION` lệch phase mà không trả `ERROR`, làm khóa nút client 6 giây

1. **Bug ID:** `BUG-06` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P3 – Low**
3. **Gameplay mode:** Online Multiplayer
4. **Description:** Khi client gửi `GAME_ACTION` đúng ghế đang tới lượt nhưng rơi vào thời điểm server đang ở `ROLLING_DICE` / `MOVING_TOKEN` hoặc vừa chuyển `turnPhase` do race condition mạng (ví dụ hết giờ phase sát nút bấm), nhiều nhánh kiểm tra trong `handleHumanGameAction` và `executeAction` chỉ `return` im lặng mà không gọi `this.sendError(...)`. Phía client, `submitOnlineDecision` khóa nút thao tác trong `6.000ms` chờ snapshot mới hoặc `errorSeq` tăng để mở khóa; nếu phase mới không làm đổi `onlineDecisionKey` (hoặc lệnh gửi sớm), nút thao tác bị liệt oan tới 6 giây.
5. **Steps to reproduce:**
   1. Người chơi đang ở lượt của mình gửi một `GAME_ACTION` lệch `turnPhase` (ví dụ `BUY_PROPERTY` khi server đang ở `AWAIT_ROLL` hoặc `ROLL_DICE` khi server đang ở `ROLLING_DICE`).
   2. Quan sát thông điệp phản hồi trên WebSocket và trạng thái khóa của `submitOnlineDecision`.
6. **Expected behavior:** Mọi `GAME_ACTION` từ client bị server từ chối vì sai phase phải nhận về `{ type: 'ERROR', code: 'INVALID_STATE', message: '...' }` để client tăng `errorSeq` và giải phóng khóa nút ngay lập tức.
7. **Actual behavior:** Server `return` không phản hồi gì trên WebSocket.
8. **Root cause:** Thiếu lời gọi `if (clientId) this.sendError(clientId, 'INVALID_STATE', ...)` tại các câu lệnh guard kiểm tra `match.turnPhase`.
9. **Source file and line number:** `src/server/roomManager.ts:1223-1225`, `1240`, `1291-1293`, `1316-1318`, `1335-1415` (tương tác với khóa 6s tại `src/App.tsx:486-505`)
10. **Evidence:** Xác minh trực tiếp trên mã nguồn `src/server/roomManager.ts:1223-1415` (đối chiếu với nhánh `NOT_YOUR_TURN` tại `:1214` có gọi `sendError`, còn các nhánh sai `turnPhase` ngay bên dưới chỉ `return;`).
11. **Proposed solution:** Tại `handleHumanGameAction` và đầu mỗi nhánh phase trong `executeAction`, nếu `clientId` tồn tại mà `match.turnPhase` không hợp lệ cho `action.kind`, gọi `this.sendError(clientId, 'INVALID_STATE', 'Trạng thái lượt đã thay đổi.')` trước khi `return`.
12. **Regression test:** Thêm test trong `src/server/roomManager.test.ts`: gửi `BUY_PROPERTY` ở `AWAIT_ROLL` và `ROLL_DICE` ở `ROLLING_DICE` từ người chơi đang giữ lượt → assert nhận được thông điệp `ERROR` có `code: 'INVALID_STATE'`.

---

## BUG-07 — Bất nhất giữa engine Offline và Online khi nhận payload mua/nâng cấp/đăng cai Cúp không hợp lệ

1. **Bug ID:** `BUG-07` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P3 – Low**
3. **Gameplay mode:** Offline vs Online Parity
4. **Description:** Khi các hàm xử lý quyết định nhận tham số không hợp lệ hoặc không đủ tiền:
   - Ở **Online** (`roomManager.ts`), server trả lỗi `INVALID_ACTION` và **giữ nguyên `turnPhase`** để người chơi chọn lại mức nhà hợp lệ hoặc bấm Bỏ qua.
   - Ở **Offline** (`App.tsx`), `handleBuyProperty`, `handleOnTileUpgrade` và `handleConfirmChampionship` lại gọi thẳng `completeTurnAfterAction(player)`, coi như người chơi **mất quyền mua/nâng cấp và kết thúc lượt ngay**.
5. **Steps to reproduce:** Gọi nhánh mua/nâng cấp ở Offline với bậc nhà vượt quá số tiền hiện có (trong trường hợp race UI giữa hai sự kiện) và so sánh với Online.
6. **Expected behavior:** Hai engine Offline và Online phải thống nhất hành vi: từ chối thao tác không hợp lệ và giữ nguyên modal quyết định thay vì tự động kết thúc lượt.
7. **Actual behavior:** Offline tự kết thúc lượt (`completeTurnAfterAction`), Online giữ nguyên phase quyết định.
8. **Root cause:** Hai engine duy trì bản sao logic điều phối lượt riêng biệt trong `src/App.tsx` và `src/server/roomManager.ts`.
9. **Source file and line number:** `src/App.tsx:2523-2533`, `src/App.tsx:2627-2638`, `src/App.tsx:2830-2849` (đối chiếu với `src/server/roomManager.ts:2033-2047`, `2093-2109`, `2181-2204`)
10. **Evidence:** Đối chiếu trực tiếp mã nguồn hai nhánh xử lý tương ứng ở `App.tsx` và `roomManager.ts`.
11. **Proposed solution:** Trong `handleBuyProperty`, `handleOnTileUpgrade` và `handleConfirmChampionship` của `src/App.tsx`, thay `completeTurnAfterAction(player); return;` ở nhánh kiểm tra lỗi bằng `return;` (giữ nguyên `turnPhase` giống hệt server Online).
12. **Regression test:** Unit/component test xác nhận khi không đủ tiền cho cấp nhà không hợp lệ, `turnPhase` vẫn giữ nguyên ở `BUY_DECISION` / `UPGRADE_DECISION`.

---

## BUG-08 — Thuật toán bán nhà trả nợ tối ưu (`computeOptimalAutoSale`) bỏ qua tài sản đồng đội ở chế độ 2v2

1. **Bug ID:** `BUG-08` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P3 – Low**
3. **Gameplay mode:** Offline & Online — Chế độ Đấu Đội `TEAMS_2V2` (ảnh hưởng nút "Chọn tối ưu" trên UI người chơi, xử lý hết giờ nợ và AI của Bot)
4. **Description:** Hàm `computeOptimalAutoSale` chấm điểm ưu tiên giữ lại các ô thuộc bộ màu độc quyền và bộ Khu nghỉ dưỡng (Resort) có nhiều ô. Tuy nhiên hàm này không nhận tham số `players` và `matchMode`, dẫn tới:
   1. Gọi `ownsFullColorGroup(playerId, tile.group, properties)` (dòng `890`) mà không truyền `players, matchMode` → không nhận diện được bộ độc quyền màu **chung của hai đồng đội**.
   2. Đếm `ownedResortCount` (dòng `881-883`) chỉ theo `properties[idx]?.ownerId === playerId` → không gộp qua `getTeamOwnerIds(playerId, players, matchMode)` như cách `calculateRent` đang làm tại `src/game/rules.ts:503-511`.
5. **Steps to reproduce:**
   1. Trong trận `TEAMS_2V2`, Người chơi 0 giữ `Hà Giang` + `Sa Pa` (nhóm Nâu), đồng đội (Người chơi 2) giữ `Đà Lạt` → cả đội đang có Độc quyền nhóm Nâu (×2 tiền thuê). Ngoài ra Người chơi 0 còn giữ `Ninh Bình` lẻ (nhóm Xanh lơ, chưa độc quyền).
   2. Người chơi 0 mắc nợ `60K` và bấm nút Gợi ý bán tối ưu (hoặc là Bot AI tự bán trả nợ).
6. **Expected behavior:** Thuật toán phải bảo vệ `Sa Pa` / `Hà Giang` (vì thuộc bộ độc quyền nhóm Nâu của đội, hệ số giữ +350 điểm) và chọn bán `Ninh Bình` lẻ trước.
7. **Actual behavior:** Vì `ownsFullColorGroup` trả về `false` khi xét riêng lẻ `playerId`, thuật toán đánh giá `Sa Pa` (60K, vừa khít khoản nợ 60K hơn `Ninh Bình` 90K) thấp điểm bảo vệ hơn và **bán phá vỡ bộ độc quyền màu của chính đội mình**! Tương tự với Resort của đội.
8. **Root cause:** Chữ ký hàm `computeOptimalAutoSale(playerId, amountNeeded, properties, modifiers)` thiếu `players?: PlayerState[]` và `matchMode: MatchMode = 'FFA'`.
9. **Source file and line number:** `src/game/rules.ts:853-906` (đặc biệt dòng `881-883` và `890`); các nơi gọi tại `src/server/roomManager.ts:3140, 3354`, `src/App.tsx:3795, 4015`, `src/components/TileModalAndDialogs.tsx:911`
10. **Evidence:** Kiểm tra trực tiếp logic chấm điểm `keepScore` tại `src/game/rules.ts:878-895` đối chiếu với `ownsFullColorGroup` (`src/game/rules.ts:372-385`) và cách đếm Resort theo đội dùng `getTeamOwnerIds` trong `calculateRent` (`src/game/rules.ts:338-352, 503-511`).
11. **Proposed solution:** Bổ sung tham số tùy chọn `players?: PlayerState[], matchMode: MatchMode = 'FFA'` vào `computeOptimalAutoSale`; dùng `const teamIds = getTeamOwnerIds(playerId, players, matchMode)` để đếm `ownedResortCount` trên `RESORT_TILE_INDICES` tại dòng `881-883`, và truyền `players, matchMode` vào `ownsFullColorGroup(playerId, tile.group, properties, players, matchMode)` tại dòng `890`, đồng thời cập nhật 5 điểm gọi hàm.
12. **Regression test:** Thêm unit test trong `src/game/rules.test.ts`: thiết lập đội 0 (P0 giữ ô 1 & 2, P2 giữ ô 3 tạo độc quyền Nâu; P0 giữ thêm ô 5 lẻ), gọi `computeOptimalAutoSale(0, 60_000, props, mods, players, 'TEAMS_2V2')` → assert kết quả bán là `[5]` thay vì `[2]`.

---

## BUG-09 — Server Online không có cơ chế watchdog phục hồi nếu timer lượt của Bot AI bị rơi (Latent Risk)

1. **Bug ID:** `BUG-09` — **Trạng thái: `FIXED & VERIFIED`**
2. **Severity:** **P3 – Low (Latent)**
3. **Gameplay mode:** Online Multiplayer có Bot AI
4. **Description:** Trong `tickOneSecond`, khi `match.turnTimeLeft` đếm ngược về `0`, server chỉ xử lý nhánh `if (!active.isBot)`. Nếu người chơi đang tới lượt là Bot (`active.isBot === true`) mà vì bất kỳ lỗi cạnh nào trong tương lai `room.botActionTimer` bị xóa hoặc không được đặt lại (trong khi `turnPhase` không phải `ROLLING_DICE` / `MOVING_TOKEN` / `GAME_OVER`), đồng hồ lượt sẽ kẹt vĩnh viễn ở `00:00` và cả phòng bị treo không thể kết thúc lượt. *(Lưu ý: Trong 190 trận simulation hiện tại lỗi này chưa từng kích hoạt — `0/190` trận kẹt — nên được phân loại là rủi ro phòng vệ tiềm ẩn).*
5. **Steps to reproduce:** Trong môi trường kiểm thử `OnlineRoomManager`, chuyển lượt sang Bot AI, hủy `room.botActionTimer` mô phỏng sự cố rớt timer, sau đó gọi `tickOneSecond()` 50 lần.
6. **Expected behavior:** Khi `turnTimeLeft <= 0` mà `active.isBot === true` và `room.botActionTimer === null`, `tickOneSecond` phải đóng vai trò watchdog gọi lại `this.scheduleBotTurnIfNeeded(room)` để tự phục hồi lượt đấu.
7. **Actual behavior:** `turnTimeLeft` nằm im ở `0` mãi mãi, không có hành động nào diễn ra.
8. **Root cause:** Thiếu nhánh `else if (active.isBot && !room.botActionTimer)` tại cuối `tickOneSecond`.
9. **Source file and line number:** `src/server/roomManager.ts:3294-3370` (liên quan hàm `clearMatchTimers` tại `src/server/roomManager.ts:261-271`)
10. **Evidence:** Kiểm tra trực tiếp cấu trúc điều kiện `if (!active.isBot)` tại `src/server/roomManager.ts:3296` (không có nhánh `else`).
11. **Proposed solution:** Bổ sung nhánh bảo vệ ở `src/server/roomManager.ts:3369`:
    ```ts
    } else if (active.isBot && !room.botActionTimer) {
      match.turnTimeLeft = 15;
      this.scheduleBotTurnIfNeeded(room);
    }
    ```
12. **Regression test:** Thêm test trong `src/server/roomManager.test.ts`: tới lượt Bot, xóa thủ công `(room as any).botActionTimer = null`, gọi `tickOneSecond()` cho tới khi `turnTimeLeft === 0` → assert `scheduleBotTurnIfNeeded` tự chạy lại và Bot hoàn thành lượt.

---

## Phụ lục — Danh sách Script Kiểm Chứng Tái Lập (đã đưa vào Repository tại `scripts/gameplay-audit/`)

| Script | Mục đích & Bằng chứng tái lập |
|---|---|
| `scripts/gameplay-audit/sim.ts` | Chạy simulation Bot-vs-Bot có seed tái lập (`--all-190` chạy trọn vẹn 6 dải seed gốc `2000–7039`, tổng 190 trận), kiểm tra bất biến kinh tế & state machine sau mỗi tick. |
| `scripts/gameplay-audit/probes.ts` | Kiểm chứng tất định `BUG-01`, `BUG-02`, `BUG-04`, `BUG-05`, `BUG-06`, `BUG-08`, `BUG-09` trên `OnlineRoomManager` & `rules.ts`. |
| `scripts/gameplay-audit/pw-fps-and-clock-benchmark.ts` | Playwright Chrome headed: đo thời lượng animation `BUG-10` tại `60, 30, 15, 5, 2.5 FPS`, tab ẩn/bị che (`--hidden-only`), Pause/Resume, đổi nóng Graphics Quality Low/Medium/High, idle draw calls, và độ trôi đồng hồ Offline 60s (`BUG-03`). |
| `scripts/gameplay-audit/pw-online-and-matrix-audit.ts` | Playwright Chrome headed: xác minh live end-to-end `BUG-04` (không replay action cũ vào Đảo Hoang), `BUG-01` (không takeover sớm sau 1 lượt), `BUG-11` (bấm 1 lần `bt-jail-roll-btn` thành công ngay), 4 người chơi Online, mạng trễ `700ms RTT` + F5 reload giữa nhảy quân, `RulebookModal` + `GEMINI_API_KEY=""` + giả lập `HTTP 500`. |
| `e2e/online-resilience.spec.ts` | Bộ E2E hồi quy cố định trong `npx playwright test --headed` bảo vệ `BUG-02`, `BUG-03`, `BUG-04`, `BUG-06`, `BUG-10`, `BUG-11`. |
| `src/server/simulation.test.ts` | Bộ simulation có seed cố định trong `npm test` (10 trận qua cả 5 cấu hình FFA/2v2/Tactical/Festival). |
