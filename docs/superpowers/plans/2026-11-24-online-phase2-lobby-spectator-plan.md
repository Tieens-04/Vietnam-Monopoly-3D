# Đợt 2 — Quản Lý Sảnh Chờ, Đổi Phe 2v2, Khán Giả & Thế Chỗ Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp sảnh chờ Online với đổi ghế/chia đội 2v2 linh hoạt, kiểm tra Sẵn sàng (Ready Check), quyền Chủ phòng (Chuyển Host, Kick), 3 mức độ khó Bot AI, chế độ Khán giả (tối đa 4 người/phòng) và luồng Xin thế chỗ Bot giữa trận có Chủ phòng duyệt.

**Architecture:** Mở rộng `OnlineRoomManager` quản lý hai tập `humans` (ngồi ghế `0..maxPlayers-1`) và `spectators` (tối đa `4`), cùng neo theo `participantId` của Đợt 1 để giữ nguyên kết nối Voice Mesh & Chat khi chuyển vai trò. Luật chia đội 2v2 giữ nguyên `seatIndex % 2`, mọi thay đổi luật phòng tự reset `ready` của khách, và luồng Hot-Join Bot bảo vệ tuyệt đối ghế của người chơi chỉ bị rớt mạng tạm thời.

**Tech Stack:** TypeScript, Node `node:test` + `tsx`, `src/game/rules.ts`, `src/server/roomManager.ts`, React 19 + Tailwind CSS v4, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-24-online-friends-social-lobby-design.md` (Mục 4, Mục 6.2)

## Global Constraints

- Phụ thuộc Đợt 1 đã hoàn tất (`participantId`, `participants`, `SEND_CHAT_MESSAGE`, `RTC_SIGNAL`).
- Giữ nguyên quy luật `teamId = (seatIndex % 2) as TeamId` trong `TEAMS_2V2` để đảm bảo lượt đi luân phiên công bằng `Đội A → Đội B → Đội A → Đội B`.
- Hằng số cứng từ đặc tả: `MAX_SPECTATORS_PER_ROOM = 4`, thời hạn lời mời đổi ghế `15_000ms`, thời hạn Chủ phòng duyệt xin thế chỗ Bot `20_000ms`, tối thiểu `18s` suy nghĩ khi nhận quyền điều khiển đúng lượt.
- Tuyệt đối **không** cho Khán giả chiếm ghế của người chơi đang mất mạng tạm thời (`explicitlyLeft === false`); chỉ cho thế chỗ **Bot bù từ đầu trận** hoặc ghế người cũ đã chủ động rời/bị kick (`explicitlyLeft === true`) và chưa phá sản.
- Mọi thay đổi phải vượt qua `npm run lint`, `npm test`, và `npm run build`.

## Review Focus

- Các unit test hiện có trong `src/server/roomManager.test.ts` đang gọi `JOIN_ROOM` rồi `START_MATCH` ngay lập tức mà chưa bấm `SET_READY` — khi bật Ready Check bắt buộc, phải cập nhật các test cũ gửi `{ type: 'SET_READY', ready: true }` cho khách trước `START_MATCH` để không làm gãy test suite hiện hữu.
- Khi Chủ phòng bấm `MOVE_TO_SPECTATOR` hoặc rời phòng lúc đang có người khác ngồi ghế, quyền Chủ phòng phải được chuyển tự động sang một người chơi đang ngồi ghế và đang kết nối (không để phòng kẹt không ai có quyền bắt đầu).
- Nếu 2 Khán giả cùng bấm `REQUEST_BOT_TAKEOVER` vào cùng 1 Bot hoặc Host chưa duyệt yêu cầu cũ thì server phải từ chối yêu cầu đến sau bằng `ERROR(TAKEOVER_PENDING)` thay vì ghi đè gây race condition.
- Người bị `KICK_PARTICIPANT` không thể dùng `sessionToken` cũ gọi `RECONNECT_ROOM` để quay lại phòng, và client của họ khi nhận `ERROR(KICKED_BY_HOST)` phải tự xóa `localStorage` session để không rơi vào vòng lặp reconnect vô hạn.
- Khán giả trong trận `2v2` tuyệt đối không nhận được tin nhắn kênh `TEAM` (kể cả qua `GAME_EVENT` lẫn `snapshot.chatHistory`).

---

## File Structure

- Modify: `src/game/onlineTypes.ts` — thêm `BotDifficulty`, `PendingSeatSwapRequest`, `PendingBotTakeoverRequest`, mở rộng `LobbySeatInfo`, `OnlineRoomSnapshot`, `ClientToServerMessage`.
- Modify: `src/game/rules.ts` & `src/game/rules.test.ts` — thêm tham số `difficulty: BotDifficulty = 'normal'` vào các hàm ra quyết định của Bot AI.
- Modify: `src/server/roomManager.ts` & `src/server/roomManager.test.ts` — thêm `spectators`, `botDifficulty`, `pendingSeatSwap`, `pendingTakeoverRequest` và toàn bộ handler Đợt 2.
- Modify: `src/utils/onlineClient.ts` & `src/utils/onlineClient.test.ts` — thêm `isSpectator`, các hàm thao tác Đợt 2 và xử lý `KICKED_BY_HOST`.
- Modify: `src/components/OnlineLobbyPanel.tsx` — UI đổi ghế / swap 2v2, Ready Check, Kick / Transfer Host, chọn Độ khó Bot AI, dải Khán giả & chuyển vai trò.
- Modify: `src/components/ActionDock.tsx` & `src/App.tsx` — thanh trạng thái Khán giả trong trận, modal chọn Bot để xin thế chỗ, hộp thoại Chủ phòng duyệt `20s`.
- Create: `e2e/online-lobby-spectator.spec.ts` — kiểm thử E2E luồng Ready, đổi ghế 2v2, Khán giả vào giữa trận và Xin thế chỗ Bot.

---

### Task 1: Phase 2 Protocol Types & 3-Tier Bot AI Difficulty (`rules.ts`)

**Files:**
- Modify: `src/game/onlineTypes.ts:18-160`
- Modify: `src/game/rules.ts:1692-2030, 2501-2760`
- Modify: `src/game/rules.test.ts`

**Interfaces:**
- Produces in `src/game/onlineTypes.ts`:
  - `export type BotDifficulty = 'easy' | 'normal' | 'hard';`
  - `export interface PendingSeatSwapRequest { requestId: string; fromParticipantId: string; fromSeatIndex: number; fromPlayerName: string; toParticipantId: string; toSeatIndex: number; expiresAt: number; }`
  - `export interface PendingBotTakeoverRequest { requestId: string; requesterParticipantId: string; requesterName: string; targetPlayerId: number; targetBotName: string; expiresAt: number; }`
  - `LobbySeatInfo` bổ sung `participantId?: string | null` và `ready?: boolean`.
  - `OnlineRoomSnapshot` bổ sung `botDifficulty: BotDifficulty`, `spectators: RoomParticipantSummary[]`, `pendingSeatSwap: PendingSeatSwapRequest | null`, `pendingTakeoverRequest: PendingBotTakeoverRequest | null`.
  - `CREATE_ROOM` & `UPDATE_LOBBY_SETTINGS` bổ sung `botDifficulty?: BotDifficulty`.
  - `ClientToServerMessage` bổ sung `MOVE_TO_SEAT`, `REQUEST_SEAT_SWAP`, `RESPOND_SEAT_SWAP`, `HOST_SWAP_SEATS`, `MOVE_TO_SPECTATOR`, `SET_READY`, `TRANSFER_HOST`, `KICK_PARTICIPANT`, `REQUEST_BOT_TAKEOVER`, `RESPOND_BOT_TAKEOVER`.
- Produces in `src/game/rules.ts`:
  - `botShouldBuyProperty(..., difficulty?: BotDifficulty)`
  - `botPickInitialPurchaseTier(..., difficulty?: BotDifficulty)`
  - `botPickOnTileUpgradeTargetLevel(..., difficulty?: BotDifficulty)`
  - `botShouldBuyoutProperty(..., difficulty?: BotDifficulty)`
  - `botPickChampionshipTarget(..., difficulty?: BotDifficulty)`
  - `botPickTacticalCardTarget(..., difficulty?: BotDifficulty)`

- [ ] **Step 1: Write failing tests for Bot AI difficulty tiers in `src/game/rules.test.ts`**

Kiểm tra:
- Với cùng mức tiền mặt vừa đủ mua + xây 3 nhà: `easy` chỉ chọn tối đa cấp `2` (hoặc giữ vốn cao hơn), `normal` giữ hành vi hiện tại, `hard` mua đứt ô chặn hoàn thiện nhóm màu đối phương (kể cả trong `TEAMS_2V2` khi đối thủ đang giữ N-1 ô cùng màu) trong khi `easy` từ chối mua đứt.
- `botPickTacticalCardTarget(..., 'hard')` ưu tiên ô có tiền thuê cao nhất của địch (hoặc đang có Cúp/Lễ hội).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/game/rules.test.ts`
Expected: FAIL vì các hàm Bot chưa nhận tham số `difficulty`.

- [ ] **Step 3: Add Phase 2 types to `src/game/onlineTypes.ts` and implement `difficulty` branches in `src/game/rules.ts`**

- Cập nhật `src/game/onlineTypes.ts`.
- Trong `src/game/rules.ts`, giữ mặc định `difficulty: BotDifficulty = 'normal'` để mọi caller cũ tương thích 100%, đồng thời áp dụng các ngưỡng vốn/ưu tiên chặn nhóm màu cho `'easy'` và `'hard'` đúng theo Mục 4.2 của đặc tả.

- [ ] **Step 4: Run tests and lint to verify pass**

Run: `npx tsx --test src/game/rules.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/onlineTypes.ts src/game/rules.ts src/game/rules.test.ts
git commit -m "feat(game): add Phase 2 lobby/spectator types and 3-tier Bot AI difficulty"
```

---

### Task 2: Server Seat Swapping (`2v2` Fair Ordering) & Ready Check

**Files:**
- Modify: `src/server/roomManager.ts:147-226, 390-485, 800-910, 1118-1260`
- Modify: `src/server/roomManager.test.ts`

**Interfaces:**
- Consumes: `BotDifficulty`, `PendingSeatSwapRequest` từ Task 1.
- Produces in `OnlineRoomManager`:
  - Xử lý `MOVE_TO_SEAT`, `REQUEST_SEAT_SWAP` (timeout `15_000ms`), `RESPOND_SEAT_SWAP`, `HOST_SWAP_SEATS`, `SET_READY`.
  - Truyền `room.botDifficulty` vào toàn bộ lời gọi hàm quyết định Bot trong `runBotTurnStep`.
  - Chặn `START_MATCH` nếu còn bất kỳ khách đang kết nối nào có `ready === false` (`ERROR(GUESTS_NOT_READY)`).
  - Reset `ready = false` cho tất cả khách và ghi thông báo hệ thống vào chat sảnh khi Chủ phòng đổi bất kỳ cài đặt luật nào trong `UPDATE_LOBBY_SETTINGS`.

- [ ] **Step 1: Write failing tests in `src/server/roomManager.test.ts`**

Thêm test kiểm tra:
- `MOVE_TO_SEAT`: khách ở ghế 1 nhảy sang ghế trống 2 → `seatIndex === 2`, `teamId === 0` trong `TEAMS_2V2`.
- `REQUEST_SEAT_SWAP` & `RESPOND_SEAT_SWAP`: khách ghế 1 gửi mời đổi với ghế 2 → đồng ý sẽ hoán đổi 2 ghế; nếu từ chối hoặc quá hạn `15s` thì hủy `pendingSeatSwap`.
- `HOST_SWAP_SEATS`: Chủ phòng đổi trực tiếp ghế 1 và ghế 2 (hoặc đổi ghế của chính Host → `hostSeatIndex` cập nhật theo).
- `Ready Check`: c2 join phòng → c1 gọi `START_MATCH` nhận `ERROR(GUESTS_NOT_READY)` → c2 gửi `SET_READY(true)` → c1 đổi `startingCash` trong `UPDATE_LOBBY_SETTINGS` → `ready` của c2 tự đặt lại `false` → c2 gửi `SET_READY(true)` lại → `START_MATCH` thành công.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: FAIL vì chưa xử lý các message đổi ghế và Ready Check.

- [ ] **Step 3: Implement seat swapping, Ready Check, and `botDifficulty` wiring in `src/server/roomManager.ts`**

- Thêm `botDifficulty: BotDifficulty`, `pendingSeatSwap: (PendingSeatSwapRequest & { timer: ReturnType<typeof setTimeout> }) | null` vào `RoomRecord` (dọn timer trong `clearRoomTimers` và khi có người rời ghế/bắt đầu trận).
- Cập nhật các test cũ trong `src/server/roomManager.test.ts` nơi khách join trước `START_MATCH` để gửi `{ type: 'SET_READY', ready: true }` (dùng helper gọn `markAllGuestsReady`).

- [ ] **Step 4: Run test suite to verify pass**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: PASS (toàn bộ test cũ và test mới đều xanh).

- [ ] **Step 5: Commit**

```bash
git add src/server/roomManager.ts src/server/roomManager.test.ts
git commit -m "feat(server): add lobby seat swapping, Ready Check with rule-change reset, and botDifficulty"
```

---

### Task 3: Server Host Controls (`TRANSFER_HOST` & `KICK_PARTICIPANT`)

**Files:**
- Modify: `src/server/roomManager.ts:777-960`
- Modify: `src/server/roomManager.test.ts`

**Interfaces:**
- Produces in `OnlineRoomManager`:
  - `TRANSFER_HOST`: chỉ Host gọi được, mục tiêu phải là thành viên đang ngồi ghế và `connected === true`; cập nhật `room.hostSeatIndex`, đặt `target.ready = true`, broadcast snapshot.
  - `KICK_PARTICIPANT`: chỉ Host gọi được, không tự kick chính mình; gửi `ERROR(KICKED_BY_HOST)` cho người bị kick, xóa khỏi `clientSessions`, hủy `sessionToken` cũ; nếu trong `playing` thì chuyển ghế thành `explicitlyLeft = true` và giao cho Bot AI.

- [ ] **Step 1: Write failing tests for `TRANSFER_HOST` and `KICK_PARTICIPANT`**

Thêm test vào `src/server/roomManager.test.ts`:
- `TRANSFER_HOST`: Host c1 chuyển quyền cho c2 → c2 có thể gọi `UPDATE_LOBBY_SETTINGS`, c1 gọi sẽ bị `ERROR(FORBIDDEN)`.
- `KICK_PARTICIPANT` ở Lobby & Trong trận: c1 kick c2 → c2 nhận `ERROR(KICKED_BY_HOST)` → c2 thử `RECONNECT_ROOM` bằng `sessionToken` cũ bị từ chối `ERROR(SESSION_EXPIRED)`; nếu kick trong trận, nhân vật của c2 chuyển sang `isBot = true` với ghế đánh dấu `explicitlyLeft = true`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `TRANSFER_HOST` and `KICK_PARTICIPANT` in `src/server/roomManager.ts`**

- Xác thực quyền Host, hủy mọi `pendingSeatSwap` / `pendingTakeoverRequest` liên quan tới người bị kick, vô hiệu hóa `sessionToken` và gọi `broadcastSnapshot(room)`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/roomManager.ts src/server/roomManager.test.ts
git commit -m "feat(server): add TRANSFER_HOST and KICK_PARTICIPANT host controls"
```

---

### Task 4: Server Spectator Mode (Cap 4) & Hot-Join Bot Takeover

**Files:**
- Modify: `src/server/roomManager.ts:97-240, 390-510, 605-800, 1000-1120`
- Modify: `src/server/roomManager.test.ts`

**Interfaces:**
- Consumes: `PendingBotTakeoverRequest`, `ParticipantRole` từ Task 1 & Đợt 1.
- Produces in `OnlineRoomManager`:
  - Hằng số `MAX_SPECTATORS_PER_ROOM = 4`.
  - Hỗ trợ `spectators: SpectatorRecord[]` trong `RoomRecord` (tham gia qua `JOIN_ROOM` khi phòng đang `playing` hoặc đã đầy ghế `lobby`, kết nối lại qua `RECONNECT_ROOM`, rời qua `LEAVE_ROOM`, chuyển xuống qua `MOVE_TO_SPECTATOR`, lên ghế trống ở `lobby` qua `MOVE_TO_SEAT`).
  - Xử lý `REQUEST_BOT_TAKEOVER` (timeout `20_000ms`) và `RESPOND_BOT_TAKEOVER` với bộ lọc bảo vệ ghế rớt mạng tạm thời (`explicitlyLeft === false`).
  - Khán giả nhận `ROOM_SNAPSHOT`, `GAME_EVENT` (trừ chat kênh `TEAM`), `RTC_SIGNAL`, và gửi được chat `ALL` + `UPDATE_VOICE_STATE`.

- [ ] **Step 1: Write failing tests in `src/server/roomManager.test.ts`**

Thêm 4 test:
- `Spectator admission & cap 4`: phòng đang `playing` đón được tối đa `4` Khán giả qua `JOIN_ROOM` (với `yourSeatIndex === null`, `yourPlayerId === null`); người thứ 5 nhận `ERROR(ROOM_FULL)`.
- `Spectator chat & TEAM isolation`: Khán giả gửi `SEND_CHAT_MESSAGE` kênh `TEAM` bị ép về `ALL`; Khán giả không nhận tin `TEAM` của đội A/B trong `2v2`.
- `Hot-Join Bot Takeover eligibility`:
  - Khán giả xin thế chỗ Bot bù từ đầu trận → Host duyệt → Khán giả trở thành người chơi giữ đúng `participantId`, `player.isBot === false`, `player.name` cập nhật theo người mới; nếu đang đúng lượt Bot đó, `botActionTimer` bị hủy và `turnTimeLeft >= 18`.
  - Người chơi c2 rớt mạng tạm thời (bị Bot lái tạm sau 90s nhưng `explicitlyLeft === false`) → Khán giả gửi `REQUEST_BOT_TAKEOVER` vào ghế c2 bị từ chối `ERROR(SEAT_RESERVED_FOR_RECONNECT)`.
  - Người chơi c2 chủ động `LEAVE_ROOM` (`explicitlyLeft === true`) → Khán giả xin thế chỗ ghế c2 được phép và Host duyệt thành công.
- `MOVE_TO_SPECTATOR`: trong `lobby`, Host bấm xuống làm Khán giả khi có khách ngồi ghế → quyền Host tự chuyển sang khách đang kết nối.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Spectator lifecycle and Hot-Join Bot Takeover in `src/server/roomManager.ts`**

- Tách helper `findParticipantBySession(room, sessionToken)` trả về `{ kind: 'human', seat } | { kind: 'spectator', spectator } | null` để `LEAVE_ROOM`, `SEND_CHAT_MESSAGE`, `RTC_SIGNAL`, `UPDATE_VOICE_STATE`, `KICK_PARTICIPANT` phục vụ đồng nhất cho cả hai nhóm.
- Triển khai `isBotEligibleForTakeover(room, targetPlayerId)` kiểm tra đúng 3 điều kiện của Mục 4.3 đặc tả.
- Trong `broadcastSnapshot` và `emitVisualEvent`, duyệt qua cả `room.humans` và `room.spectators` (với `spectator`, `yourSeatIndex = null`, `yourPlayerId = null`, không trả tin `TEAM`).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/roomManager.ts src/server/roomManager.test.ts
git commit -m "feat(server): add spectator mode (max 4) and host-approved hot-join bot takeover"
```

---

### Task 5: Client Hook & Lobby UI (`onlineClient.ts`, `OnlineLobbyPanel.tsx`)

**Files:**
- Modify: `src/utils/onlineClient.ts:94-526`
- Modify: `src/utils/onlineClient.test.ts`
- Modify: `src/components/OnlineLobbyPanel.tsx`

**Interfaces:**
- Produces từ `useOnlineMultiplayer`:
  - `isSpectator: boolean` (`Boolean(roomSnapshot && yourSeatIndex === null)`).
  - `moveToSeat(targetSeatIndex: number)`, `requestSeatSwap(targetSeatIndex: number)`, `respondSeatSwap(requestId: string, accept: boolean)`, `hostSwapSeats(seatA: number, seatB: number)`, `moveToSpectator()`, `setReady(ready: boolean)`, `transferHost(targetParticipantId: string)`, `kickParticipant(targetParticipantId: string)`, `requestBotTakeover(targetPlayerId: number)`, `respondBotTakeover(requestId: string, accept: boolean)`.
  - `createRoom` & `updateLobbySettings` hỗ trợ `botDifficulty?: BotDifficulty`.

- [ ] **Step 1: Add `onlineClient.ts` actions & `KICKED_BY_HOST` handling + unit test**

- Trong `src/utils/onlineClient.ts`: thêm `msg.code === 'KICKED_BY_HOST'` vào nhóm lỗi dọn phiên (`writeStoredSession(null)`, `setRoomSnapshot(null)`) và xuất toàn bộ method mới.
- Thêm test vào `src/utils/onlineClient.test.ts` xác nhận `KICKED_BY_HOST` dọn sạch session và các method gửi đúng payload JSON.

- [ ] **Step 2: Upgrade `src/components/OnlineLobbyPanel.tsx`**

- Thêm bộ chọn **Độ khó Bot AI** (`Tập sự` / `Sành sỏi` / `Cá mập`, `data-testid="bt-bot-difficulty-*"`).
- Nâng cấp từng thẻ ghế:
  - Hiển thị huy hiệu `Đội A (Xanh)` / `Đội B (Đỏ)` theo `seatIndex % 2` khi ở `TEAMS_2V2`, badge `Sẵn sàng` / `Chờ sẵn sàng`.
  - Click ghế trống gọi `moveToSeat(seatIndex)`; khách click ghế có người gọi `requestSeatSwap(seatIndex)`; Host có chế độ chọn 2 ghế để gọi `hostSwapSeats(a, b)`.
  - Menu nhỏ trên mỗi thành viên khác (chỉ Host thấy): **👑 Chuyển Host** & **🚫 Kick**.
- Hiển thị banner lời mời đổi ghế (`snapshot.pendingSeatSwap`) kèm nút **Đồng ý** / **Từ chối**.
- Khách có nút **✅ Sẵn sàng** (`data-testid="bt-ready-toggle-btn"`); nút **Bắt Đầu Ván Online** của Host tự `disabled` kèm chú thích khi còn khách chưa Sẵn sàng.
- Dải danh sách **Khán giả (`X/4`)** cùng nút *"👁️ Xuống làm Khán giả"* (cho người đang ngồi ghế) hoặc bấm vào ghế trống để lên chơi.

- [ ] **Step 3: Run unit tests and lint**

Run: `npx tsx --test src/utils/onlineClient.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/onlineClient.ts src/utils/onlineClient.test.ts src/components/OnlineLobbyPanel.tsx
git commit -m "feat(lobby): add 2v2 seat swap, Ready Check, host controls, bot difficulty, and spectator UI"
```

---

### Task 6: In-Match Spectator Bar, Hot-Join Bot Takeover Modal & E2E Verification

**Files:**
- Modify: `src/components/ActionDock.tsx:18-120, 420-560`
- Modify: `src/App.tsx`
- Create: `e2e/online-lobby-spectator.spec.ts`

**Interfaces:**
- `ActionDockProps` bổ sung `isOnlineSpectator?: boolean`, `eligibleTakeoverBots?: Array<{ playerId: number; name: string; color: string }>`, `onRequestBotTakeover?: (targetPlayerId: number) => void`.

- [ ] **Step 1: Wire Spectator bar and Host takeover approval dialog in `ActionDock.tsx` & `App.tsx`**

- Khi `online.isSpectator` trong trận `playing`:
  - Ẩn toàn bộ nút hành động lượt chơi; hiển thị thanh trạng thái *"👁️ Chế độ Khán giả — Đang xem trực tiếp"* kèm nút **"🎮 Xin thế chỗ Bot"** (chỉ bật khi có ít nhất 1 Bot đủ điều kiện, mở popover chọn Bot để gọi `online.requestBotTakeover(bot.playerId)`).
- Trên màn hình của Chủ phòng (`isOnlineHost`): khi `snapshot.pendingTakeoverRequest` khác `null`, hiển thị hộp thoại duyệt nổi (`data-testid="bt-takeover-approval-dialog"`) ghi rõ tên Khán giả + tên Bot muốn thế chỗ + đếm ngược `20s`, kèm 2 nút **Chấp nhận** / **Từ chối**.

- [ ] **Step 2: Write Playwright E2E test `e2e/online-lobby-spectator.spec.ts`**

Kịch bản 3 browser contexts (Host, Guest 1, Late Joiner):
- Host tạo phòng `TEAMS_2V2` (fillBots: true, botDifficulty: `'hard'`). Guest 1 tham gia ghế 1.
- Kiểm tra nút Bắt Đầu của Host bị khóa khi Guest 1 chưa bấm Sẵn sàng → Guest 1 nhảy sang ghế 2 (cùng Đội A với Host) → bấm Sẵn sàng → Host bấm Bắt Đầu thành công.
- Late Joiner mở link `?room=CODE` khi ván đang chạy → tự động vào **Chế độ Khán giả**, thấy bàn cờ 3D và thanh *"👁️ Chế độ Khán giả"*.
- Late Joiner bấm **Xin thế chỗ Bot** → Host thấy hộp thoại duyệt và bấm **Chấp nhận** → Late Joiner chuyển thành người chơi thật trên bàn cờ (thanh Khán giả biến mất, tên nhân vật cập nhật).

- [ ] **Step 3: Run full verification suite**

Run:
```bash
npm run lint
npm test
npm run build
npx playwright test e2e/online-lobby-spectator.spec.ts --headed
```
Expected: Tất cả lint, unit tests, production build và E2E test đều PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActionDock.tsx src/App.tsx e2e/online-lobby-spectator.spec.ts
git commit -m "feat(online): add in-match spectator bar, host-approved hot-join bot takeover, and E2E tests"
```
