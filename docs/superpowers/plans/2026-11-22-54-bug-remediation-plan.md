# Kế Hoạch Khắc Phục Tổng Thể 54 Lỗi (`BUG-01`–`BUG-54`) — Cờ Tỷ Phú 3D Việt Nam

- **Ngày lập**: `2026-11-22`
- **Dự án**: `cờ-tỷ-phú-3d-việt-nam`
- **Tài liệu tham chiếu**: `master_bug_report.md` (54 lỗi đã khử trùng lặp), `business_tour_rules_spec.md` (chuẩn Business Tour Creobit / 8Floor), `docs/superpowers/specs/2026-11-19-business-tour-phase1-design.md`.
- **Tổng số lỗi**: **54** (`3 Critical`, `13 High`, `25 Medium`, `13 Low`).
- **Quyết định phạm vi đã chốt**:
  - **R2 — Chuẩn hóa 100% nhóm luật Business Tour gốc**: `BUG-01`, `BUG-02`, `BUG-03`, `BUG-04`, `BUG-05`, `BUG-10`.
  - **R3 — Giữ nguyên các biến thể kinh tế cân bằng hiện tại & đồng bộ spec/UI + sửa logic thẻ Cơ Hội**:
    - Giữ nguyên `BUG-06` (thuê 4 Khu nghỉ dưỡng `50K / 150K / 400K / 1M`), `BUG-07` (`CHAMPIONSHIP_FEE = 0`, dọn nhánh chết `"không đủ 0K"`), `BUG-08` (lượt 3 tại Đảo Hoang giải cứu miễn phí `$0`), và `BUG-09` (thanh lý tài sản trả nợ / phá sản hoàn `100%`). Đồng bộ tài liệu thiết kế và `RulebookModal`.
    - Sửa `BUG-14` (`ch-10` `COLLECT_FROM_ALL` buộc trả đủ `25K` qua quy trình bán tài sản / phá sản nếu thiếu tiền mặt) và `BUG-18` (`ch-14` `POWER_OUTAGE` giữ mất điện tới khi đối thủ ghé, không tự xóa khi chính chủ/đồng đội dừng vào).
  - **R4 — Sửa toàn bộ 42 lỗi kỹ thuật còn lại** (`BUG-11`–`BUG-13`, `BUG-15`–`BUG-17`, `BUG-19`–`BUG-54`) đồng bộ cả Offline (`App.tsx`) lẫn Online (`roomManager.ts`, `wsServer.ts`, `appServer.ts`, `onlineClient.ts`), UI/Responsive/A11y, 3D/WebGL và Audio.

---

## 1. Bảng Kế Hoạch Sửa Lỗi Theo Thứ Tự Ưu Tiên (`Critical` -> `High` -> `Medium` -> `Low`)

### Nhóm 1: `Critical` (3 lỗi — Xử lý trước tiên tại tầng lõi & ranh giới I/O)

| # | Mã Lỗi | Phân hệ | Tệp bị ảnh hưởng | Giải pháp khắc phục | Phụ thuộc |
|---:|:---|:---|:---|:---|:---|
| 1 | `BUG-11` | State Machine Offline | `src/App.tsx` | Bổ sung các hàm commit đồng bộ (`commitTurnPhase`, `commitScreenState`, `commitPendingDebt`, `commitDrawnCard`) cập nhật `.current` ref ngay lập tức trước khi gọi `setState`, triệt tiêu double-dispatch giữa 2 lần render. | Trước M4 E2E |
| 2 | `BUG-21` | Server / WS Security | `src/server/wsServer.ts`, `src/server/roomManager.ts` | Bọc `try/catch` quanh `roomManager.handleClientMessage` trong `wsServer.ts`; kiểm tra kiểu runtime chặt chẽ cho mọi `ClientToServerMessage` và `OnlineGameAction` trước khi truy xuất thuộc tính trong `roomManager.ts`. | Độc lập |
| 3 | `BUG-22` | Rules / Validation / Server / Client | `src/game/rules.ts`, `src/server/roomManager.ts`, `src/App.tsx` | Kiểm tra `typeof === 'number' && Number.isInteger` + miền giá trị hợp lệ qua `isValidInitialPurchaseLevel` (`0..maxTier`) và `isValidUpgradeTargetLevel` (`currentLevel < target <= 4`) chặn `NaN`, số thực, chuỗi và số âm/vượt trần. | Nền cho `BUG-02` |

### Nhóm 2: `High` (13 lỗi — Luật Business Tour cốt lõi, AFK, Bảo mật/Phòng chơi, UI/WebGL trọng yếu)

| # | Mã Lỗi | Phân hệ | Tệp bị ảnh hưởng | Giải pháp khắc phục | Phụ thuộc |
|---:|:---|:---|:---|:---|:---|
| 4 | `BUG-01` | Core Rules / Engine / UI | `src/game/{types,onlineTypes,boardData,rules}.ts`, `src/server/roomManager.ts`, `src/App.tsx`, `src/components/{BusinessTourActionModals,ActionDock,StartModal}.tsx` | Loại bỏ hoàn toàn `START_UPGRADE_SELECTION`, `SELECT_START_UPGRADE_CITY`, `BACK_TO_START_UPGRADE`, `SKIP_START_UPGRADE`, `allowRemoteFromStart`, `getStartUpgradableTileIndices`, `botPickStartUpgradePlan` và `StartUpgradeModal`. Ô `0` chỉ nhận `$300K` + tăng vòng `laps`. *(Supersedes `BUG-16`; cập nhật `rules.test.ts` Test 8 & 17, `roomManager.test.ts` Test 5 & 7, `e2e` Test 1).* | Dùng `@deprecated` shim trong M1A tới khi M2 gỡ hẳn |
| 5 | `BUG-02` | Core Rules / Engine / UI | `src/game/rules.ts`, `src/components/BusinessTourActionModals.tsx` | Trong `canUpgradeProperty`, chặn `desiredTarget > 3` khi `prop.level < 3`; chỉ mở khóa Khách sạn `level = 4 ★` khi `prop.level === 3 && player.laps >= 1 && isOnTileLanding === true`. Cập nhật `UpgradeDecisionModal` & `RulebookModal`. *(Cập nhật `rules.test.ts` Test 8 & 15, `roomManager.test.ts` Test 5 & 6, `e2e` Test 1).* | Sau `BUG-22` |
| 6 | `BUG-03` | Core Rules / Engine / UI | `src/game/{rules,boardData}.ts`, `src/components/BusinessTourActionModals.tsx` | Giới hạn `isValidWorldTourTarget` chỉ trả `true` cho ô `PROPERTY`/`RESORT` chưa có chủ (`ownerId === null`) hoặc thuộc chính người chơi (`ownerId === player.id`). Gỡ nhánh mua lại đối thủ & ô `16` khỏi `botPickWorldTourTarget`. Cập nhật `BOARD_TILES[24].description`, `WorldTourPrompt`, `RulebookModal`. *(Cập nhật `rules.test.ts` Test 15 & 19, `roomManager.test.ts` Test 5, `e2e` Test 2).* | Sau `BUG-23` |
| 7 | `BUG-04` | Core Rules / Engine / UI | `src/game/{types,onlineTypes,rules}.ts`, `src/App.tsx`, `src/server/roomManager.ts`, `src/components/{PlayerHUD,ActionDock,TileModalAndDialogs}.tsx` | Xuất `MATCH_DURATION_SECONDS = 1200` (`20:00`), thêm `'TIME_LIMIT'` vào `VictoryConditionKind`, thêm `matchTimeLeft` vào `OnlineMatchSnapshot`, cài `evaluateTimeLimitWinner` (xếp hạng theo Net Worth -> cash -> laps -> id; hoặc tổng đội trong `2v2`). Đồng bộ đồng hồ trận Offline/Online & `VictoryModal`. | Dùng `BUG-05` cho nhánh `TEAMS_2V2` |
| 8 | `BUG-12` | Online AFK / Bot Takeover | `src/game/onlineTypes.ts`, `src/server/roomManager.ts`, `src/utils/onlineClient.ts`, `src/components/PlayerHUD.tsx`, `src/App.tsx` | Bỏ ràng buộc `active.onlineConnected === false` tại `roomManager.ts:2638` để Bot AI tự tiếp quản người chơi online AFK dù vẫn giữ kết nối sau `>= 2` lượt lỡ; bổ sung action `RECLAIM_CONTROL` + nút HUD để lấy lại quyền điều khiển. | Độc lập |
| 9 | `BUG-13` | Offline / Online Timers | `src/server/roomManager.ts`, `src/App.tsx` | Đặt `doublesStreak = 0` trong tất cả nhánh hết giờ quyết định (`roomManager.ts`, `App.tsx`) trước khi auto-skip/auto-confirm để không thưởng thêm lượt 45s khi AFK. | Độc lập |
| 10 | `BUG-23` | Validation / Rules / Server / Client | `src/game/rules.ts`, `src/server/roomManager.ts`, `src/App.tsx` | Xuất `isValidTileIndex(v)` (`typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < TOTAL_TILES`) và kiểm tra cho `targetTile` ở `SELECT_WORLD_TOUR`, `CONFIRM_CHAMPIONSHIP`, `APPLY_TACTICAL_CARD`, `computeForwardSteps`, `computePathToTile`, `calculateRent`, `getValidTacticalCardTargets`. | Nền cho `BUG-03` |
| 11 | `BUG-24` | WS DoS & Rate Limit | `src/server/wsServer.ts`, `src/server/roomManager.ts` | Cấu hình `maxPayload: 16 * 1024`, giới hạn `MAX_WS_CLIENTS`, rate limit thông điệp theo socket, giới hạn `MAX_ROOMS`, cooldown chống spam `SEND_EMOTE`. | Độc lập |
| 12 | `BUG-25` | Server Room Lifecycle | `src/server/roomManager.ts` | Truyền `scheduleGraceCleanup = true` trong `CREATE_ROOM` / `JOIN_ROOM` và gọi `detachClientIfAny(clientId, true)` đầu `RECONNECT_ROOM` để dọn ghế/phòng zombie. | Độc lập |
| 13 | `BUG-26` | HTTP Security | `src/server/appServer.ts` | Bổ sung rate limit IP/session + xác thực kiểu & chống prompt injection trên `/api/bot-quip`, middleware bắt JSON syntax error (`400`), `app.all('/api/*', 404)` trước SPA fallback, security headers và tắt `x-powered-by`. | Độc lập |
| 14 | `BUG-31` | UI / Keyboard | `src/App.tsx`, `src/components/StartModal.tsx` | Ngăn listener bàn phím toàn cục cướp `Enter`/`Space` khi focus đang nằm trên control của `StartModal` hoặc trong `OnlineLobbyPanel`; khởi tạo ván đúng theo cấu hình state hiện tại của `StartModal`. | Độc lập |
| 15 | `BUG-32` | UI / State Sync | `src/App.tsx` | Tự động đóng `AssetManagementModal` (ngoại trừ `DEBT_RESOLUTION`) khi rời pha `AWAIT_ROLL` hoặc đổi người chơi hiện tại (Offline & Online), ngăn che modal quyết định (`z-30` vs `z-25`). | Độc lập |
| 16 | `BUG-44` | 3D WebGL Avatar | `src/components/PlayerAvatar3D.tsx` | Thêm `sizeSpec.pixel` vào dependency `useEffect`; theo dõi `webglcontextlost`/`webglcontextrestored`, vẽ fallback 2D khi mất context và xóa `snapshotCache` + render lại khi context khôi phục. | Độc lập |

### Nhóm 3: `Medium` (25 lỗi — Đấu đội `2v2`, Thẻ Cơ Hội, Đồng bộ Engine/Phòng, Responsive/A11y, 3D/Audio)

| # | Mã Lỗi | Phân hệ | Tệp bị ảnh hưởng | Giải pháp khắc phục | Phụ thuộc |
|---:|:---|:---|:---|:---|:---|
| 17 | `BUG-05` | Core Rules / Engine / UI | `src/game/{types,onlineTypes,rules}.ts`, `src/App.tsx`, `src/server/roomManager.ts`, `src/components/{StartModal,OnlineLobbyPanel,PlayerHUD,TileModalAndDialogs}.tsx` | Thêm `MatchMode = 'FFA' \| 'TEAMS_2V2'`, `TeamId = 0 \| 1`, `teamId?`, `winningTeamId?`. Trong `TEAMS_2V2`: miễn thuê/miễn mua lại/miễn thẻ tấn công giữa đồng đội, gộp tài sản xét độc quyền màu/cạnh/resort & `LAST_STANDING`, Bot AI hiểu đội, UI chọn đội & hiển thị bảng xếp hạng đội. | Nền cho `BUG-04` 2v2 |
| 18 | `BUG-06` | Economic Variant (Kept) | `docs/superpowers/specs/2026-11-19-business-tour-phase1-design.md`, `src/components/BusinessTourActionModals.tsx` | Giữ nguyên `RESORT_RENTS = [50_000, 150_000, 400_000, 1_000_000]`; cập nhật bảng hướng dẫn trong `RulebookModal` nhất quán 100%. | Độc lập |
| 19 | `BUG-14` | Logic Thẻ Cơ Hội (`ch-10`) | `src/game/{types,onlineTypes}.ts`, `src/App.tsx`, `src/server/roomManager.ts` | Thêm `PendingDebt.debtorId?`, `pendingDebtQueue?: PendingDebt[]`, `debtReturnToPlayerIndex?: number \| null`. Khi rút `ch-10` (`COLLECT_FROM_ALL`), đối thủ thiếu `25K` tiền mặt bị đưa vào hàng đợi `DEBT_RESOLUTION` buộc bán tài sản trả đủ `25K` hoặc phá sản trước khi trả lượt về người rút thẻ. | Phối hợp `BUG-05` (bỏ qua đồng đội) |
| 20 | `BUG-15` | Timers | `src/App.tsx`, `src/server/roomManager.ts` | Áp đặt sàn thời gian `18s` khi `SKIP_WORLD_TOUR` hoặc khi thiếu `50K` phí bay chuyển về `AWAIT_ROLL`. | Độc lập |
| 21 | `BUG-16` | Offline / Online Parity | `src/game/{types,onlineTypes,rules}.ts`, `src/App.tsx`, `src/server/roomManager.ts` | Hợp nhất loại bỏ cùng `BUG-01` (xóa hoàn toàn `BACK_TO_START_UPGRADE` và nhánh Bot nâng cấp tại Start). | Gắn với `BUG-01` |
| 22 | `BUG-17` | Pause / 3D Animation | `src/components/MonopolyCanvas.tsx`, `src/App.tsx` | Truyền prop `isPaused` vào `MonopolyCanvas` để đóng băng cập nhật `dt` của `activeDiceAnimRef` / `activeHopAnimRef` trong lúc `PauseModal` mở (chế độ Offline). | Độc lập |
| 23 | `BUG-27` | Room Lifecycle | `src/server/roomManager.ts` | Chỉ cho phép `RETURN_TO_LOBBY` khi `room.status === 'gameover'` và giữ lại các ghế `!explicitlyLeft` đang chờ reconnect. | Độc lập |
| 24 | `BUG-28` | Room Lifecycle | `src/server/roomManager.ts` | Trong `LEAVE_ROOM`, nếu còn ghế `!explicitlyLeft` thì lên lịch grace timer `90s` thay vì hủy phòng ngay. | Độc lập |
| 25 | `BUG-29` | Room Lifecycle | `src/server/roomManager.ts` | Tự động chuyển giao `hostSeatIndex` sang khách đang kết nối khi chủ phòng rớt mạng giữa trận hoặc ở `gameover`. | Độc lập |
| 26 | `BUG-30` | WS / Client / HUD Sync | `src/server/wsServer.ts`, `src/server/roomManager.ts`, `src/utils/onlineClient.ts`, `src/App.tsx` | Kiểm tra `ws.readyState === WebSocket.OPEN` trước khi gửi; gửi thông báo `SESSION_REPLACED` cho tab cũ; xóa `pendingQueueRef` khi `leaveRoom()` & đặt lại `sessionRef` lệch `?room=`; dọn timer & hiển thị `errorMessage` trên HUD. | Độc lập |
| 27 | `BUG-33` | UI Setup | `src/App.tsx` | Giữ đủ 4 phần tử `DEFAULT_PLAYER_CONFIGS` với `enabled: idx < validCount` khi khởi tạo từ `?players=2` / `3`. | Độc lập |
| 28 | `BUG-34` | UI Online Speed | `src/components/ActionDock.tsx` | Vô hiệu hóa/khóa nút tốc độ `2×` và ẩn huy hiệu `2×` khi `isOnlineMatch === true`. | Độc lập |
| 29 | `BUG-35` | UI Online Pause | `src/App.tsx`, `src/components/TileModalAndDialogs.tsx` | Hiển thị toast phản hồi copy link ngay trong `PauseModal`; không đóng băng WebGL hay che khuất modal quyết định khi mở `PauseModal` ở Online. | Độc lập |
| 30 | `BUG-36` | UI Copy Parity | `src/components/{BusinessTourActionModals,TileModalAndDialogs,StartModal}.tsx` | Đồng bộ `RulebookModal` (Đảo Hoang, 3 lần đổ đôi, Thuế 10%, Resort `50K/150K/400K/1M`, Mất điện + Mua lại, Xúc xắc chiến thuật, `2v2`, đồng hồ `20:00`), `WorldTourPrompt`, `TileInspectorCard` (Resort mất điện hiện `0K`), `StartModal` (ẩn gợi ý `Space` ở tab Online). | Sau `BUG-01`–`BUG-10` |
| 31 | `BUG-37` | Responsive (`390×844`) | `src/components/{StartModal,ActionDock}.tsx` | Sửa tràn chữ 2 tab đầu `StartModal` và cho phép `ActionDock` `flex-wrap` + khoảng trống an toàn phía trên `PlayerHUD`. | Độc lập |
| 32 | `BUG-38` | Responsive Overlap | `src/App.tsx`, `src/components/ActionDock.tsx` | Đẩy `bt-landing-cue` và Online Room Pill xuống dưới hàng HUD trên màn `<1024px`, giữ `ActionDock` ở `bottom-[110px]` tới breakpoint `lg:`. | Độc lập |
| 33 | `BUG-39` | Responsive (`844×390`) | `src/components/{ActionDock,PlayerHUD,TileModalAndDialogs,BusinessTourActionModals}.tsx` | Bổ sung `max-h-[calc(100dvh-1.5rem)] overflow-y-auto` cho mọi popover/modal và tạo khoảng thoáng tránh `PlayerHUD` đè `bt-right-utility-rail`. | Độc lập |
| 34 | `BUG-41` | Accessibility / Keyboard | `src/components/{ActionDock,StartModal,TileModalAndDialogs,BusinessTourActionModals}.tsx`, `src/App.tsx` | Gỡ `tabIndex={-1}` ở `ActionDock`; nâng `openMenu` để `Escape` ưu tiên đóng popover trước khi Pause; chặn `Space`/`Enter` khi `showAssetsModal` mở hoặc focus ở `<button>`/`<a>`; bổ sung `role="dialog"`, `aria-modal="true"`, focus trap cho các modal. | Độc lập |
| 35 | `BUG-45` | 3D Materials | `src/three/models.ts` | Bọc `nightPalette.tokenHeadlightMat` bằng `markSharedMat(...)` để không bị dispose sớm khi đổi quân cờ. | Độc lập |
| 36 | `BUG-46` | 3D GPU Disposal | `src/components/MonopolyCanvas.tsx` | Duyệt dispose mọi geometry và material không mang `sharedStatic` khi xóa mesh quân cờ của người chơi dư lúc giảm số người chơi. | Độc lập |
| 37 | `BUG-47` | 3D Postprocessing | `src/components/MonopolyCanvas.tsx` | Gọi `composer.setSize(w, h)` theo kích thước logic sau khi tạo `EffectComposer` và gắn pass, tránh cấp phát render target `pxRatio²`. | Độc lập |
| 38 | `BUG-48` | 3D Animation | `src/components/MonopolyCanvas.tsx`, `src/App.tsx` | Bổ sung `cancelPendingAnimations()` trên `MonopolyCanvasHandle` (gọi khi sang ván mới / thoát phòng) và cho phép `animDt` tiến theo `rawDt` khi `docHidden` trong `background_sim`. | Độc lập |
| 39 | `BUG-49` | 3D Pointer Input | `src/components/MonopolyCanvas.tsx` | Reset `hoveredTileIdx` và con trỏ `'grab'` khi `isBoardOccluded` bật; kiểm tra `pointerDownOnCanvas && !isBoardOccludedRef.current` trong `onPointerUp`. | Độc lập |
| 40 | `BUG-50` | 3D Cash Flow | `src/components/MonopolyCanvas.tsx` | So sánh thêm `prevCashPlayersSnapshot[i].id !== currentPlayers[i].id` khi phát hiện thay đổi dòng tiền giữa hai trận. | Độc lập |
| 41 | `BUG-54` | Web Audio | `src/audio/soundEngine.ts` | Bọc `new AudioContext()` bằng `try/catch`, bỏ qua lập lịch âm thanh khi `ctx.state !== 'running'`, định tuyến qua master `GainNode` + `DynamicsCompressorNode`. | Độc lập |

### Nhóm 4: `Low` (13 lỗi — Biến thể kinh tế giữ nguyên, Xúc xắc chiến thuật, Dọn mã & Tài nguyên 3D)

| # | Mã Lỗi | Phân hệ | Tệp bị ảnh hưởng | Giải pháp khắc phục | Phụ thuộc |
|---:|:---|:---|:---|:---|:---|
| 42 | `BUG-07` | Economic Variant (Kept) | `docs/superpowers/specs/2026-11-19-business-tour-phase1-design.md`, `src/server/roomManager.ts` | Giữ `CHAMPIONSHIP_FEE = 0` và tên `"CÚP QUỐC GIA"`; xóa nhánh chết `"không đủ 0K"` tại `roomManager.ts:1347-1348`; đồng bộ tài liệu thiết kế. | Độc lập |
| 43 | `BUG-08` | Economic Variant (Kept) | `src/components/BusinessTourActionModals.tsx` | Giữ thả miễn phí `$0` ở lượt 3 Đảo Hoang (`rules.ts:896-930`), cập nhật `RulebookModal` khớp hoàn toàn. | Độc lập |
| 44 | `BUG-09` | Economic Variant (Kept) | `docs/superpowers/specs/2026-11-19-business-tour-phase1-design.md`, `src/components/BusinessTourActionModals.tsx` | Giữ hoàn `100%` giá trị đầu tư khi bán trả nợ/phá sản; đồng bộ `line 175` của spec thiết kế và `RulebookModal`. | Độc lập |
| 45 | `BUG-10` | Core Rules / Engine / UI | `src/game/{types,onlineTypes,rules}.ts`, `src/App.tsx`, `src/server/roomManager.ts`, `src/components/{StartModal,OnlineLobbyPanel,ActionDock,BusinessTourActionModals}.tsx` | Thêm Xúc xắc chiến thuật (`TacticalDiceChoice = 'NORMAL' \| 'EVEN' \| 'ODD'`, `REROLL_DECISION`, `DEFAULT_EVEN_ODD_CHARGES = 3`, `DEFAULT_REROLL_CHARGES = 2`, `rollTacticalDicePair`, `botChooseTacticalDice`, `botShouldRerollDice`), công tắc phòng chờ `tacticalDiceEnabled` (mặc định `false` để tương thích ngược), UI chọn xúc xắc/đổ lại & `RulebookModal`. | Độc lập |
| 46 | `BUG-18` | Logic Thẻ Cơ Hội (`ch-14`) | `src/App.tsx`, `src/server/roomManager.ts` | Xóa `clearTileOutage` khi chính chủ đất (hoặc đồng đội trong `2v2`) dừng tại ô đang mất điện; chỉ xóa khi đối thủ ghé thăm ô đó. | Phối hợp `BUG-05` |
| 47 | `BUG-19` | Dead Code Cleanup | `src/game/{types,onlineTypes,rules,rules.test}.ts`, `src/App.tsx`, `src/server/roomManager.ts`, `src/components/ActionDock.tsx`, `docs/superpowers/specs/2026-11-19-business-tour-phase1-design.md` | Xóa hoàn toàn `AWAIT_END_TURN`, `END_TURN`, `resolvePostActionTurnPhase` (trong M1A giữ `@deprecated` shim tối thiểu nếu cần cho `tsc` tới khi M2 gỡ hẳn). | Gắn với `BUG-01` |
| 48 | `BUG-20` | Offline Cleanup | `src/App.tsx` | Giới hạn `ownerId` trong `?demo_showcase=1` theo `players.length` và tách `resetMatchStateToTitle()` dọn sạch timer/state phụ khi thoát trận. | Độc lập |
| 49 | `BUG-40` | 3D Texture Badge | `src/three/textures.ts` | Vẽ đồng thời `🛡️BV` và `🏆 ×N` ở vị trí tách biệt không đè nhau trong `createOuterPriceTabTexture`. | Độc lập |
| 50 | `BUG-42` | Accessibility / Forms | `src/components/{OnlineLobbyPanel,StartModal}.tsx` | Bọc `editingName` và `online-room-code-input` trong `<form onSubmit>`, bổ sung `aria-label`, `aria-pressed`, và `role="tablist"`/`role="tab"`/`aria-selected` cho `StartModal`. | Độc lập |
| 51 | `BUG-43` | Accessibility / Motion / Contrast | `src/index.css`, `src/components/{TileModalAndDialogs,ActionDock,PlayerHUD,OnlineLobbyPanel,StartModal,BusinessTourActionModals}.tsx` | Tôn trọng `prefers-reduced-motion: reduce`, lắng nghe `resize`, `aria-hidden="true"` trong `ConfettiOverlay`; thêm `.icon-hit-target` đạt chuẩn chạm cho nút nhỏ; đổi chữ `.bt-btn-gold` sang `text-slate-950` đảm bảo độ tương phản. | Độc lập |
| 52 | `BUG-51` | 3D GPU Disposal | `src/components/{MonopolyCanvas,PlayerAvatar3D}.tsx` | Lưu biến `const roomEnv = new RoomEnvironment()` và gọi `roomEnv.dispose()` ngay sau `pmremGenerator.fromScene(...)`. | Độc lập |
| 53 | `BUG-52` | 3D Token Hop | `src/components/MonopolyCanvas.tsx` | Dùng `computeTokenRestWorldPos` cho `toVec` kể cả khi `tilePath.length === 1` để đáp đúng slot người chơi. | Độc lập |
| 54 | `BUG-53` | 3D Treasury Disposal | `src/three/treasurySystem.ts` | Duyệt `group` trong `treasurySystem.dispose()` để tự giải phóng toàn bộ geometry và material của khay kho tiền và `shadowPlane`. | Độc lập |

---

## 2. Phụ Thuộc Giữa Các Phân Hệ & Lộ Trình Triển Khai

1. **Milestone 1 (`M1A` + `M1B`) & Milestone 3 (`M3`) chạy song song** trên tập tệp tách biệt:
   - **`M1A` (`docs/*`, `src/game/*`)**: Lập kế hoạch 54 lỗi, đồng bộ spec `2026-11-19-business-tour-phase1-design.md`, triển khai luật/kiểu dữ liệu cho `BUG-01`–`BUG-05`, `BUG-10`, `BUG-12`/`14`/`30` types, `BUG-19`, `BUG-22`, `BUG-23`, giữ `@deprecated` shim tối thiểu cho `App.tsx`/`ActionDock`/`BusinessTourActionModals`/`roomManager.ts` để `tsc --noEmit` luôn `0` lỗi, cập nhật & bổ sung `src/game/rules.test.ts`.
   - **`M1B` (`src/server/*`, `src/utils/onlineClient.ts`)**: Triển khai bảo mật & vòng đời phòng (`BUG-21`–`BUG-30`), AFK Bot takeover + `RECLAIM_CONTROL` (`BUG-12`), timer `20:00` (`BUG-04`), `2v2` (`BUG-05`), Xúc xắc chiến thuật (`BUG-10`), `BUG-13`–`BUG-19`, xóa nhánh chết `BUG-07`, cập nhật `roomManager.test.ts` và thêm `wsServer.test.ts`, `appServer.test.ts`.
   - **`M3` (`src/components/{MonopolyCanvas,PlayerAvatar3D}.tsx`, `src/three/*`, `src/audio/soundEngine.ts`)**: Khắc phục `BUG-40`, `BUG-44`–`BUG-54`, thêm `isPaused` & `cancelPendingAnimations()` (`BUG-17`, `BUG-48`) và viết test đơn vị `src/three/performanceAssets.test.ts`.
2. **E2E Testing Track (song song)**: Thiết kế & chuẩn bị bộ Playwright E2E có kiểm chứng theo 4 kích thước viewport (`1440×900`, `390×844`, `844×390`, `768×1024`) và toàn bộ 54 lỗi.
3. **Milestone 2 (`M2` — sau khi `M1` & `M3` đạt Gate PASS)**:
   - Tích hợp đầy đủ hợp đồng mới từ `M1` & `M3` vào `src/App.tsx`, `src/components/{StartModal,OnlineLobbyPanel,PlayerHUD,ActionDock,BusinessTourActionModals,TileModalAndDialogs}.tsx`, `src/index.css`.
   - Khắc phục `BUG-11`, `BUG-20`, `BUG-31`–`BUG-39`, `BUG-41`–`BUG-43`.
   - Gỡ bỏ hoàn toàn các `@deprecated` shims tạm thời trong `src/game/{types,onlineTypes,rules}.ts`.
4. **Milestone 4 (`M4` — Verification & Tier 5 Hardening)**: Chạy toàn bộ `npm run lint`, `npm test`, `npm run build`, và `npm run test:e2e` (`--headed`), xử lý mọi lỗi tích hợp và kiểm chứng đối kháng Tier 5 đến khi đạt 100% PASS.

---

## 3. Kế Hoạch Cập Nhật & Bổ Sung Kiểm Thử

1. **`src/game/rules.test.ts` (Cập nhật 5 test cũ + thêm 7 nhóm test mới)**:
   - **Test 7 (`L205-234`)**: Gỡ phụ thuộc `resolvePostActionTurnPhase` / `'AWAIT_END_TURN'` (`BUG-19`), kiểm thử trực tiếp `shouldGrantImmediateDoublesRoll`.
   - **Test 8 (`L256-300`)**: Cập nhật kiểm thử chặn nhảy cóc `Lv0/1/2 -> Lv4`, chỉ cho `Lv3 -> Lv4` khi `isOnTileLanding: true`, và chặn nâng cấp từ xa ở Start (`BUG-01`, `BUG-02`).
   - **Test 15 (`L457-528`)**: Cập nhật `isValidWorldTourTarget` trả `false` cho ô đối thủ (`1`), `START` (`0`), `WORLD_CHAMPIONSHIPS` (`16`), `CHANCE` (`12`), và cập nhật `botPickOnTileUpgradeTargetLevel` kỳ vọng `3` khi `level === 2` (`BUG-02`, `BUG-03`).
   - **Test 17 (`L587-666`)**: Gỡ `botPickStartUpgradePlan` (`BUG-01`).
   - **Test 19 (`L710-750`)**: Cập nhật kịch bản World Tour không còn chọn ô đối thủ `27` (`BUG-03`), thay bằng kiểm thử từ chối ô đối thủ và chọn ô trống thắng `TRIPLE_MONOPOLY`.
   - **Test mới**: `BUG-02` tiến trình nâng cấp `Lv0..2 -> 3 -> 4 ★`; `BUG-03` quét toàn bộ 32 ô cho `isValidWorldTourTarget`; `BUG-04` `MATCH_DURATION_SECONDS === 1200` & `evaluateTimeLimitWinner` (FFA & 2v2); `BUG-05` chế độ `2v2` (miễn thuê, chặn mua lại, chặn thẻ tấn công, gộp độc quyền/đồng đội); `BUG-10` xúc xắc chiến thuật (`EVEN`/`ODD`/`NORMAL` & Bot AI); `BUG-22`/`BUG-23` từ chối `NaN`, float, chuỗi, ngoài khoảng.
2. **`src/server/roomManager.test.ts` (Cập nhật Test 5, 6, 7 + thêm test mới)**:
   - Cập nhật Test 5, 6, 7 bỏ `START_UPGRADE_SELECTION`, áp dụng `Lv3 -> Lv4 ★`, kiểm tra World Tour chuẩn và sàn `18s` (`BUG-01`, `BUG-02`, `BUG-03`, `BUG-15`).
   - Thêm test cho AFK Bot takeover + `RECLAIM_CONTROL` (`BUG-12`), xóa `doublesStreak` khi timeout (`BUG-13`), `ch-10` hàng đợi nợ `25K` (`BUG-14`), `ch-14` giữ mất điện khi chủ đất dừng vào (`BUG-18`), đồng hồ trận `20:00` (`BUG-04`), `2v2` (`BUG-05`), xúc xắc chiến thuật (`BUG-10`), validation/lifecycle (`BUG-21`–`BUG-30`).
3. **`src/server/wsServer.test.ts` & `src/server/appServer.test.ts` (Mới — `M1B`)**:
   - Kiểm thử `maxPayload`, rate limit, `try/catch` WS, `SESSION_REPLACED`, `/api/bot-quip` rate limit & sanitization, JSON 400, `/api/*` 404, security headers (`BUG-21`, `BUG-24`, `BUG-26`, `BUG-30`).
4. **`src/three/performanceAssets.test.ts` (Mở rộng — `M3`)**:
   - Kiểm thử `createOuterPriceTabTexture` vẽ cả `🛡️BV` & `🏆 ×N` (`BUG-40`), `tokenHeadlightMat` mang `sharedStatic` (`BUG-45`), `treasurySystem.dispose()` (`BUG-53`), `soundEngine` khi `AudioContext` lỗi/treo (`BUG-54`).
5. **`e2e/business-tour-gameplay.spec.ts` (Mở rộng — `E2E Track` & `M4`)**:
   - Cập nhật Test 1 & 2 theo `BUG-01`/`BUG-02`/`BUG-03`, và bổ sung kịch bản cho toàn bộ 54 lỗi trên 4 viewport (`1440×900`, `390×844`, `844×390`, `768×1024`) chạy ở chế độ `--headed`.
