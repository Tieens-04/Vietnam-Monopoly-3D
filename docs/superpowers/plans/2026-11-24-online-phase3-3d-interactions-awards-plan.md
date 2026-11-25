# Đợt 3 — Vật Phẩm Ném 3D, Ping Ô Đất Công Khai, Chuỗi Trận & Card Vinh Danh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung 4 vật phẩm ném 3D "cà khịa" (Object Pool 4 slot mượt trên iGPU), hệ thống Ping chỉ điểm ô đất 3D công khai cho cả PC & Mobile, thống kê Danh hiệu hài hước cuối ván, Bảng điểm Chuỗi trận theo phòng và tính năng xuất ảnh Card Tổng kết `1200 × 675` PNG.

**Architecture:** Tách logic tính Danh hiệu thành module thuần `src/game/postMatchAwards.ts`, hợp nhất điểm kết thúc ván trong `OnlineRoomManager` (`finalizeMatchGameOver`) để cập nhật `postMatchAwards` và `seriesStandings` chính xác cho cả thắng thường lẫn thắng hết giờ 20 phút. Tầng 3D tạo `src/three/tauntProjectiles.ts` gắn trực tiếp vào vòng đời `SpecialEventEffects` (0 allocation trong runtime), còn xuất ảnh dùng thuần HTML5 Canvas 2D tại `src/utils/victoryCardExport.ts`.

**Tech Stack:** TypeScript, Three.js (`THREE.Group`/`MeshStandardMaterial` Object Pool), Web Audio API (`soundEngine.ts`), HTML5 Canvas 2D + Clipboard API, Node `node:test` + `tsx`, React 19, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-24-online-friends-social-lobby-design.md` (Mục 5, Mục 6.3)

## Global Constraints

- Phụ thuộc Đợt 1 (`participantId`, `participants`) đã hoàn tất; tương thích đầy đủ với Khán giả Đợt 2 (Khán giả thấy được hiệu ứng ném đồ 3D và Ping ô đất).
- Không cài thêm thư viện ngoài để xuất ảnh (dùng thuần HTML5 Canvas 2D `1200 × 675`).
- Ngân sách hiệu năng 3D iGPU: khởi tạo trước cố định `POOL_TAUNT_SLOTS = 4` và `POOL_PING_RINGS = 4`; **0** lần gọi `new THREE.BufferGeometry()` hay `new THREE.Material()` trong quá trình chơi; tôn trọng `prefers-reduced-motion`, `low` quality tier và công tắc tắt hiệu ứng ném đồ 3D của người dùng.
- Hồi chiêu bắt buộc từ đặc tả: `SEND_BOARD_TAUNT` là `4000ms`/client (không tự ném chính mình); `SEND_TILE_PING` là `2500ms`/client (công khai toàn phòng cả `FFA` lẫn `2v2`).
- Mọi thay đổi phải vượt qua `npm run lint`, `npm test`, và `npm run build`.

## Review Focus

- `src/server/roomManager.ts` hiện có **2 nhánh** chuyển sang `room.status = 'gameover'` (`roomManager.ts:3209` khi có người thắng/độc quyền và `roomManager.ts:3654` khi hết giờ 20 phút Sudden Death) — phải gộp vào 1 helper `finalizeMatchGameOver(room, result)` có cờ chống cộng trùng (`match.seriesRecorded`), tránh sót hoặc cộng đôi `seriesStandings`.
- Khi một người chơi thoát trận hoặc bị thế chỗ Bot giữa ván (Đợt 2), `seriesStandings` phải cộng điểm theo `participantId` của người đang thực sự nắm ghế lúc kết thúc ván (không cộng cho Bot thuần).
- Khi người dùng bấm **📋 Copy Ảnh** trên trình duyệt không hỗ trợ `ClipboardItem` hoặc trên HTTP không bảo mật (`navigator.clipboard?.write` bị lỗi), hàm phải tự động fallback sang tải file `.png` kèm thông báo thân thiện thay vì lỗi im lặng.
- Người chơi bật tùy chọn **"Tắt hiệu ứng ném đồ 3D"** (lưu `localStorage`) vẫn không bị lỗi khi nhận `GAME_EVENT(BOARD_TAUNT)` — client chỉ bỏ qua hoạt ảnh 3D + âm thanh ném đồ.
- Sự kiện Chuột phải (`contextmenu`) trên ô đất 3D để Ping không được hiện menu mặc định của trình duyệt khi click trúng ô đất, nhưng không làm hỏng thao tác kéo xoay/pan camera chuột phải nếu người dùng đang kéo chuột (`dragDistance > 6px`).

---

## File Structure

- Modify: `src/game/onlineTypes.ts` — thêm `BoardTauntKind`, `TilePingIntent`, `PlayerMatchStats`, `PostMatchAward`, `SeriesStandingEntry`, message `SEND_BOARD_TAUNT`, `SEND_TILE_PING`, `RESET_SERIES_SCORE`, event `BOARD_TAUNT`, `TILE_PING`.
- Create: `src/game/postMatchAwards.ts` & `src/game/postMatchAwards.test.ts` — hàm thuần tính 3–4 danh hiệu hài hước cuối ván.
- Modify: `src/server/roomManager.ts` & `src/server/roomManager.test.ts` — bộ đếm `MatchStats`, `finalizeMatchGameOver`, `seriesStandings`, `RESET_SERIES_SCORE`, `SEND_BOARD_TAUNT`, `SEND_TILE_PING`.
- Create: `src/three/tauntProjectiles.ts` — Object Pool 4 vật phẩm 3D (`slipper`, `tomato`, `confetti`, `cash_stack`) bay parabol `~0.65s`.
- Modify: `src/three/specialEventEffects.ts` & `src/three/specialEventEffects.test.ts` — tích hợp `TauntProjectilePool` và `POOL_PING_RINGS = 4` (`3.5s`).
- Modify: `src/audio/soundEngine.ts` — thêm `playBoardTauntSfx` và `playTilePingSfx`.
- Modify: `src/utils/onlineClient.ts` — thêm `sendBoardTaunt`, `sendTilePing`, `resetSeriesScore`.
- Modify: `src/components/MonopolyCanvas.tsx` — mở rộng `MonopolyCanvasHandle` (`playBoardTaunt`, `playTilePing`), hỗ trợ `Alt+Click` / Chuột phải (không kéo) lên ô đất và nhãn nổi `3.5s`.
- Modify: `src/components/PlayerHUD.tsx` — nút ném vật phẩm 3D trên thẻ đối thủ kèm vòng hồi chiêu `4s`.
- Modify: `src/components/TileModalAndDialogs.tsx` — cụm 3 nút Ping nhanh trong `TileInspectorCard`; hiển thị `postMatchAwards`, `seriesStandings`, và 2 nút Copy/Tải Ảnh trong `VictoryModal`.
- Modify: `src/components/ActionDock.tsx` — công tắc *"Tắt hiệu ứng ném đồ 3D"* trong menu Cài đặt.
- Modify: `src/components/OnlineLobbyPanel.tsx` — hiển thị bảng `seriesStandings` + nút Host **Reset điểm chuỗi trận**.
- Create: `src/utils/victoryCardExport.ts` & `src/utils/victoryCardExport.test.ts` — kết xuất Canvas `1200 × 675` PNG, Copy Clipboard & fallback tải file.
- Modify: `src/App.tsx` — nối event `BOARD_TAUNT`/`TILE_PING`, tùy chọn tắt ném đồ 3D và props Card/Series.
- Create: `e2e/online-taunt-ping-awards.spec.ts` — kiểm thử E2E ném vật phẩm, Ping ô đất và xuất ảnh Card.

---

### Task 1: Phase 3 Types & Pure Post-Match Awards (`postMatchAwards.ts`)

**Files:**
- Modify: `src/game/onlineTypes.ts:33-223`
- Create: `src/game/postMatchAwards.ts`
- Create: `src/game/postMatchAwards.test.ts`

**Interfaces:**
- Produces in `src/game/onlineTypes.ts`:
  - `export type BoardTauntKind = 'slipper' | 'tomato' | 'confetti' | 'cash_stack';`
  - `export type TilePingIntent = 'TARGET' | 'DANGER' | 'TROPHY';`
  - `export interface PlayerMatchStats { jailVisits: number; maxSingleRentCollected: number; totalRentCollected: number; totalRentPaid: number; sabotageCount: number; worldTourFlights: number; }`
  - `export interface PostMatchAward { id: 'CHUA_DAO_HOANG' | 'TRUM_THU_HO' | 'THANH_PHA_HOAI' | 'NHA_TAI_TRO_VANG' | 'PHUOT_THU'; icon: string; title: string; subtitle: string; playerId: number; playerName: string; playerColor: string; valueLabel: string; }`
  - `export interface SeriesStandingEntry { participantId: string; playerName: string; tokenType: TokenArchetype | null; wins: number; matchesPlayed: number; seriesPoints: number; }`
  - `OnlineMatchSnapshot` bổ sung `postMatchAwards?: PostMatchAward[]`.
  - `OnlineRoomSnapshot` bổ sung `seriesStandings: SeriesStandingEntry[]`.
  - `ClientToServerMessage` bổ sung `SEND_BOARD_TAUNT`, `SEND_TILE_PING`, `RESET_SERIES_SCORE`.
  - `OnlineVisualEvent` bổ sung `BOARD_TAUNT` (`fromPlayerId`, `fromPlayerName`, `targetPlayerId`, `tauntKind`) và `TILE_PING` (`participantId`, `playerId`, `senderName`, `senderColor`, `tileIndex`, `intent`).
- Produces in `src/game/postMatchAwards.ts`:
  - `export function createEmptyPlayerMatchStats(): PlayerMatchStats`
  - `export function computePostMatchAwards(players: ReadonlyArray<PlayerState>, statsByPlayerId: Record<number, PlayerMatchStats>): PostMatchAward[]`

- [ ] **Step 1: Write failing unit tests in `src/game/postMatchAwards.test.ts`**

Kiểm tra:
- Trả về đúng tối đa `4` danh hiệu khi cả 4 chỉ số đạt ngưỡng (`jailVisits >= 1`, `maxSingleRentCollected >= 100_000`, `sabotageCount >= 1`, `totalRentPaid >= 100_000`).
- Bỏ qua hoàn toàn các danh hiệu có chỉ số `0` hoặc dưới ngưỡng (ván nhanh không ai vào tù thì không trao *Chúa Đảo Hoang*).
- Ưu tiên trao *Nhà Tài Trợ Vàng* cho người khác với *Trùm Thu Họ* nếu có ứng viên đủ ngưỡng; nếu không ai đạt ngưỡng `totalRentPaid >= 100_000` thì xét fallback sang *Phượt Thủ Xuyên Việt* (`worldTourFlights >= 1`).
- Hòa chỉ số phân định tất định theo `playerId` nhỏ hơn.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/game/postMatchAwards.test.ts`
Expected: FAIL (`Cannot find module './postMatchAwards'`).

- [ ] **Step 3: Update `src/game/onlineTypes.ts` and implement `src/game/postMatchAwards.ts`**

- Cập nhật các type/interface mới trong `src/game/onlineTypes.ts`.
- Viết `createEmptyPlayerMatchStats` và `computePostMatchAwards` tại `src/game/postMatchAwards.ts` đúng theo 4 quy tắc ở Mục 5.3 đặc tả.

- [ ] **Step 4: Run tests and lint to verify pass**

Run: `npx tsx --test src/game/postMatchAwards.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/onlineTypes.ts src/game/postMatchAwards.ts src/game/postMatchAwards.test.ts
git commit -m "feat(game): add Phase 3 taunt/ping/series types and postMatchAwards calculator"
```

---

### Task 2: Server `MatchStats`, `seriesStandings`, `SEND_BOARD_TAUNT` & `SEND_TILE_PING`

**Files:**
- Modify: `src/server/roomManager.ts:100-245, 390-510, 955-998, 1096-1160, 2480-2860, 3200-3240, 3645-3675`
- Modify: `src/server/roomManager.test.ts`

**Interfaces:**
- Consumes: `computePostMatchAwards`, `createEmptyPlayerMatchStats`, `BoardTauntKind`, `TilePingIntent`, `SeriesStandingEntry` từ Task 1.
- Produces in `OnlineRoomManager`:
  - `SEND_BOARD_TAUNT`: kiểm tra đang `playing`, cả 2 `playerId` hợp lệ, `senderPlayerId !== targetPlayerId`, cooldown `4000ms`, phát `GAME_EVENT(BOARD_TAUNT)`.
  - `SEND_TILE_PING`: kiểm tra đang `playing`, `isValidTileIndex(tileIndex)`, cooldown `2500ms`, phát `GAME_EVENT(TILE_PING)` công khai cho toàn bộ `humans` & `spectators`.
  - `finalizeMatchGameOver(room, result)`: tính `postMatchAwards`, cộng dồn `seriesStandings` (FFA: `4/3/2/1` điểm & `+1` win hạng 1; 2v2: thắng `+3` điểm & `+1` win, thua `+1` điểm) chỉ 1 lần duy nhất (`seriesRecorded = true`).
  - `RESET_SERIES_SCORE`: chỉ Host gọi được, xóa trắng `room.seriesStandings` và broadcast snapshot.

- [ ] **Step 1: Write failing tests in `src/server/roomManager.test.ts`**

Thêm 3 test:
- `SEND_BOARD_TAUNT`: c1 ném `'slipper'` vào c2 thành công và cả phòng (gồm cả Khán giả) nhận `GAME_EVENT(BOARD_TAUNT)`; ném vào chính mình trả `ERROR(INVALID_TARGET)`; ném lại ngay trong `< 4000ms` trả `ERROR(RATE_LIMITED)`.
- `SEND_TILE_PING`: c1 ping ô `5` với intent `'TARGET'` trong trận `2v2` → cả đồng đội, đối thủ lẫn Khán giả đều nhận `GAME_EVENT(TILE_PING)`; ping ô `99` trả `ERROR(INVALID_TILE)`; ping lại trong `< 2500ms` trả `ERROR(RATE_LIMITED)`.
- `seriesStandings & postMatchAwards`: hoàn tất 1 ván FFA (và test cả nhánh hết giờ 20p) → `snapshot.match.postMatchAwards` có dữ liệu, `snapshot.seriesStandings` cộng đúng `4` điểm + `1` win cho người thắng → `RETURN_TO_LOBBY` giữ nguyên `seriesStandings` → Host gửi `RESET_SERIES_SCORE` xóa về mảng rỗng.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement stats tracking, `finalizeMatchGameOver`, taunts, and pings in `src/server/roomManager.ts`**

- Thêm `statsByPlayerId: Record<number, PlayerMatchStats>`, `postMatchAwards: PostMatchAward[]`, `seriesRecorded: boolean` vào `MatchRecord`; `seriesStandings: Map<string, SeriesStandingEntry>` vào `RoomRecord`; `lastTauntAtByClient` và `lastPingAtByClient` vào `OnlineRoomManager` (nhớ dọn trong `handleDisconnect` và `dispose`).
- Gắn điểm cộng chỉ số tại: vào Đảo Hoang (`jailVisits`), thanh toán tiền thuê (`maxSingleRentCollected`, `totalRentCollected`, `totalRentPaid`), `CONFIRM_BUYOUT` + `EARTHQUAKE` + `POWER_OUTAGE` (`sabotageCount`), `SELECT_WORLD_TOUR` (`worldTourFlights`).
- Gộp 2 vị trí kết thúc trận (`roomManager.ts:3209` và `roomManager.ts:3654`) qua `finalizeMatchGameOver(room, result)`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/roomManager.ts src/server/roomManager.test.ts
git commit -m "feat(server): add MatchStats, postMatchAwards, seriesStandings, board taunts, and tile pings"
```

---

### Task 3: 3D Pooled Taunt Projectiles, Tile Ping Rings & Synthesized SFX

**Files:**
- Create: `src/three/tauntProjectiles.ts`
- Modify: `src/three/specialEventEffects.ts:108-165, 800-1018`
- Modify: `src/audio/soundEngine.ts`
- Modify: `src/three/specialEventEffects.test.ts`

**Interfaces:**
- Produces in `src/three/tauntProjectiles.ts`:
  - `export const POOL_TAUNT_SLOTS = 4;`
  - `export interface TauntProjectilePool { playTaunt(kind: BoardTauntKind, fromX: number, fromZ: number, toX: number, toZ: number): void; cancelAll(): void; dispose(): void; getActiveSlotCount(): number; }`
  - `export function createTauntProjectilePool(options: { scene: THREE.Scene; director: AnimationDirector; getQualityTier: () => GraphicsQualityTier; getReducedMotion: () => boolean; }): TauntProjectilePool`
- Produces on `SpecialEventEffects` (`src/three/specialEventEffects.ts`):
  - `playBoardTaunt: (kind: BoardTauntKind, fromX: number, fromZ: number, toX: number, toZ: number) => void;`
  - `playTilePing: (tileIndex: number, colorHex: string, durationSec?: number) => void;`
- Produces on `SoundEngine` (`src/audio/soundEngine.ts`):
  - `playBoardTauntSfx(kind: BoardTauntKind): void`
  - `playTilePingSfx(intent: TilePingIntent): void`

- [ ] **Step 1: Write failing tests in `src/three/specialEventEffects.test.ts`**

Kiểm tra:
- Gọi `playBoardTaunt` 6 lần liên tiếp chỉ tái sử dụng tối đa `4` slot trong pool (`POOL_TAUNT_SLOTS = 4`), không tạo thêm mesh con mới vào `scene`.
- Gọi `playTilePing` 6 lần liên tiếp chỉ tái sử dụng tối đa `4` vòng sáng (`POOL_PING_RINGS = 4`).
- Hoạt động an toàn không ném lỗi dưới cả `reducedMotion = true` và `qualityTier = 'low'`; `cancelAll()` & `dispose()` ẩn và giải phóng sạch geometry/material.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/three/specialEventEffects.test.ts`
Expected: FAIL vì `playBoardTaunt` và `playTilePing` chưa có trên `SpecialEventEffects`.

- [ ] **Step 3: Implement `tauntProjectiles.ts`, extend `specialEventEffects.ts`, and add SFX to `soundEngine.ts`**

- Trong `src/three/tauntProjectiles.ts`: khởi tạo sẵn `4` slot tổ hợp 4 biến thể mesh nhẹ (`slipper`, `tomato`, `confetti`, `cash_stack`) bằng `THREE.Group` + geometry dùng chung; animation bay parabol `0.65s` qua `createManagedGsapTimeline(director, ...)` và nảy nhẹ tại đích (nếu `reducedMotion` thì nhấp nháy ngắn `0.25s` tại đích).
- Trong `src/three/specialEventEffects.ts`: khởi tạo `tauntPool` và `4` vòng `RingGeometry` ping (`POOL_PING_RINGS = 4`), pulse `3.5s` theo `colorHex`, dọn sạch trong `cancelAll()` và `dispose()`.
- Trong `src/audio/soundEngine.ts`: tổng hợp âm vui ngắn bằng Web Audio Oscillator/Noise (`slipper` tiếng "bốp", `tomato` tiếng "bẹp", `confetti` tiếng "bụp" pháo giấy, `cash_stack` tiếng xòe tiền, và âm "ping" sắc nét cho `playTilePingSfx`).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test src/three/specialEventEffects.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/three/tauntProjectiles.ts src/three/specialEventEffects.ts src/three/specialEventEffects.test.ts src/audio/soundEngine.ts
git commit -m "feat(3d): add pooled 3D taunt projectiles, tile ping rings, and Web Audio SFX"
```

---

### Task 4: Wire 3D Taunts, Public Tile Pings & Disable Toggle Across UI

**Files:**
- Modify: `src/utils/onlineClient.ts`
- Modify: `src/components/MonopolyCanvas.tsx:123-180`
- Modify: `src/components/PlayerHUD.tsx:24-40, 260-480`
- Modify: `src/components/TileModalAndDialogs.tsx:136-380`
- Modify: `src/components/ActionDock.tsx:18-95, 520-680`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces from `useOnlineMultiplayer`: `sendBoardTaunt(targetPlayerId: number, tauntKind: BoardTauntKind)`, `sendTilePing(tileIndex: number, intent: TilePingIntent)`, `resetSeriesScore()`.
- `MonopolyCanvasHandle` bổ sung `playBoardTaunt(kind: BoardTauntKind, fromPlayerId: number, targetPlayerId: number): void` và `playTilePing(tileIndex: number, colorHex: string, label: string): void`.
- `MonopolyCanvasProps` bổ sung `onPingTile?: (tileIndex: number, intent: TilePingIntent) => void`.
- `PlayerHUDProps` bổ sung `onSendBoardTaunt?: (targetPlayerId: number, kind: BoardTauntKind) => void` và `tauntCooldownUntil?: number`.
- `TileInspectorCard` bổ sung `canPingTile?: boolean` và `onPingTile?: (tileIndex: number, intent: TilePingIntent) => void`.
- `ActionDockProps` bổ sung `disable3dTaunts?: boolean` và `onToggleDisable3dTaunts?: () => void`.

- [ ] **Step 1: Extend `onlineClient.ts` and `MonopolyCanvas.tsx`**

- Thêm `sendBoardTaunt`, `sendTilePing`, `resetSeriesScore` vào `src/utils/onlineClient.ts`.
- Trong `src/components/MonopolyCanvas.tsx`:
  - Nối `playBoardTaunt` (lấy vị trí thế giới hiện tại của 2 quân cờ `fromPlayerId` → `targetPlayerId`) và `playTilePing` vào `specialEventEffects`.
  - Hỗ trợ `Alt + Click` và Chuột phải (khi khoảng kéo `<= 6px`, gọi `e.preventDefault()`) vào hitMesh ô đất → gọi `onPingTile?.(tileIndex, 'TARGET')`.
  - Hiển thị overlay nhãn chữ nổi `3.5s` (tối đa 4 nhãn cùng lúc) chiếu từ tọa độ 3D của ô đất được Ping lên màn hình.

- [ ] **Step 2: Add Taunt Picker in `PlayerHUD`, Ping Buttons in `TileInspectorCard`, and Toggle in `ActionDock`**

- Trong `PlayerHUD.tsx`: trên thẻ đối thủ (khi đang trận Online & không phải chính mình & không phải Khán giả), thêm nút mục tiêu nhỏ (`data-testid="bt-taunt-trigger-p{id}"`) mở popover chọn 4 vật phẩm (`🩴`, `🍅`, `🎉`, `💸`).
- Trong `TileInspectorCard` (`TileModalAndDialogs.tsx`): khi `canPingTile`, hiện cụm 3 nút (`🎯 Nhắm ô này`, `⚠️ Coi chừng`, `🏆 Đặt Cúp đây`, `data-testid="bt-tile-ping-*"`).
- Trong `ActionDock.tsx`: thêm công tắc *"Tắt hiệu ứng ném đồ 3D"* (`data-testid="bt-disable-3d-taunts-toggle"`) trong menu Cài đặt; `App.tsx` lưu trạng thái vào `localStorage` (`bt_disable_3d_taunts_v1`) và bỏ qua gọi `playBoardTaunt` + `playBoardTauntSfx` khi đang bật tắt hiệu ứng.

- [ ] **Step 3: Run lint and unit tests**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/onlineClient.ts src/components/MonopolyCanvas.tsx src/components/PlayerHUD.tsx src/components/TileModalAndDialogs.tsx src/components/ActionDock.tsx src/App.tsx
git commit -m "feat(online): wire 3D taunt projectiles, public tile pings, and disable-taunts setting"
```

---

### Task 5: Victory Card PNG Export (`1200 × 675`), Series Standings UI & E2E Verification

**Files:**
- Create: `src/utils/victoryCardExport.ts`
- Create: `src/utils/victoryCardExport.test.ts`
- Modify: `src/components/OnlineLobbyPanel.tsx`
- Modify: `src/components/TileModalAndDialogs.tsx:1405-1655`
- Modify: `src/App.tsx`
- Create: `e2e/online-taunt-ping-awards.spec.ts`

**Interfaces:**
- Produces in `src/utils/victoryCardExport.ts`:
  - `export const VICTORY_CARD_WIDTH = 1200;`
  - `export const VICTORY_CARD_HEIGHT = 675;`
  - `export interface VictoryCardExportData { roomCode?: string; winnerName: string; victoryLabel: string; rankedPlayers: Array<{ rank: number; name: string; color: string; netWorthText: string; isWinner?: boolean }>; awards: PostMatchAward[]; seriesStandings: SeriesStandingEntry[]; }`
  - `export function renderVictoryCardCanvas(data: VictoryCardExportData, canvasFactory?: (w: number, h: number) => HTMLCanvasElement): HTMLCanvasElement`
  - `export function downloadVictoryCardPng(canvas: HTMLCanvasElement, filename?: string): void`
  - `export async function copyVictoryCardToClipboard(canvas: HTMLCanvasElement, filename?: string): Promise<'copied' | 'downloaded'>`

- [ ] **Step 1: Write failing unit tests in `src/utils/victoryCardExport.test.ts`**

Kiểm tra:
- `renderVictoryCardCanvas` tạo canvas đúng kích thước `1200 × 675` và gọi các lệnh vẽ chữ chứa `roomCode`, `winnerName`, tên từng danh hiệu trong `awards`, và điểm chuỗi trận trong `seriesStandings` (dùng mock `CanvasRenderingContext2D` ghi log `fillText`).
- `copyVictoryCardToClipboard` trả `'copied'` khi `navigator.clipboard.write` thành công, và tự động fallback gọi download & trả `'downloaded'` khi `ClipboardItem` không tồn tại hoặc `clipboard.write` reject.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/utils/victoryCardExport.test.ts`
Expected: FAIL (`Cannot find module './victoryCardExport'`).

- [ ] **Step 3: Implement `src/utils/victoryCardExport.ts` and wire Series Standings + Awards into `OnlineLobbyPanel` & `VictoryModal`**

- Viết `src/utils/victoryCardExport.ts` với bố cục 16:9 nền xanh đêm/vàng kim sắc nét (`1200 × 675`), chữ tiếng Việt font `Be Vietnam Pro`, không phụ thuộc thư viện ngoài.
- Trong `OnlineLobbyPanel.tsx`: hiển thị thẻ **🏆 Bảng Điểm Chuỗi Trận** (khi `seriesStandings.length > 0`) sắp xếp theo `seriesPoints` giảm dần, kèm nút **🔄 Reset điểm** cho Host (`data-testid="bt-reset-series-btn"`).
- Trong `VictoryModal` (`TileModalAndDialogs.tsx`): bổ sung props `roomCode?: string`, `postMatchAwards?: PostMatchAward[]`, `seriesStandings?: SeriesStandingEntry[]`; hiển thị cụm huy hiệu **Danh hiệu Hài hước**, bảng **Chuỗi trận**, và 2 nút **📋 Copy Ảnh** (`data-testid="bt-copy-victory-card-btn"`) + **⬇️ Tải Ảnh PNG** (`data-testid="bt-download-victory-card-btn"`).

- [ ] **Step 4: Write Playwright E2E test `e2e/online-taunt-ping-awards.spec.ts`**

Kịch bản 2 browser contexts (Host + Guest):
- Vào trận Online → Host mở nút ném đồ trên thẻ Guest và ném `🩴 Dép tổ ong` → kiểm tra không có console/page error và nút vào hồi chiêu `4s`; bật công tắc *"Tắt hiệu ứng ném đồ 3D"* trong Cài đặt và xác nhận lưu `localStorage`.
- Host bấm chọn 1 ô đất mở `TileInspectorCard` → bấm `🎯 Nhắm ô này` → Guest nhìn thấy nhãn Ping nổi của Host trên bàn cờ.
- Xác nhận luồng xuất ảnh Card tổng kết (`renderVictoryCardCanvas` tạo PNG `1200 × 675` hợp lệ không lỗi).

- [ ] **Step 5: Run full verification suite**

Run:
```bash
npm run lint
npm test
npm run build
npx playwright test e2e/online-taunt-ping-awards.spec.ts --headed
```
Expected: Tất cả lint, unit tests, production build và E2E test đều PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/victoryCardExport.ts src/utils/victoryCardExport.test.ts src/components/OnlineLobbyPanel.tsx src/components/TileModalAndDialogs.tsx src/App.tsx e2e/online-taunt-ping-awards.spec.ts
git commit -m "feat(online): add series standings UI, post-match awards, 1200x675 victory card export, and E2E tests"
```
