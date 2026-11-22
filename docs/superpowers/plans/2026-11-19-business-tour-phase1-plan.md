# Chuẩn Hóa Business Tour 3D Việt Nam (Giai Đoạn 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp dự án Cờ Tỷ Phú 3D Việt Nam lên bàn cờ 32 ô chuẩn Business Tour (20 tỉnh thành / 8 nhóm màu + 4 Khu nghỉ dưỡng Đảo/Vịnh + 4 Góc chuẩn), đồng nhất tiền thật `2,000,000`, chuẩn hóa luật xây nhà theo vòng (`laps`), Mua đứt `2×`, Bán trả nợ `100%` (`Auto-Sale`), Cúp Thế Giới lũy tiến, Sân bay Du Lịch lượt kế tiếp, Thuế `10%`, nhãn Tiền Thuê 3D động và vá dứt điểm toàn bộ lỗi hệ thống.

**Architecture:** Tách toàn bộ quy tắc không gian 32 ô, kinh tế, hệ số Lễ Hội/Cúp, thuật toán `Auto-Sale` và AI thành các hàm thuần (pure functions) có kiểm thử đơn vị trong `src/game/rules.ts` trước khi nối vào lớp hiển thị Three.js (`models.ts`, `textures.ts`, `MonopolyCanvas.tsx`) và máy trạng thái điều phối lượt trong `src/App.tsx`. Giữ nguyên kích thước lòng sân cỏ `11.4 × 11.4` (`EDGE_TILE_WIDTH = 11.4 / 7`) để 32 ô khớp khít tuyệt đối với bệ đỡ, góc máy isometric và đạo cụ 3D hiện hữu.

**Tech Stack:** React 19, TypeScript 7 (`tsc --noEmit`), Vite 8, Three.js `0.187`, Tailwind CSS v4, Express 4 + `@google/genai`, Node built-in test runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-11-19-business-tour-phase1-design.md`

## Global Constraints

- Tổng số ô bàn cờ bắt buộc `TOTAL_TILES = 32`: 4 Góc (`0` `START`, `8` `LOST_ISLAND`, `16` `WORLD_CHAMPIONSHIPS`, `24` `WORLD_TOUR`), 4 Khu nghỉ dưỡng (`4` Vịnh Hạ Long, `14` Đảo Lý Sơn, `18` Côn Đảo, `25` Phú Quốc), 3 ô `CHANCE` (`12, 20, 28`), 1 ô `TAX` (`30`), và 20 `PROPERTY` chia 8 `ColorGroup`.
- Tiền tệ lưu trữ và hiển thị trực tiếp (`BT_DISPLAY_MULTIPLIER = 1`, không còn nhân ẩn `×3000`): khởi điểm `2,000,000` (hoặc `3,000,000`), lương qua/dừng Ô `0` là `+300,000`, bảo lãnh Đảo Hoang `200,000`, phí Cúp Thế Giới `50,000`, phí Sân bay Du Lịch `50,000`.
- Tuyệt đối không dùng ký hiệu đô la trong chuỗi hiển thị UI hoặc prompt Gemini; dùng định dạng rút gọn (`50K`, `1.2M`, `2M`) hoặc phân tách khoảng trắng (`2 000 000`).
- Giới hạn xây nhà theo `laps`: `laps === 0` tối đa `level = 2`; `laps >= 1` mở `level = 3`; chỉ nâng lên `level = 4` (Khách sạn Biểu tượng `★`) khi thành phố đang ở `level === 3` và chủ đất đáp lại vào ô đó.
- Mua đứt `2×` (`Buyout`) cấm áp dụng cho `level >= 4` và `RESORT`; sau khi mua đứt giữ nguyên `level` và kết thúc lượt ngay (không mở nâng cấp trong cùng lượt).
- Gỡ bỏ hoàn toàn giao dịch tự do (`TradeModal` / `AuctionAndTradeModals.tsx`), trường `mortgaged`, và biến `taxPool` chết; bán tài sản chỉ mở khi giải quyết nợ (`DEBT_RESOLUTION`) hoàn `100%` vốn đầu tư, phá sản trả toàn bộ bất động sản về Ngân hàng (`ownerId: null, level: 0`) đồng nhất cho cả Người và Bot.
- Không dùng CSS `backdrop-filter` đè lên canvas WebGL; giữ cơ chế tiết lưu khung hình khi chạy trên software WebGL (`SwiftShader`/`llvmpipe`).

## Review Focus

1. **Thanh toán nợ tiền thuê xong vẫn còn dư tiền đủ Mua đứt `2×`**: Khi người chơi thiếu tiền mặt trả tiền thuê nhưng bán thành phố khác trong `DEBT_RESOLUTION` và sau khi trả nợ vẫn còn `cash >= buyoutCost` trên `PROPERTY` cấp `0..3`, hệ thống phải chuyển sang `BUYOUT_DECISION` thay vì bỏ sót nhảy sang kết thúc lượt (kiểm thử tại Task 2 & điều phối tại Task 6).
2. **Thành phố đang giữ Cúp Thế Giới bị bán trả nợ hoặc chủ đất phá sản**: Khi ô đang là `championshipTileIndex` bị bán về Ngân hàng hoặc chủ đất phá sản, `championshipTileIndex` phải về `null` nhưng `championshipMultiplier` phải giữ nguyên giá trị tích lũy để lần đặt Cúp kế tiếp vẫn tăng tiếp lên `+1` (kiểm thử tại Task 2).
3. **Đổ Đôi đáp trúng Đảo Hoang (Ô 8) hoặc đổ Đôi để thoát Đảo Hoang**: Cả hai trường hợp đều phải đặt `doublesStreak = 0` để người chơi không được thưởng thêm lượt đổ phụ; riêng lần đổ thứ 3 thất bại tại Đảo Hoang (`jailTurns` từ `2` lên `3`) phải tự động thả tự do miễn phí và di chuyển `die1 + die2` bước (kiểm thử tại Task 2).
4. **Đáp vào Cơ quan Thuế (Ô 30) khi chưa có bất động sản nào hoặc mắc nợ khi `totalRealEstateValue === 0`**: Khi không sở hữu ô nào, `calculateTaxAmount` trả về `0` (miễn thuế ngay, không tạo khoản nợ `0`); khi mắc nợ tiền phạt/tiền thuê mà tổng vốn bất động sản `< số tiền thiếu`, `computeOptimalAutoSale` trả về `sufficient: false` để Bot và bộ đếm giờ tuyên bố Phá sản ngay không lặp vô hạn (kiểm thử tại Task 2).
5. **Bay Du Lịch Xuyên Việt từ Ô 24 đi vòng qua Ô 0 (ví dụ `24 → 3`) so với không qua Ô 0 (`24 → 27`)**: Chuyến bay `24 → 3` phải đánh dấu `passedStart: true` để cộng `+300,000` và tăng `laps += 1` trước khi xét quyền mua/nâng cấp tại ô đích (nhờ đó mở ngay Cấp 3 nếu trước khi bay `laps === 0`), còn `24 → 27` giữ `passedStart: false` (kiểm thử tại Task 2).

---

## File Structure

- **Modify `package.json`**: Thêm script `"test": "tsx --test src/game/*.test.ts"`.
- **Modify `src/game/types.ts`**: Định nghĩa lại `TileKind`, `ColorGroup` (8 màu), `PlayerState` (`laps`, `pendingWorldTour`), `MatchBoardModifiers`, `AutoSalePlan`, `TurnPhase` (`CHAMPIONSHIP_SELECTION`), `VictoryConditionKind` (`RESORT_MONOPOLY`), `PendingDebt` (`originTileIndex`); xóa `TradeOffer`, `TradeEvaluationResult`, `CHEST`, `mortgaged`.
- **Modify `src/game/boardData.ts`**: Danh sách 32 ô chuẩn Business Tour Việt hóa, `COLOR_GROUP_META` 8 nhóm màu, bộ `CHANCE_CARDS` đồng nhất ở thang tiền `2,000,000`.
- **Modify `src/game/rules.ts` & `src/game/rules.test.ts`**: Tọa độ 32 ô (`EDGE_TILE_WIDTH = 11.4 / 7`), định dạng tiền trực tiếp, công thức tiền thuê nhân Lễ Hội/Cúp/Resort, giới hạn xây dựng theo `laps`, `Buyout 2×`, Thuế `10%`, `computeOptimalAutoSale`, kết quả Đảo Hoang/Du Lịch, 4 điều kiện thắng và Bot AI cho bàn cờ 32 ô.
- **Modify `src/game/avatarLogic.ts` & `src/game/avatarLogic.test.ts`**: Cập nhật ngưỡng tiền `celebrating` (`>= 100_000`) và `stressed` (`<= -100_000`, `cash < 250_000`) theo thang `2,000,000`.
- **Modify `server.ts`**: Đặt `BT_PROMPT_MULTIPLIER = 1`, đổi fallback model thành `'gemini-2.5-flash'`, tách bộ nhớ chống lặp câu thoại theo `sessionId`.
- **Modify `src/three/textures.ts`, `src/three/models.ts`, `src/components/MonopolyCanvas.tsx`**: Khớp 4 góc `0, 8, 16, 24`, co giãn chiều ngang nhà/nhãn giá theo `11.4 / 7`, vẽ mặt gạch `RESORT`, đổi nhãn rìa 3D sang Tiền Thuê thực tế khi ô có chủ, thay chữ 3D sân cỏ bằng trạng thái Cúp Thế Giới và sửa đồng hồ 3D khởi tạo `45s`.
- **Delete `src/components/AuctionAndTradeModals.tsx` & Modify `src/components/StartModal.tsx`, `src/components/BusinessTourActionModals.tsx`, `src/components/TileModalAndDialogs.tsx`, `src/components/ActionDock.tsx`, `src/components/PlayerHUD.tsx`**: Thêm `ChampionshipDecisionModal`, cập nhật `WorldTourPrompt` bay lượt kế tiếp, đổi `AssetManagementModal` sang chọn thành phố bán trả nợ `100%` + nút `Auto-Sale`, cập nhật bảng thông tin Resort/Lễ Hội/Cúp và HUD vòng đi.
- **Modify `src/App.tsx`**: Kết nối toàn bộ luồng lượt đi 32 ô, `boardModifiers`, `pendingWorldTour` đầu lượt, `CHAMPIONSHIP_SELECTION`, hậu kiểm `Buyout 2×` sau trả nợ, Phá sản đồng nhất Người/Bot và đồng hồ `45s` xuyên suốt lượt.

---

### Task 1: Kiểu dữ liệu, Bàn cờ 32 Ô Việt Hóa, Tọa độ Không gian & Thang Tiền Thật

**Files:**
- Modify: `package.json:6-13`
- Modify: `src/game/types.ts:1-179`
- Modify: `src/game/boardData.ts:1-509`
- Modify: `src/game/rules.ts:1-245`
- Test: `src/game/rules.test.ts`

**Interfaces:**
- Consumes: Không có (nền tảng đầu tiên).
- Produces:
  - `TileKind`: `'START' | 'LOST_ISLAND' | 'WORLD_CHAMPIONSHIPS' | 'WORLD_TOUR' | 'PROPERTY' | 'RESORT' | 'TAX' | 'CHANCE'`
  - `ColorGroup`: `'BROWN' | 'CYAN' | 'PINK' | 'ORANGE' | 'AMBER' | 'RED' | 'PURPLE' | 'EMERALD'`
  - `PlayerState`: thêm `laps: number`, `pendingWorldTour: boolean`; `PropertyState`: `{ tileIndex: number; ownerId: number | null; level: number }` (bỏ `mortgaged`)
  - `MatchBoardModifiers`: `{ festivalTileIndices: number[]; championshipTileIndex: number | null; championshipMultiplier: number }`
  - `AutoSalePlan`: `{ sufficient: boolean; tileIndicesToSell: number[]; totalRefund: number; cashAfterDebt: number }`
  - `CardEffect`: bỏ `HOUSE_REPAIR` / `MOVE_RELATIVE` cũ nếu không dùng hoặc giữ tương thích, bổ sung `{ type: 'HOST_CHAMPIONSHIP' }` và `{ type: 'GO_TO_WORLD_TOUR' }`
  - `PendingDebt`: thêm `originTileIndex?: number` (để kiểm tra `Buyout 2×` sau khi trả nợ tiền thuê)
  - Hằng số trong `rules.ts`: `TOTAL_TILES = 32`, `LOST_ISLAND_TILE_INDEX = 8`, `WORLD_CHAMPIONSHIPS_TILE_INDEX = 16`, `WORLD_TOUR_TILE_INDEX = 24`, `TAX_TILE_INDEX = 30`, `RESORT_TILE_INDICES = [4, 14, 18, 25] as const`, `RESORT_RENTS = [50_000, 150_000, 400_000, 1_000_000] as const`, `START_SALARY = 300_000`, `JAIL_FINE = 200_000`, `WORLD_TOUR_FEE = 50_000`, `CHAMPIONSHIP_FEE = 50_000`, `BT_DISPLAY_MULTIPLIER = 1`, `EDGE_TILE_WIDTH = 11.4 / 7`, `BOARD_SIDES`, `BOARD_TILES`, `CHANCE_CARDS`.

- [ ] **Step 1: Thêm script `"test"` vào `package.json` và viết bộ test thất bại cho cấu trúc 32 ô & thang tiền trực tiếp trong `src/game/rules.test.ts`**

Trong `package.json`, thêm `"test": "tsx --test src/game/*.test.ts"` vào `"scripts"`. Trong `src/game/rules.test.ts`, viết các bài test kiểm tra:
```ts
test('32-tile Business Tour board topology matches exact corner, resort, chance, tax and 8 color groups', () => {
  assert.equal(TOTAL_TILES, 32);
  assert.equal(BOARD_TILES.length, 32);
  assert.equal(BOARD_TILES[0].kind, TileKind.START);
  assert.equal(BOARD_TILES[8].kind, TileKind.LOST_ISLAND);
  assert.equal(BOARD_TILES[16].kind, TileKind.WORLD_CHAMPIONSHIPS);
  assert.equal(BOARD_TILES[24].kind, TileKind.WORLD_TOUR);
  assert.equal(BOARD_TILES[30].kind, TileKind.TAX);
  assert.deepEqual(
    BOARD_TILES.filter((t) => t.kind === TileKind.RESORT).map((t) => t.index),
    [4, 14, 18, 25]
  );
  assert.deepEqual(
    BOARD_TILES.filter((t) => t.kind === TileKind.CHANCE).map((t) => t.index),
    [12, 20, 28]
  );
  assert.equal(BOARD_TILES.filter((t) => t.kind === TileKind.PROPERTY).length, 20);
  assert.equal(Object.keys(COLOR_GROUP_META).length, 8);
});

test('32-tile transforms fit seamlessly within [-5.7, +5.7] inner span with corners at (±7, ±7)', () => {
  assert.deepEqual(
    [0, 8, 16, 24].map((i) => {
      const tr = getTileTransform(i);
      return [tr.x, tr.z, tr.isCorner];
    }),
    [
      [7, 7, true],
      [-7, 7, true],
      [-7, -7, true],
      [7, -7, true],
    ]
  );
  const t1 = getTileTransform(1);
  const t7 = getTileTransform(7);
  assert.ok(Math.abs(t1.x + t1.width / 2 - 5.7) < 1e-6);
  assert.ok(Math.abs(t7.x - t7.width / 2 - -5.7) < 1e-6);
});

test('Direct currency formatters format raw VND/BT numbers without hidden x3000 multiplier', () => {
  assert.equal(formatBusinessTourCompact(50_000), '50K');
  assert.equal(formatBusinessTourCompact(2_000_000), '2M');
  assert.equal(formatBusinessTourCompact(-200_000, true), '-200K');
  assert.equal(formatBusinessTourSpaced(2_000_000), '2 000 000');
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npm test`
Expected: FAIL (do `TOTAL_TILES` đang là `28`, thiếu `TileKind.RESORT` / `LOST_ISLAND` / `WORLD_CHAMPIONSHIPS` / `WORLD_TOUR`, và `BT_DISPLAY_MULTIPLIER` đang là `3000`).

- [ ] **Step 3: Cập nhật `src/game/types.ts`, `src/game/boardData.ts` và phần hằng số/không gian/định dạng tiền trong `src/game/rules.ts`**

1. Cập nhật `src/game/types.ts` đúng theo mục `Produces` ở trên (`TurnPhase` bổ sung `'CHAMPIONSHIP_SELECTION'`, `VictoryConditionKind` bổ sung `'RESORT_MONOPOLY'`, `BotQuipPayload` tùy chọn thêm `sessionId?: string`).
2. Cập nhật `src/game/boardData.ts` với đúng bảng 32 ô và giá đất/nhà/tiền thuê từ Bảng 2.2 trong Spec (`Hà Giang` ở ô `1` đến `TP. Hồ Chí Minh` ở ô `31`; `DEFAULT_PLAYER_CONFIGS` giữ 4 nhân vật; `CHANCE_CARDS` 12 thẻ phủ đủ: về Bắt Đầu `+300,000`, bay tới Sân bay Du Lịch `GO_TO_WORLD_TOUR`, tới Phú Quốc `25`, tới Đà Nẵng `27`, tới TP.HCM `31`, đăng cai Cúp miễn phí `HOST_CHAMPIONSHIP`, đày ra Đảo Hoang `GO_TO_JAIL`, thẻ Thoát Đảo Hoang `JAIL_FREE_CARD`, tới Cơ quan Thuế `30`, mừng Sinh Nhật `COLLECT_FROM_ALL` `25,000`, cổ tức `GAIN_CASH` `150,000`, phạt vi phạm `PAY_CASH` `50,000`).
3. Trong `src/game/rules.ts`, đặt `BT_DISPLAY_MULTIPLIER = 1`, `EDGE_TILE_WIDTH = 11.4 / 7`, cập nhật `BOARD_SIDES` (`SOUTH: [1..7]`, `WEST: [9,10,11,13,14,15]`, `NORTH: [17,18,19,21,22,23]`, `EAST: [25,26,27,29,31]`) và `getTileTransform(index)` cho 4 góc `0, 8, 16, 24` cùng 7 ô mỗi cạnh; điều chỉnh `getTokenSlotOffset` dùng `spread = isCorner ? 0.52 : 0.32`.

- [ ] **Step 4: Chạy test phần không gian & định dạng tiền**

Run: `npm test`
Expected: Các bài test mới của Task 1 PASS (các test luật cũ trong `rules.test.ts` sẽ được cập nhật toàn diện ở Task 2).

- [ ] **Step 5: Commit dữ liệu bàn cờ 32 ô (tùy chọn sau khi Task 2 xanh toàn bộ suite `rules.test.ts`)**

Giữ sạch hoặc gộp commit ngay khi toàn bộ `rules.test.ts` xanh ở cuối Task 2 để không tạo commit có test đỏ.

---

### Task 2: Luật Kinh tế Chuẩn Business Tour, Hệ số Lễ Hội/Cúp, Đảo Hoang, Du Lịch, Thuế `10%`, `Auto-Sale` `100%` & 4 Điều kiện Thắng

**Files:**
- Modify: `src/game/rules.ts:315-710`
- Test: `src/game/rules.test.ts`

**Interfaces:**
- Consumes: `BOARD_TILES`, `COLOR_GROUP_META`, `TileKind`, `ColorGroup`, `PlayerState`, `PropertyState`, `MatchBoardModifiers`, `AutoSalePlan` từ Task 1.
- Produces (trong `src/game/rules.ts`):
  - `createDefaultBoardModifiers(festivalCount?: number, rng?: () => number): MatchBoardModifiers`
  - `applyChampionshipHost(modifiers: MatchBoardModifiers, tileIndex: number): MatchBoardModifiers`
  - `clearDisownedModifiers(modifiers: MatchBoardModifiers, properties: Record<number, PropertyState>): MatchBoardModifiers`
  - `isPurchasableTile(tile: TileDefinition): boolean` (`PROPERTY` hoặc `RESORT`)
  - `calculateRent(tileIndex: number, properties: Record<number, PropertyState>, modifiers?: MatchBoardModifiers): number`
  - `formatTilePriceLabel(tile: TileDefinition, propState?: PropertyState, properties?: Record<number, PropertyState>, modifiers?: MatchBoardModifiers): string | null`
  - `getInitialPurchaseTiers(player: PlayerState, tileIndex: number): InitialPurchaseTierOption[]`
  - `canUpgradeProperty(player: PlayerState, tileIndex: number, properties: Record<number, PropertyState>, options?: UpgradeCheckOptions): { allowed: boolean; cost: number; targetLevel: number; reason?: string }`
  - `calculatePropertyInvestedValue(tileIndex: number, level: number): number`
  - `calculateTotalRealEstateValue(playerId: number, properties: Record<number, PropertyState>): number`
  - `calculateTaxAmount(playerId: number, properties: Record<number, PropertyState>): number`
  - `calculateBuyoutPrice(tileIndex: number, level: number): number` & `canBuyoutProperty(...)`
  - `computeOptimalAutoSale(playerId: number, cashNeeded: number, properties: Record<number, PropertyState>, modifiers?: MatchBoardModifiers): AutoSalePlan`
  - `isValidWorldTourTarget(player: PlayerState, tileIndex: number, properties: Record<number, PropertyState>): boolean`
  - `resolveWorldTourMovement(fromIndex: number, targetTile: number): { path: number[]; passedStart: boolean; lapsDelta: number }`
  - `resolveIslandRollOutcome(die1: number, die2: number, currentJailTurns: number): { escaped: boolean; moveSteps: number; nextJailTurns: number; nextDoublesStreak: 0 }`
  - `evaluateMatchWinner(players: PlayerState[], properties: Record<number, PropertyState>): MatchWinnerResult | null`

- [ ] **Step 1: Viết đầy đủ unit tests (kèm 5 ca kiểm thử từ `Review Focus`) vào `src/game/rules.test.ts`**

Viết lại các bài test kinh tế trong `src/game/rules.test.ts` để ghim chặt từng quy tắc trong Spec và cả 5 mục `Review Focus`:
```ts
test('Lap building caps: lap 0 caps initial buy & upgrade at level 2; lap 1+ opens level 3; level 4 requires existing level 3', () => {
  const pLap0 = makePlayer({ id: 1, cash: 2_000_000, laps: 0 });
  assert.deepEqual(getInitialPurchaseTiers(pLap0, 1).map((t) => t.level), [0, 1, 2]);

  const pLap1 = makePlayer({ id: 1, cash: 2_000_000, laps: 1 });
  assert.deepEqual(getInitialPurchaseTiers(pLap1, 1).map((t) => t.level), [0, 1, 2, 3]);

  const propsLv2 = makeProps({ 1: { ownerId: 1, level: 2 } });
  assert.equal(canUpgradeProperty(pLap1, 1, propsLv2, { isOnTileLanding: true, targetLevel: 4 }).allowed, false);
  assert.equal(canUpgradeProperty(pLap1, 1, propsLv2, { isOnTileLanding: true, targetLevel: 3 }).allowed, true);

  const propsLv3 = makeProps({ 1: { ownerId: 1, level: 3 } });
  assert.equal(canUpgradeProperty(pLap1, 1, propsLv3, { isOnTileLanding: true, targetLevel: 4 }).allowed, true);
});

test('Rent combines Color Monopoly (x2), Festival (x2) and progressive World Championships (x2 -> x3 -> x4)', () => {
  const props = makeProps({
    1: { ownerId: 1, level: 1 }, // Hà Giang 1 house base = 30,000
    2: { ownerId: 1, level: 0 },
    3: { ownerId: 1, level: 0 },
  });
  let mods: MatchBoardModifiers = { festivalTileIndices: [1], championshipTileIndex: null, championshipMultiplier: 1 };
  mods = applyChampionshipHost(mods, 1); // 2x
  assert.equal(calculateRent(1, props, mods), 30_000 * 2 * 2 * 2); // 240,000
  mods = applyChampionshipHost(mods, 2); // moves cup to tile 2 at 3x
  assert.equal(calculateRent(1, props, mods), 30_000 * 2 * 2); // 120,000
  assert.equal(calculateRent(2, props, mods), 12_000 * 2 * 3); // 72,000
});

test('Resort rents scale [50K, 150K, 400K, 1M], block Buyout 2x, and 4/4 triggers RESORT_MONOPOLY', () => {
  const players = [makePlayer({ id: 1 }), makePlayer({ id: 2, cash: 2_000_000 })];
  const props = makeProps({
    4: { ownerId: 1, level: 0 },
    14: { ownerId: 1, level: 0 },
    18: { ownerId: 1, level: 0 },
  });
  assert.equal(calculateRent(4, props), 400_000);
  assert.equal(canBuyoutProperty(players[1], 4, props).allowed, false);
  props[25] = { tileIndex: 25, ownerId: 1, level: 0 };
  const win = evaluateMatchWinner(players, props);
  assert.equal(win?.condition, 'RESORT_MONOPOLY');
});

test('Review Focus #1 & #2: Post-debt excess cash still allows 2x Buyout; selling/disowning Championship city clears host but preserves multiplier', () => {
  const props = makeProps({
    1: { ownerId: 2, level: 1 }, // invested = 100K -> buyout = 200K
    29: { ownerId: 1, level: 0 }, // Hà Nội = 400K
  });
  const sale = computeOptimalAutoSale(1, 30_000, props);
  assert.equal(sale.sufficient, true);
  assert.equal(sale.cashAfterDebt, 370_000);
  const buyerAfterDebt = makePlayer({ id: 1, cash: sale.cashAfterDebt });
  assert.equal(canBuyoutProperty(buyerAfterDebt, 1, props).allowed, true);

  let mods = applyChampionshipHost({ festivalTileIndices: [], championshipTileIndex: null, championshipMultiplier: 1 }, 29);
  mods = applyChampionshipHost(mods, 29); // multiplier = 3
  props[29] = { tileIndex: 29, ownerId: null, level: 0 };
  const cleaned = clearDisownedModifiers(mods, props);
  assert.equal(cleaned.championshipTileIndex, null);
  assert.equal(cleaned.championshipMultiplier, 3);
  assert.equal(applyChampionshipHost(cleaned, 1).championshipMultiplier, 4);
});

test('Review Focus #3, #4 & #5: Island doubles/3rd-turn release reset streak; 0-property Tax is 0 & insufficient Auto-Sale flags false; World Tour 24->3 grants lap & salary', () => {
  const escDoubles = resolveIslandRollOutcome(4, 4, 0);
  assert.deepEqual(escDoubles, { escaped: true, moveSteps: 8, nextJailTurns: 0, nextDoublesStreak: 0 });
  const thirdFail = resolveIslandRollOutcome(2, 5, 2);
  assert.deepEqual(thirdFail, { escaped: true, moveSteps: 7, nextJailTurns: 0, nextDoublesStreak: 0 });

  const emptyProps = makeProps({});
  assert.equal(calculateTaxAmount(1, emptyProps), 0);
  assert.equal(computeOptimalAutoSale(1, 50_000, emptyProps).sufficient, false);

  assert.deepEqual(resolveWorldTourMovement(24, 3).passedStart, true);
  assert.equal(resolveWorldTourMovement(24, 3).lapsDelta, 1);
  assert.deepEqual(resolveWorldTourMovement(24, 27).passedStart, false);
  assert.equal(resolveWorldTourMovement(24, 27).lapsDelta, 0);
});
```

- [ ] **Step 2: Chạy `npm test` để xác nhận các bài test mới báo lỗi thiếu hàm / sai hành vi**

Run: `npm test`
Expected: FAIL với lỗi thiếu `applyChampionshipHost`, `computeOptimalAutoSale`, `resolveIslandRollOutcome`, v.v.

- [ ] **Step 3: Triển khai các hàm kinh tế, `Auto-Sale`, Thuế `10%`, Đảo Hoang, Du Lịch và 4 điều kiện thắng trong `src/game/rules.ts`**

Triển khai toàn bộ chữ ký trong mục `Produces`. Đối với `computeOptimalAutoSale(playerId, cashNeeded, properties, modifiers)`:
- Nếu `cashNeeded <= 0` trả về `{ sufficient: true, tileIndicesToSell: [], totalRefund: 0, cashAfterDebt: -cashNeeded }`.
- Lọc danh sách ô `owned` của `playerId` (tối đa 24 ô; thực tế trước khi thắng luôn `< 18` ô). Tính giá trị hoàn `100%` `refund = calculatePropertyInvestedValue(idx, level)` và trọng số chiến thuật `keepWeight`:
  - Cộng `+10_000_000` nếu `level >= 4` (Khách sạn Biểu tượng).
  - Cộng `+5_000_000` nếu ô nằm trong bộ `ColorGroup` đã sở hữu trọn vẹn.
  - Cộng `+3_000_000` nếu là `RESORT` và đang sở hữu `>= 2` Resort.
  - Cộng `+2_000_000` nếu `modifiers?.championshipTileIndex === idx`.
  - Cộng `refund` làm tie-breaker để ưu tiên bán ô rẻ vừa đủ nợ.
- Nếu tổng `refund` của mọi ô `< cashNeeded`, trả về `{ sufficient: false, tileIndicesToSell: owned.map(o => o.tileIndex), totalRefund: sumAll, cashAfterDebt: sumAll - cashNeeded }`.
- Nếu số ô sở hữu `<= 16`, duyệt bitmask tìm tập con có `sumRefund >= cashNeeded` tối thiểu hóa `(sumKeepWeight, sumRefund - cashNeeded)`; nếu `> 16`, sắp xếp tăng dần theo `keepWeight` rồi gom tham lam cộng bước tỉa ngược (prune) các ô dư thừa từ đắt tới rẻ nếu bỏ ra vẫn `>= cashNeeded`.
- Xóa các hàm cũ không còn dùng: `canSellHouse`, `getHouseSellRefund`, `getPropertySellRefund`, `calculateLiquidationPotential`, `botPickAssetToLiquidate`, `canPropertyBeTraded`, `validateTradeOffer`, `evaluateBotTradeOffer`.
- Trong `formatTilePriceLabel(tile, propState, properties, modifiers)`:
  - Nếu `tile.kind === TileKind.TAX` trả về `'-10%'`.
  - Nếu `isPurchasableTile(tile)`: khi `propState && propState.ownerId !== null && properties` trả về chuỗi tiền thuê thực tế `formatBusinessTourCompact(calculateRent(tile.index, properties, modifiers))` (kèm hậu tố/tiền tố gọn nếu cần hoặc để `textures.ts` vẽ icon); khi chưa có chủ trả về `formatBusinessTourCompact(tile.price ?? 0)`.

- [ ] **Step 4: Cập nhật tạm thời các hàm Bot AI trong `rules.ts` để biên dịch sạch và chạy `npm test`**

Run: `npm test`
Expected: PASS các bài test luật kinh tế trong `src/game/rules.test.ts`.

- [ ] **Step 5: Commit Task 1 + Task 2 sau khi hoàn tất phần AI test ở Task 3 (hoặc commit ngay nếu toàn bộ `npm test` đã PASS)**

```bash
git add package.json src/game/types.ts src/game/boardData.ts src/game/rules.ts src/game/rules.test.ts
git commit -m "feat(rules): upgrade to 32-tile Business Tour board and core economy rules"
```

---

### Task 3: Nâng cấp Bot AI Bàn cờ 32 Ô, Ngưỡng Cảm xúc Avatar 3D & Backend Gemini Quips

**Files:**
- Modify: `src/game/rules.ts:705-940, 1300-1420`
- Modify: `src/game/avatarLogic.ts:104-130`
- Modify: `src/game/avatarLogic.test.ts:1-126`
- Modify: `src/game/rules.test.ts`
- Modify: `server.ts:8-190`
- Modify: `src/utils/botQuipClient.ts:1-42`

**Interfaces:**
- Consumes: Các hàm kinh tế & bàn cờ 32 ô từ Task 1–2.
- Produces:
  - `botShouldBuyProperty(bot: PlayerState, tileIndex: number, players: PlayerState[], properties: Record<number, PropertyState>): boolean`
  - `botPickInitialPurchaseTier(bot: PlayerState, tileIndex: number, properties: Record<number, PropertyState>): 0 | 1 | 2 | 3`
  - `botPickOnTileUpgradeTargetLevel(bot: PlayerState, tileIndex: number, properties: Record<number, PropertyState>): number | null`
  - `botShouldBuyoutProperty(bot: PlayerState, tileIndex: number, players: PlayerState[], properties: Record<number, PropertyState>): boolean`
  - `botPickChampionshipTarget(bot: PlayerState, properties: Record<number, PropertyState>, modifiers: MatchBoardModifiers): number | null`
  - `botPickWorldTourTarget(bot: PlayerState, properties: Record<number, PropertyState>, modifiers: MatchBoardModifiers): number | null`
  - `botChooseJailAction(bot: PlayerState): 'USE_CARD' | 'PAY_FINE' | 'ROLL_DOUBLES'`

- [ ] **Step 1: Viết các bài test thất bại cho Bot AI 32 ô & ngưỡng cảm xúc Avatar 2M trong `src/game/rules.test.ts` và `src/game/avatarLogic.test.ts`**

Thêm test kiểm chứng:
1. `botShouldBuyProperty` mua mảnh ghép cuối để thắng hoặc chặn đối thủ đang nắm `3/4` Resort hoặc `N-1` ô trên 1 cạnh `BOARD_SIDES` ngay cả khi tiền dư chỉ còn `>= 100,000`.
2. `botPickWorldTourTarget` chỉ bao giờ trả về ô trống (`ownerId === null`) thuộc `PROPERTY`/`RESORT` hoặc `PROPERTY` của chính Bot (tuyệt đối không trả về ô của đối thủ hay ô đặc biệt), ưu tiên ô hoàn tất chiến thắng `RESORT_MONOPOLY` / `SIDE_MONOPOLY` / `TRIPLE_MONOPOLY`.
3. `botPickChampionshipTarget` chọn thành phố có tiền thuê tiềm năng cao nhất của Bot khi `bot.cash >= 250_000`.
4. `deriveAvatarMood` trong `avatarLogic.test.ts`: `recentCashDelta = 120_000` → `'celebrating'`, `recentCashDelta = 30_000` (nhỏ) → `'idle'`, `cash = 180_000` (`< 250_000`) → `'stressed'`, `cash = 1_500_000` → `'idle'`.

- [ ] **Step 2: Chạy `npm test` để xác nhận các bài test mới thất bại**

Run: `npm test`
Expected: FAIL trên các ca kiểm thử Bot AI mới và ngưỡng tiền `deriveAvatarMood`.

- [ ] **Step 3: Triển khai Bot AI 32 ô, cập nhật `avatarLogic.ts` và sửa `server.ts`**

1. Trong `src/game/rules.ts`:
   - Cập nhật ngưỡng tiền mặt của Bot sang thang `2,000,000` (dự trữ thông thường `400_000`, dự trữ khi chốt Độc quyền / chặn thắng `100_000`, trả bảo lãnh Đảo Hoang `200_000` khi `bot.cash >= 650_000`).
   - Bổ sung kiểm tra `BOARD_SIDES` và `RESORT_TILE_INDICES` trong `botShouldBuyProperty` và `botShouldBuyoutProperty`.
   - Trong `botPickOnTileUpgradeTargetLevel`, dùng `canUpgradeProperty(bot, tileIndex, properties, { isOnTileLanding: true, targetLevel })` để tuân thủ tuyệt đối giới hạn `laps` và quy tắc `level === 3 → 4`.
   - Cập nhật `MIN_BIG_RENT_FOR_QUIP = 120_000`; xóa nhánh `'TRADE'` khỏi `buildBotBuyQuipPayload`.
2. Trong `src/game/avatarLogic.ts`: đổi ngưỡng `recentCashDelta >= 100_000`, `recentCashDelta <= -100_000`, `input.cash < 250_000`.
3. Trong `server.ts` & `src/utils/botQuipClient.ts`:
   - Đặt `BT_PROMPT_MULTIPLIER = 1` trong `server.ts`.
   - Đổi fallback model `'gemini-4-hydrogen'` thành `'gemini-2.5-flash'`.
   - Gửi kèm `sessionId` (sinh ngẫu nhiên 1 lần cho mỗi tab trình duyệt trong `botQuipClient.ts`) và lưu khóa chống lặp trong `server.ts` theo `${sessionId}:${botIdNum}` (giới hạn tối đa `200` mục trong `Map`, xóa mục cũ nhất khi đầy).

- [ ] **Step 4: Chạy `npm test` để xác nhận toàn bộ unit test xanh 100%**

Run: `npm test`
Expected: PASS toàn bộ `src/game/rules.test.ts` và `src/game/avatarLogic.test.ts`.

- [ ] **Step 5: Commit thay đổi Bot AI, Avatar & Backend**

```bash
git add src/game/rules.ts src/game/rules.test.ts src/game/avatarLogic.ts src/game/avatarLogic.test.ts src/utils/botQuipClient.ts server.ts
git commit -m "feat(ai): adapt bot AI, avatar moods, and Gemini quip server to 32-tile 2M scale"
```

---

### Task 4: Đồng bộ Đồ họa 3D 32 Ô, 4 Góc Chuẩn, Khu Nghỉ Dưỡng & Nhãn Tiền Thuê Động

**Files:**
- Modify: `src/three/textures.ts:35-660, 740-810`
- Modify: `src/three/models.ts:275-342, 618-880, 1020-1295, 1398-1540`
- Modify: `src/components/MonopolyCanvas.tsx:50-85, 530-660, 915-1095`

**Interfaces:**
- Consumes: `BOARD_TILES`, `getTileTransform`, `formatTilePriceLabel`, `MatchBoardModifiers`, `TileKind`, `ColorGroup` từ Task 1–2.
- Produces:
  - `MonopolyCanvasProps`: thay `taxPool: number` bằng `boardModifiers: MatchBoardModifiers`.
  - `createTileTopTexture` hỗ trợ `ColorGroup.AMBER` & `ColorGroup.PURPLE`, `TileKind.LOST_ISLAND`, `TileKind.WORLD_CHAMPIONSHIPS`, `TileKind.WORLD_TOUR`, `TileKind.RESORT`, và hiển thị `+300K` trên ô `START`.
  - `createOuterPriceTabTexture(label: string, accentHex: string, ownerHex: string | null, statusBadge: 'CUP' | 'FESTIVAL' | null, flip180: boolean, maxAnisotropy: number)`.

- [ ] **Step 1: Cập nhật bảng màu & texture mặt gạch / nhãn giá trong `src/three/textures.ts`**

1. Trong `resolveDeedGroupPalette`, bổ sung 2 nhóm màu mới `ColorGroup.AMBER` (`#F59E0B` / `#D97706`) và `ColorGroup.PURPLE` (`#8B5CF6` / `#6D28D9`).
2. Trong `createTileTopTexture`:
   - Cập nhật nhận diện `isCorner` sang `START | LOST_ISLAND | WORLD_CHAMPIONSHIPS | WORLD_TOUR`.
   - Ô `START`: đổi nhãn tiền thưởng từ `'+600K'` thành `'+300K'`.
   - Ô `LOST_ISLAND` (Góc 8): vẽ đầm nước ngọc bích + bãi cát `ĐẢO HOANG`.
   - Ô `WORLD_CHAMPIONSHIPS` (Góc 16): vẽ sân vận động + chữ `CÚP THẾ GIỚI`.
   - Ô `WORLD_TOUR` (Góc 24): vẽ đường băng sân bay + chữ `DU LỊCH`.
   - Ô `RESORT`: vẽ nền cát vàng kem & sóng biển ngọc lam ở nửa trong (nơi đặt chòi nghỉ dưỡng sở hữu), thanh pill màu xanh biển `#0EA5E9` và tên Đảo/Vịnh đậm nét ở nửa ngoài kèm dòng phụ `'KHU NGHỈ DƯỠNG'`.
   - Xóa nhánh `CHEST`, `TRANSPORT`, `UTILITY` cũ trong `drawFunctionalArtwork`.
3. Trong `createOuterPriceTabTexture`: xóa tham số `isMortgaged` và nhánh `'THẾ CHẤP'`; thêm tham số `statusBadge: 'CUP' | 'FESTIVAL' | null` để vẽ huy hiệu góc nhỏ màu vàng kim (`★ CÚP`) hoặc cam (`×2`) trên đầu thẻ giá khi thành phố đang có Cúp Thế Giới hoặc Lễ Hội.

- [ ] **Step 2: Khớp 4 Góc 3D, co giãn kích thước nhà/nhãn giá cho chiều rộng `11.4 / 7` và sửa đồng hồ 3D trong `src/three/models.ts`**

1. Trong `createProtrudingPriceTab`: thu gọn kích thước ngang khớp với `EDGE_TILE_WIDTH ≈ 1.6286`: `neck` rộng `1.04`, `lowerCollar` rộng `1.44`, `hitMesh` rộng `1.34`.
2. Trong `createOwnershipBuildingSuite`:
   - Đổi `houseXs = [-(tileWidth * 0.28), 0, tileWidth * 0.28]`, giảm bề ngang tường nhà con từ `0.36` xuống `0.31` (bệ `0.36`, mái `0.30`) và đặt `levelBadgeMesh.position.x = tileWidth * 0.29` để 3 căn nhà nằm gọn trên ô rộng `1.6286`.
   - Xóa tham số `mortgaged` khỏi `setOwnerTint(ownerHex: string)`.
3. Trong `createCornerDiorama`: đổi điều kiện chỉ số ô từ `7 / 14 / 21` sang đúng **`tileIndex === 8`** (Đảo Hoang), **`tileIndex === 16`** (Sân vận động Cúp Thế Giới + Cúp Vàng xoay), và **`tileIndex === 24`** (Nhà ga Sân bay + Đài không lưu + Máy bay).
4. Trong `createCourtyardDiorama`: sửa `lastClockSec = 45` (thay vì `30`); dùng dòng chữ nổi 3D giữa sân cỏ hiển thị trạng thái giải đấu (`CÚP ×2`, `CÚP ×3` khi có Cúp Thế Giới, hoặc `'BUSINESS TOUR'` / `'32 ĐÔ THỊ'` khi chưa mở Cúp). Xóa 3 hàm stub rỗng `createHouseModel`, `createHotelModel`, `createBoulevardBollardLamp`.

- [ ] **Step 3: Cập nhật `src/components/MonopolyCanvas.tsx` nối `boardModifiers` và gắn chòi sở hữu cho cả `RESORT`**

1. Thay prop `taxPool: number` bằng `boardModifiers: MatchBoardModifiers` (lưu vào `boardModifiersRef`).
2. Khi khởi tạo 32 ô bàn cờ, khởi tạo `buildingSuite` cho cả `TileKind.PROPERTY` và `TileKind.RESORT` (với `RESORT` khi có chủ luôn hiển thị `starterPavilion` cấp `0` mang màu cờ của chủ sở hữu).
3. Trong vòng lặp đồng bộ nhãn giá (`entry.priceTab`): truyền `formatTilePriceLabel(tileDef, propState, currentProps, currentModifiers)` và xác định `statusBadge` (`currentModifiers.championshipTileIndex === entry.index ? 'CUP' : currentModifiers.festivalTileIndices.includes(entry.index) ? 'FESTIVAL' : null`) để nhãn 3D tự cập nhật ngay sang **Tiền Thuê Thực Tế** mỗi khi đổi chủ, nâng nhà, gom đủ bộ màu hoặc dời Cúp Thế Giới!
4. Cập nhật chữ nổi 3D giữa sân cỏ qua `courtyardAnim.updateTaxDisplay(...)` hiển thị `CÚP ×${currentModifiers.championshipMultiplier} · ${hostCityName}` khi đã có Cúp, hoặc `'VIỆT NAM 3D'` khi chưa có Cúp.

- [ ] **Step 4: Kiểm tra biên dịch TypeScript trên các file 3D**

Run: `npx tsc --noEmit`
Expected: Không còn bất kỳ lỗi kiểu dữ liệu nào trong `src/three/textures.ts`, `src/three/models.ts` và `src/components/MonopolyCanvas.tsx` (chỉ còn các modal UI và `App.tsx` sẽ cập nhật ngay ở Task 5–6).

- [ ] **Step 5: Commit lớp hiển thị 3D**

Hoãn commit cho tới khi Task 5–6 cập nhật xong `App.tsx` để `npm run lint` (`tsc --noEmit`) của toàn repo xanh 100%, hoặc giữ cùng nhánh làm việc sạch sẽ.

---

### Task 5: Hệ thống Giao diện & Hộp thoại Chuẩn Business Tour (`Championship`, `WorldTour`, `Auto-Sale` `100%`, `StartModal`, `HUD`)

**Files:**
- Delete: `src/components/AuctionAndTradeModals.tsx`
- Modify: `src/components/StartModal.tsx:100-285`
- Modify: `src/components/BusinessTourActionModals.tsx:1-577`
- Modify: `src/components/TileModalAndDialogs.tsx:60-265, 670-960`
- Modify: `src/components/ActionDock.tsx:1-512`
- Modify: `src/components/PlayerHUD.tsx:1-455`

**Interfaces:**
- Consumes: `MatchBoardModifiers`, `AutoSalePlan`, `computeOptimalAutoSale`, `isValidWorldTourTarget`, `calculateRent`, `calculatePropertyInvestedValue`, `RESORT_RENTS`, `CHAMPIONSHIP_FEE`, `WORLD_TOUR_FEE` từ Task 1–2.
- Produces:
  - `ChampionshipDecisionModal`: `{ player: PlayerState; properties: Record<number, PropertyState>; boardModifiers: MatchBoardModifiers; onSelectCity: (tileIndex: number) => void; onSkip: () => void }` trong `BusinessTourActionModals.tsx`.
  - `AssetManagementModal`: `{ player: PlayerState; properties: Record<number, PropertyState>; boardModifiers: MatchBoardModifiers; pendingDebt: PendingDebt | null; onExecuteDebtSaleAndPay: (tileIndicesToSell: number[]) => void; onDeclareBankruptcy: () => void; onClose: () => void }` trong `TileModalAndDialogs.tsx`.
  - `WorldTourPrompt`: cập nhật danh sách gợi ý chỉ gồm các ô thỏa `isValidWorldTourTarget(player, idx, properties)` và giải thích rõ chuyến bay đầu lượt (`50K`).

- [ ] **Step 1: Xóa `src/components/AuctionAndTradeModals.tsx` và cập nhật `StartModal.tsx`**

1. Xóa file `src/components/AuctionAndTradeModals.tsx`.
2. Trong `src/components/StartModal.tsx`:
   - Đổi lựa chọn vốn khởi điểm từ `[1500, 2500]` thành `[2_000_000, 3_000_000]` (mặc định `2_000_000`).
   - Cập nhật phần tóm tắt luật: `32 ô Việt Nam · 8 Bộ Màu · 4 Đảo Du Lịch`, `Vòng 1 tối đa 2 nhà · Khách sạn ★ chống mua đứt`, `Cúp Thế Giới nhân lũy tiến · Bán trả nợ hoàn 100%`.

- [ ] **Step 2: Thêm `ChampionshipDecisionModal` và cập nhật `UpgradeDecisionModal`, `WorldTourPrompt`, `RulebookModal` trong `src/components/BusinessTourActionModals.tsx`**

1. Tạo `ChampionshipDecisionModal`: hiển thị hệ số Cúp sắp áp dụng (`×${nextMult}`), phí tổ chức `50K`, danh sách các `PROPERTY` thuộc sở hữu của `player` sắp xếp giảm dần theo tiền thuê sau khi nhân Cúp (cho phép bấm chọn trực tiếp trong danh sách hoặc click lên thành phố của mình trên bàn cờ 3D), kèm nút `Bỏ Qua`.
2. Trong `UpgradeDecisionModal`: truyền `boardModifiers` vào `calculateRent` để hiển thị chính xác tiền thuê mới, và giải thích rõ khóa cấp theo vòng (`laps === 0` khóa Cấp 3–4; chưa đạt Cấp 3 khóa Cấp 4 `★`).
3. Trong `WorldTourPrompt`: chỉ lọc các ô thỏa `isValidWorldTourTarget(player, idx, properties)` (ô trống `PROPERTY`/`RESORT` hoặc `PROPERTY` của chính mình), đổi nút bỏ qua thành `'Không Bay — Đổ Xúc Xắc Thường'`.
4. Cập nhật `RulebookModal` phản ánh đầy đủ bàn cờ 32 ô, 4 Đảo/Vịnh (`RESORT_MONOPOLY`), Cúp Thế Giới, Đảo Hoang, Thuế `10%` và Bán trả nợ hoàn `100%`.

- [ ] **Step 3: Cập nhật `TileInspectorCard` và viết mới luồng chọn bán `100%` + `Auto-Sale` trong `src/components/TileModalAndDialogs.tsx`**

1. Trong `TileInspectorCard`:
   - Với `TileKind.RESORT`: hiển thị bảng 4 mốc tiền thuê `1..4 Khu nghỉ dưỡng` (`50K / 150K / 400K / 1M`) và ghi chú `'Miễn nhiễm Mua đứt · Đủ 4/4 thắng ngay!'`.
   - Với `TileKind.TAX`: hiển thị quy tắc `'Thu 10% tổng giá trị vốn bất động sản đang sở hữu'`.
   - Với `TileKind.PROPERTY`: hiển thị thêm nhãn nổi bật nếu ô đang có `🎉 Lễ Hội ×2` hoặc `🏆 Cúp Thế Giới ×N`.
2. Trong `AssetManagementModal`:
   - Khi `pendingDebt !== null` (chế độ Giải quyết nợ):
     - Quản lý state nội bộ `selectedTiles: number[]` (khởi tạo rỗng).
     - Tính `selectedRefund = sum(calculatePropertyInvestedValue(idx, level))`, `projectedCash = player.cash + selectedRefund`, `shortfall = Math.max(0, pendingDebt.amount - projectedCash)`, `surplus = Math.max(0, projectedCash - pendingDebt.amount)`.
     - Thanh trạng thái hiển thị rõ: **Cần trả**, **Tiền mặt hiện có + Tiền bán chọn (`100%`)**, và **Còn thiếu** (hoặc **Tiền còn dư sau trả nợ**).
     - Nút **`Bán Tự Động Tối Ưu` (`Auto-Sale`)**: gọi `computeOptimalAutoSale(player.id, pendingDebt.amount - player.cash, properties, boardModifiers)` — nếu `plan.sufficient` thì điền ngay `plan.tileIndicesToSell` vào `selectedTiles` (hoặc cho xác nhận 1 chạm) để người chơi thấy rõ những ô nào sẽ bán; nếu `!plan.sufficient` thì hiển thị cảnh báo tổng tài sản không đủ trả nợ và làm nổi bật nút **`Tuyên Bố Phá Sản`**.
     - Nút **`Xác Nhận Bán & Thanh Toán`** (bật khi `projectedCash >= pendingDebt.amount`): gọi `onExecuteDebtSaleAndPay(selectedTiles)`.
   - Khi `pendingDebt === null` (xem danh mục tài sản): chỉ hiển thị tổng quan các thành phố & Khu nghỉ dưỡng đang sở hữu, cấp nhà, tiền thuê hiện tại và giá trị vốn (không cho bán tháo tự do ngoài lúc mắc nợ).

- [ ] **Step 4: Dọn dẹp `ActionDock.tsx` và nâng cấp thông tin trên `PlayerHUD.tsx`**

1. Trong `src/components/ActionDock.tsx`: xóa nút `'Giao Dịch'` (`onOpenTrade`), xóa các prop chết (`dockCollapsed`, `onToggleDock`, `turnCount`, `lastDice`), hiển thị đúng phí bảo lãnh Đảo Hoang (`200K`) và trạng thái chờ bay Du Lịch nếu có.
2. Trong `src/components/PlayerHUD.tsx`: hiển thị thêm số **Vòng (`Vòng ${player.laps + 1}`)**, **Tổng Tài Sản (`Tổng: ${formatBusinessTourCompact(netWorth)}`)**, và đánh dấu icon nhỏ `🏖️` cho các thẻ mini `RESORT` sở hữu.

- [ ] **Step 5: Kiểm tra rà soát props của toàn bộ component UI**

Đảm bảo không còn import nào trỏ tới `AuctionAndTradeModals.tsx`, `TradeOffer`, `mortgaged`, `canSellHouse` hay `taxPool`.

---

### Task 6: Điều phối Máy trạng thái 32 Ô trong `src/App.tsx` & Kiểm thử Toàn diện

**Files:**
- Modify: `src/App.tsx:1-2475`

**Interfaces:**
- Consumes: Toàn bộ hàm luật/AI từ `src/game/rules.ts`, `MonopolyCanvas` từ Task 4 và các Modal/HUD từ Task 5.
- Produces: Ứng dụng hoàn chỉnh chạy mượt toàn bộ luật Business Tour Giai đoạn 1, vượt qua `npm test`, `npm run lint` và `npm run build`.

- [ ] **Step 1: Cập nhật state khởi tạo ván đấu, URL demo showcase và luồng đầu lượt (`pendingWorldTour`) trong `src/App.tsx`**

1. Đổi `startingCash` mặc định sang `2_000_000`; xóa `taxPool`, `showTradeModal`, `dockCollapsed`.
2. Thêm state `boardModifiers: MatchBoardModifiers` (cùng `boardModifiersRef`), khởi tạo bằng `createDefaultBoardModifiers(3)` mỗi khi bắt đầu ván mới. Khởi tạo mỗi `PlayerState` với `laps: 0, pendingWorldTour: false`.
3. Tạo helper chuyển lượt thống nhất `beginPlayerTurn(nextIdx: number, currPlayers: PlayerState[], currProps: Record<number, PropertyState>)`:
   - Đặt `setActivePlayerIndex(nextIdx)`, `setTurnCount((t) => t + 1)`, **`setTurnTimeLeft(TURN_COUNTDOWN_SECONDS)`** (chỉ reset `45s` tại đúng điểm bắt đầu lượt mới hoặc khi được thưởng lượt mới từ xúc xắc Đôi!).
   - Kiểm tra nếu `nextPlayer.pendingWorldTour && !nextPlayer.inJail`:
     - Nếu `nextPlayer.cash >= WORLD_TOUR_FEE` và tồn tại ít nhất 1 ô thỏa `isValidWorldTourTarget`: mở ngay `setTurnPhase('WORLD_TOUR')` ở **đầu lượt**!
     - Ngược lại: xóa `pendingWorldTour = false` và vào `setTurnPhase('AWAIT_ROLL')`.
   - Nếu không có `pendingWorldTour`: vào `setTurnPhase('AWAIT_ROLL')`.

- [ ] **Step 2: Nối chuẩn xác xử lý đáp ô (`resolveTileLanding`), Đảo Hoang, Cúp Thế Giới, Du Lịch, Thuế `10%` và Mua đứt `2×`**

1. Khi di chuyển qua Ô `0` (trong đổ xúc xắc bình thường, bay `WORLD_TOUR`, hoặc thẻ `MOVE_TO` có `collectStart: true`): cộng `+START_SALARY` (`300,000`) và tăng **`laps: p.laps + 1`** TRƯỚC khi gọi `resolveTileLanding` (đảm bảo Review Focus #5!).
2. Trong `resolveTileLanding`:
   - `TileKind.LOST_ISLAND` (Ô 8): phát âm báo, đặt ngay `inJail: true, jailTurns: 0, doublesStreak: 0, pendingWorldTour: false` (đảm bảo Review Focus #3!), ghi log bị giam trên Đảo Hoang và gọi `completeTurnAfterAction`.
   - `TileKind.WORLD_CHAMPIONSHIPS` (Ô 16): nếu sở hữu ít nhất 1 `PROPERTY` và `cash >= CHAMPIONSHIP_FEE` (`50,000`), chuyển sang `setTurnPhase('CHAMPIONSHIP_SELECTION')` (cho phép click chọn thành phố của mình trực tiếp trên bàn cờ 3D thông qua `handleSelectTile` hoặc chọn trong `ChampionshipDecisionModal`); ngược lại kết thúc hành động lượt.
   - `TileKind.WORLD_TOUR` (Ô 24): đặt `pendingWorldTour: true`, ghi log sẵn sàng bay vào lượt kế tiếp và gọi `completeTurnAfterAction` (nếu người chơi vừa đổ Đôi để vào Ô 24 thì `completeTurnAfterAction` nhận thấy `doublesStreak > 0`, thưởng ngay lượt kế tiếp và kích hoạt `WORLD_TOUR` luôn ở lượt thưởng đó!).
   - `TileKind.TAX` (Ô 30): tính `tax = calculateTaxAmount(player.id, propertiesRef.current)`. Nếu `tax <= 0` (Review Focus #4!), ghi log miễn thuế do chưa sở hữu bất động sản và kết thúc hành động lượt; nếu `tax > 0` thì trừ tiền mặt hoặc mở `DEBT_RESOLUTION` với `creditorId: null`.
   - `TileKind.PROPERTY` / `TileKind.RESORT`:
     - Vô chủ: nếu `cash >= tile.price` mở `BUY_DECISION`, ngược lại kết thúc hành động lượt.
     - Của chính mình: nếu là `PROPERTY` và `canUpgradeProperty(player, tileIndex, props, { isOnTileLanding: true }).allowed` thì mở `UPGRADE_DECISION`, ngược lại kết thúc hành động lượt.
     - Của đối thủ: tính `rent = calculateRent(tileIndex, props, boardModifiersRef.current)`. Nếu đủ tiền mặt trả ngay: trừ tiền, cộng cho chủ đất, kiểm tra thắng nếu cần, sau đó nếu `canBuyoutProperty(updatedPayer, tileIndex, props).allowed` thì mở `BUYOUT_DECISION`; nếu không đủ tiền mặt trả tiền thuê: mở `DEBT_RESOLUTION` kèm **`originTileIndex: tileIndex`**.
3. Trong `handleConfirmBuyout`: chuyển `2×` tiền cho chủ cũ, đổi `ownerId` sang người mua (giữ nguyên `level`), kiểm tra `checkAndTriggerMatchVictory`, và **gọi thẳng `completeTurnAfterAction`** (chặn tuyệt đối nhảy sang `UPGRADE_DECISION` trong cùng lượt vừa mua đứt!).
4. Trong Đảo Hoang (`handleRollDice` khi `player.inJail`): dùng `resolveIslandRollOutcome(die1, die2, player.jailTurns)` — nếu `escaped` (do ra Đôi hoặc hết lượt giam thứ 3) thì thả miễn phí (`inJail: false, jailTurns: 0, doublesStreak: 0`) và di chuyển `moveSteps` bước!

- [ ] **Step 3: Đồng nhất Thanh lý trả nợ (`handleExecuteDebtSaleAndPay`), Phá sản Người/Bot và sửa bộ đếm giờ `45s`**

1. Triển khai `handleExecuteDebtSaleAndPay(tileIndicesToSell: number[])`:
   - Bán toàn bộ các ô trong `tileIndicesToSell` về Ngân hàng (`ownerId: null, level: 0`), hoàn `100%` vốn đầu tư vào `player.cash`, gọi `clearDisownedModifiers` để thu hồi Cúp nếu bán trúng ô đang giữ Cúp (Review Focus #2!), rồi trừ `pendingDebt.amount` (cộng cho `creditorId` nếu có).
   - **Review Focus #1**: Nếu khoản nợ vừa trả có `pendingDebt.originTileIndex !== undefined`, kiểm tra `canBuyoutProperty(updatedPlayer, pendingDebt.originTileIndex, nextProps)` — nếu `allowed` thì chuyển sang `setTurnPhase('BUYOUT_DECISION')`! Nếu không thì gọi `completeTurnAfterAction`.
2. Trong `handleDeclareBankruptcy`:
   - Chuyển phần tiền mặt lẻ còn lại của người phá sản cho `creditorId` (nếu `creditorId !== null`).
   - Đặt **toàn bộ** bất động sản của người phá sản về `ownerId: null, level: 0` (trả về Ngân hàng) và gọi `clearDisownedModifiers`.
3. Trong vòng lặp `useEffect` của **Bot AI**:
   - Bổ sung nhánh `turnPhase === 'CHAMPIONSHIP_SELECTION'` (`botPickChampionshipTarget` → đăng cai hoặc bỏ qua).
   - Trong nhánh `turnPhase === 'DEBT_RESOLUTION'`: tính `plan = computeOptimalAutoSale(current.id, pendingDebt.amount - current.cash, properties, boardModifiers)`. Nếu `!plan.sufficient` → gọi thẳng `handleDeclareBankruptcy()` ngay lập tức (không bán lẻ tẻ trước khi phá sản!); nếu `plan.sufficient` → gọi `handleExecuteDebtSaleAndPay(plan.tileIndicesToSell)`.
4. Trong bộ đếm ngược `45s` (`useEffect` timer):
   - Bỏ việc reset `setTurnTimeLeft(45)` mỗi khi `turnPhase` thay đổi; chỉ reset khi sang lượt mới hoặc khi nhận lượt thưởng Đôi trong `completeTurnAfterAction`.
   - Khi `turnTimeLeft === 0` cho người chơi:
     - `WORLD_TOUR` → `handleSkipWorldTour()`
     - `CHAMPIONSHIP_SELECTION` → `handleSkipChampionship()`
     - `DEBT_RESOLUTION` → chạy `computeOptimalAutoSale`: nếu `sufficient` gọi `handleExecuteDebtSaleAndPay(plan.tileIndicesToSell)`, ngược lại gọi `handleDeclareBankruptcy()` (xóa sổ hoàn toàn lỗi treo `00:00`!).
     - `AWAIT_END_TURN` → đóng `setShowAssetsModal(false)` và `setSelectedTileIndex(null)` trước khi gọi `handleEndTurn()`.
5. Cập nhật chỉ số ô trong chế độ `?demo_showcase=1` và `?demo_event=1` sang các ô tương ứng trên bàn cờ 32 ô (ví dụ Hà Nội `29`, TP.HCM `31`, Đà Nẵng `27`, Phú Quốc `25`, Đà Lạt `3`).

- [ ] **Step 4: Chạy toàn bộ bộ kiểm thử đơn vị, kiểm tra kiểu TypeScript và đóng gói Production**

Run: `npm test && npm run lint && npm run build`
Expected:
- `npm test`: Toàn bộ unit test trong `rules.test.ts` và `avatarLogic.test.ts` PASS 100%.
- `npm run lint` (`tsc --noEmit`): 0 lỗi TypeScript.
- `npm run build` (`vite build`): Đóng gói thành công `dist/` không có lỗi.

- [ ] **Step 5: Commit hoàn tất Giai đoạn 1**

```bash
git add src/ server.ts package.json
git commit -m "feat(game): complete Phase 1 32-tile Business Tour rules, 3D sync, and debt auto-sale"
```
