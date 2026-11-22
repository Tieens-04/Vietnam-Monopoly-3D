# Đặc Tả Thiết Kế (Design Spec) — Động Cơ Vật Lý 3D, Hậu Kỳ GTAO/Shader & Hệ Thống Kho Bạc Đa Tiền Tệ Thực Tế

- **Ngày lập**: 2026-11-21
- **Dự án**: `cờ-tỷ-phú-3d-việt-nam`
- **Phạm vi**: Tích hợp bộ ba công nghệ 3D mới (**`cannon-es` Rigid-Body Physics**, **`GTAOPass` Ground Truth Ambient Occlusion**, **GPU `InstancedMesh` + Custom GLSL Shaders**) và xây dựng **Hệ thống Kho bạc 3D thời gian thực cho 4 người chơi** với **4 phong cách tiền tệ tùy chọn** cùng hiệu ứng **dòng tiền vật lý Lúc Vào – Lúc Ra**.

---

## 1. Mục Tiêu & Các Quyết Định Đã Chốt

1. **Công nghệ 3D mới (Phương án A):**
   - **Vật lý rắn 3D (`cannon-es`)**: Mô phỏng va chạm thực cho 2 viên xúc xắc (va vào sàn sân cỏ trũng, 4 thành bậc thềm và va vào nhau) kèm thuật toán xoay bù mặt `Q_remap` để bảo toàn tuyệt đối kết quả `(die1, die2)` từ Server Online hoặc hàng đợi `?dice=`. Đồng thời mô phỏng độ nảy vật lý khi tiền xu / thỏi vàng / cọc tiền đáp xuống khay kho bạc.
   - **Bóng âm khe kẽ thời gian thực (`GTAOPass`)**: Tích hợp `GTAOPass` của Three.js vào chuỗi `EffectComposer` (`RenderPass` → `GTAOPass` → `UnrealBloomPass` → `OutputPass`) để tạo chiều sâu tiếp xúc chân thực giữa các đồng xu xếp chồng, kẽ cọc tiền, chân tòa nhà và mặt bàn cờ (tự động tắt trên GPU phần mềm để đảm bảo FPS).
   - **GPU `InstancedMesh` + Custom GLSL Shaders**: Gom toàn bộ các đơn vị tiền trên 4 khay người chơi, khay Ngân hàng và các luồng tiền đang bay vào một số ít `InstancedMesh` (3–5 draw calls cho hàng trăm vật thể); bổ sung GLSL Vertex Shader làm tờ tiền Polymer uốn lượn theo vận tốc bay và GLSL Fragment/Material glint quét ánh kim qua cạnh đồng xu / thỏi vàng.
2. **4 Phong cách Tiền tệ (`CurrencyStyleId`) đổi tự do ở Lobby & Cài đặt trận đấu:**
   - `cash` (**Tiền mặt Polymer mệnh giá**): Tờ & cọc tiền phân màu theo mệnh giá thực tế (`500K` xanh ngọc lam `#0E7490`, `200K` đỏ cam `#C2410C`, `100K` xanh lá `#15803D`, `50K` hồng tím `#BE185D`, `20K` xanh lam `#1D4ED8`, `10K` vàng nâu `#A16207`) có đai niêm phong ngân hàng.
   - `coins` (**Tiền xu Kim loại**): Đồng xu PBR khía cạnh dập nổi ngôi sao & mệnh giá (`500K` Vàng ròng `#FACC15`, `100K` Bạc sáng `#E2E8F0`, `20K` Đồng đỏ `#EA580C`).
   - `bullion` (**Thỏi vàng & Chip Tỷ phú**): Thỏi vàng 9999 hình thang vát cạnh bóng gương (`500K`) kết hợp chồng Chip Casino viền sọc sắc nét (`100K` Đỏ-Trắng, `50K` Xanh-Trắng, `10K` Tím-Vàng).
   - `mixed` (**Hỗn hợp Thực tế**): Phần giá trị lớn (`>= 100K`) xếp bằng cọc **Tiền mặt Polymer**, phần tiền lẻ (`< 100K`) xếp bằng cột **Tiền xu Kim loại** ngay bên cạnh trên cùng khay kho bạc.
3. **Kho bạc cá nhân & Diễn hoạt dòng tiền Lúc Vào – Lúc Ra:**
   - Xóa bỏ hoàn toàn các cụm tiền/đồng xu trang trí tĩnh cố định trước đây trong `createSurroundingVista`.
   - Thay bằng **4 Khay Kho Bạc 3D Cá Nhân** đặt đối xứng ở 4 góc mặt bàn ngoài rìa bàn cờ (khớp trực diện với 4 góc thẻ `PlayerHUD`) và **1 Khay Ngân Hàng Trung Tâm** đặt tại góc trên sân cỏ trũng.
   - Mọi giao dịch tăng/giảm `player.cash` đều kích hoạt luồng vật thể tiền 3D bay đúng chiều (**Ngân hàng → Người chơi**, **Người chơi → Ô đất / Ngân hàng**, hoặc **Người trả → Chủ đất**), kèm nhãn biến động nổi và âm thanh Web Audio đặc trưng theo từng loại tiền.

---

## 2. Kiến Trúc Mô-đun & Luồng Dữ Liệu

```
src/
├── game/
│   ├── currencyLogic.ts        # (Mới) Tách mệnh giá, suy luận sự kiện dòng tiền (CashFlowTransfer), lưu/đọc CurrencyStyleId
│   └── currencyLogic.test.ts   # (Mới) Unit test TDD cho tách mệnh giá, phát hiện luồng thu/chi & ánh xạ mặt xúc xắc Q_remap
├── three/
│   ├── physicsEngine.ts        # (Mới) Thế giới cannon-es cho xúc xắc tiền định (pre-simulated + Q_remap) & nảy vật thể tiền
│   ├── physicsEngine.test.ts   # (Mới) Unit test xác minh xúc xắc cannon-es luôn ngửa chính xác (die1, die2) mọi tổ hợp 1..6
│   └── treasurySystem.ts       # (Mới) 4 Khay Kho Bạc + Ngân hàng bằng InstancedMesh + Custom GLSL Shader + hạt bay Lúc vào/ra
├── audio/
│   └── soundEngine.ts          # (Cập nhật) Thêm âm thanh vật liệu tiền theo CurrencyStyleId (sột soạt Polymer, xu leng keng, thỏi vàng)
└── components/
    ├── MonopolyCanvas.tsx      # (Cập nhật) Tích hợp GTAOPass, physicsEngine, treasurySystem & prop currencyStyle
    ├── StartModal.tsx          # (Cập nhật) Bộ chọn 4 Phong cách Tiền tệ trực quan tại Phòng chờ
    ├── ActionDock.tsx          # (Cập nhật) Đổi nhanh Phong cách Tiền tệ ngay trong trận đấu (Settings Popover)
    └── PlayerHUD.tsx           # (Cập nhật) Đồng bộ icon tiền tệ trên thẻ tiền mặt & hiệu ứng nháy luồng thu/chi
```

---

## 3. Toán Học Không Gian, Tách Mệnh Giá & Vật Lý `cannon-es`

### 3.1. Tọa độ 4 Khay Kho Bạc Người Chơi & Ngân Hàng Trung Tâm
Với camera isometric đặt dọc hướng `(+X, +Y, +Z)` nhìn về gốc `(0, -0.15, 0)`, tọa độ màn hình ngang tỷ lệ với `(x - z)` và tọa độ màn hình dọc (hướng xuống) tỷ lệ với `(x + z)`. Đặt 4 khay kho bạc cách rìa bàn cờ (`±7.0`) một khoảng an toàn `3.65` đơn vị (không chạm nhãn giá ngoài `±8.8`):

| Vị trí Khay | Đối tượng gắn kết | Tọa độ thế giới `(x, y, z)` | Chiếu lên màn hình (`x - z`, `x + z`) |
| :--- | :--- | :--- | :--- |
| **Khay Slot 0** | Người chơi 1 (HUD Trên-Trái) | `(-10.65, -0.22, -2.15)` | `(-8.5, -12.8)` — **Góc Trên-Trái** |
| **Khay Slot 1** | Người chơi 2 (HUD Trên-Phải) | `(-2.15, -0.22, -10.65)` | `(+8.5, -12.8)` — **Góc Trên-Phải** |
| **Khay Slot 2** | Người chơi 3 (HUD Dưới-Phải) | `(+10.65, -0.22, +2.15)` | `(+8.5, +12.8)` — **Góc Dưới-Phải** |
| **Khay Slot 3** | Người chơi 4 (HUD Dưới-Trái) | `(+2.15, -0.22, +10.65)` | `(-8.5, +12.8)` — **Góc Dưới-Trái** |
| **Khay Ngân Hàng** | Ngân hàng / Quỹ trung tâm | `(-4.05, 0.16, -4.05)` | `(0.0, -8.1)` — **Đỉnh trên sân cỏ trũng** |

- Nếu ván đấu chỉ có 2 hoặc 3 người chơi, chỉ hiển thị khay kho bạc của các ghế đang tham gia; nếu người chơi phá sản (`player.bankrupt === true`), khay kho bạc trống rỗng và giảm độ bão hòa màu viền.
- Cập nhật `computeSafeBoardCameraPose` giữ nguyên vùng bao để cả 4 khay kho bạc tại `(±10.65, ±2.15)` nằm trọn trong khung nhìn Desktop, và trên Mobile dọc vẫn hiển thị đầy đủ bàn cờ cùng luồng tiền bay.

### 3.2. Thuật toán Tách Mệnh Giá Kho Bạc (`decomposeCashToVisualUnits`)
Để khay 3D vừa phản ánh trung thực độ giàu nghèo từ `10,000` tới `10,000,000+` vừa không tràn khỏi diện tích khay (`2.2 × 1.5` đơn vị thế giới):
- Quy đổi `cash = Math.max(0, Math.floor(player.cash))` sang tối đa **36 đơn vị 3D hiển thị trên mỗi khay** chia đều vào **6 ô cọc/cột (slots)** trên mặt khay:
  - **Chế độ `cash` (Tiền mặt Polymer):** 1 cọc nguyên đại diện `250,000` (gồm các mệnh giá `500K` xanh ngọc lam cho phần triệu, `200K` đỏ cam & `100K` xanh lá cho phần trăm nghìn, `50K`/`20K` cho phần lẻ). Khi `cash > 0`, luôn có ít nhất 1 xấp mỏng trên khay; tối đa xếp cao 6 tầng × 6 cọc = 36 xấp (tương ứng ngưỡng bão hòa trực quan `9,000,000`).
  - **Chế độ `coins` (Tiền xu Kim loại):** Tách thành cột xu Vàng (`250K`/xu đại diện), xu Bạc (`50K`/xu), xu Đồng (`10K`/xu), tối đa 8 xu/cột × 6 cột = 48 xu/khay.
  - **Chế độ `bullion` (Thỏi vàng & Chip):** Mỗi `500K` đúc thành 1 **Thỏi vàng 9999** xếp lớp kim tự tháp ở nửa sau khay; phần dư `< 500K` tách thành chồng **Chip Casino** (`100K`, `50K`, `10K`) ở nửa trước khay.
  - **Chế độ `mixed` (Hỗn hợp Thực tế):** Phần `Math.floor(cash / 100_000) * 100_000` dựng thành các cọc **Tiền mặt Polymer** ở nửa trái khay; phần lẻ `cash % 100_000` (cộng thêm 1 cột xu lưu niệm nếu số tiền tròn trăm nghìn nhưng `> 0`) dựng thành các cột **Tiền xu Kim loại** ở nửa phải khay.

### 3.3. Động cơ Vật lý Xúc Xắc Tiền Định (`cannon-es` + `Q_remap`)
Trong cả chế độ Offline lẫn Online Server Authoritative, cặp kết quả `(die1, die2)` đã được quyết định trước khi gọi `animateDiceRoll(die1, die2, speedMultiplier)`:
1. Khởi tạo `CANNON.World` nhẹ (`gravity = (0, -30, 0)`), mặt phẳng sàn tại `y = GRASS_SURFACE_Y` (`0.16`), 4 mặt tường bao tại `x = ±5.45, z = ±5.45` và 2 `CANNON.Body` hình hộp (`halfExtents = DICE_SIZE / 2`, `mass = 1`, `restitution = 0.48`, `friction = 0.35`).
2. Phóng 2 viên xúc xắc từ 2 góc đối diện vào trung tâm sân cỏ với vận tốc tịnh tiến + vận tốc góc ngẫu nhiên có kiểm soát, bước mô phỏng (`world.step(1 / 120)`) tối đa `180` bước (~1.5 giây thời gian thực, tốn `< 1.5ms` CPU) cho tới khi cả 2 viên nằm yên trên mặt sàn.
3. Đọc hướng pháp tuyến 6 mặt cục bộ của mỗi `CANNON.Body` ở frame cuối cùng để tìm mặt đang hướng thẳng lên `+Y` (`landedFaceValue` theo bảng `DICE_BOX_FACE_VALUES = [2, 5, 1, 6, 3, 4]`).
4. Tính quaternion hoán vị trực giao trong không gian cục bộ `qRemap` sao cho mặt có giá trị mục tiêu `targetValue` (`die1` hoặc `die2`) xoay trùng khít sang trục cục bộ của `landedFaceValue`. Nhân phải toàn bộ chuỗi quaternion các frame đã ghi (`qFrame_i * qRemap`):
   - Mọi va chạm nảy sàn, đập tường, va nhau giữa 2 viên xúc xắc giữ nguyên 100% quỹ đạo động lực học của `cannon-es`.
   - Ở frame kết thúc, mặt ngửa lên trời luôn chính xác tuyệt đối là `(die1, die2)`.

### 3.4. Suy luận & Mô phỏng Vật lý Dòng Tiền "Lúc Vào – Lúc Ra"
Mỗi khi mảng `players` hoặc `properties` thay đổi, hàm thuần `detectCashFlowTransfers(prevPlayers, nextPlayers, prevProps, nextProps)` đối chiếu chênh lệch `delta_i = nextPlayers[i].cash - prevPlayers[i].cash`:
1. **Chuyển tiền trực tiếp Người ↔ Người (`PLAYER_TO_PLAYER`):** Khi có ít nhất một người giảm tiền (`delta < 0`) và một người khác tăng tiền (`delta > 0`) trong cùng nhịp cập nhật (Trả tiền thuê, Mua đứt `2×`, Thẻ Mừng sinh nhật thu `25K` từ mỗi người) → ghép cặp nguồn từ `Khay Người Trả` bay sang `Khay Người Nhận`.
2. **Chi đầu tư vào Ô Đất (`PLAYER_TO_TILE`):** Khi người chơi giảm tiền (`delta < 0`) đồng thời một ô `tileIndex` vừa đổi `ownerId` sang người đó hoặc tăng `level` → phóng các đơn vị tiền từ `Khay Người Chơi` đáp xuống tọa độ thế giới của `tileIndex`.
3. **Nộp tiền về Ngân hàng / Thuế (`PLAYER_TO_BANK`):** Khi người chơi giảm tiền (`delta < 0`) mà không có người nhận hay công trình mới (Đóng Thuế `10%`, Bảo lãnh Đảo Hoang `200K`, Vé bay `50K`, Phí Cúp `50K`, Thẻ phạt) → phóng từ `Khay Người Chơi` về `Khay Ngân Hàng` (hoặc ô Thuế `30` nếu đang đứng tại ô `30`).
4. **Nhận tiền từ Ngân hàng (`BANK_TO_PLAYER`):** Khi người chơi tăng tiền (`delta > 0`) mà không có người chơi nào bị trừ (Qua `BẮT ĐẦU` `+300K`, Cổ tức `+150K`, Bán bất động sản thu hồi vốn) → phóng từ `Khay Ngân Hàng` (hoặc ô đất vừa bán) đáp vào `Khay Người Chơi`.

**Chuyển động hạt tiền 3D & Nảy vật lý khi đáp:**
- Mỗi giao dịch sinh từ `4` đến `14` hạt tiền 3D (tỷ lệ theo `Math.abs(amount)`), phóng cách nhau `35ms` tạo thành dải tiền bay nối đuôi nhau:
  - Giai đoạn bay (`0..75%` thời gian): Quỹ đạo Bezier bậc hai có độ vồng `arcHeight = 2.2..3.4` đơn vị; nếu là tờ tiền Polymer (`cash`/`mixed`), **Custom GLSL Vertex Shader** uốn cong thân tờ tiền theo pha sóng `sin(uTime * 16.0 + aPhase + position.x * 4.0)`.
  - Giai đoạn chạm khay (`75..100%` thời gian): Vật thể tiền rơi vào mô phỏng nảy đàn hồi (`cannon-es` contact bounce trên mặt phẳng khay đích với hệ số nảy `restitution = 0.38` cho đồng xu/thỏi vàng, `0.14` cho xấp tiền giấy) trước khi hòa nhập mượt vào cột tiền `InstancedMesh` của người nhận.

---

## 4. Hậu Kỳ `GTAOPass` & Custom GLSL Shaders

1. **`GTAOPass` (Ground Truth Ambient Occlusion):**
   - Khởi tạo `new GTAOPass(scene, camera, width, height)` đặt ngay sau `RenderPass` và trước `UnrealBloomPass` trên các thiết bị phần cứng WebGL2 (`!isSoftwareGl`).
   - Cấu hình `output = GTAOPass.OUTPUT.Default`, bán kính che khuất nhỏ (`radius = 0.28`, `scale = 0.85`) tối ưu cho tỷ lệ bàn cờ isometric để làm nổi rõ đường rãnh giữa các đồng xu xếp chồng, chân cọc tiền và chân các tòa nhà mà không làm bẩn mặt phẳng trắng của ô đất.
2. **Custom GLSL Shaders (`onBeforeCompile` trên vật liệu PBR của `InstancedMesh`):**
   - **Banknote Flutter Vertex Shader:** Biến dạng trục `Y` cục bộ của tờ tiền bay theo hàm sóng sin phụ thuộc vào thuộc tính `instanceFlutterAmp` (bằng `1.0` khi đang bay giữa không trung, giảm về `0.0` khi đã nằm yên trong cọc trên khay).
   - **Metallic Specular Glint Shader:** Cộng thêm dải ánh kim chéo nhẹ (`smoothstep`) quét định kỳ qua mặt vát của Thỏi vàng 9999 và Xu Vàng để tôn chất liệu kim loại quý dưới cả ánh sáng Ngày lẫn Đêm.

---

## 5. Giao Diện Chọn Tiền Tệ & Âm Thanh Vật Liệu

1. **Tại Phòng chờ (`StartModal.tsx`) & Cài đặt trong trận (`ActionDock.tsx`):**
   - Thêm cụm chọn **"Hình thức Tiền tệ 3D"** gồm 4 nút trực quan có biểu tượng minh họa riêng:
     - `💵 Tiền mặt` (`cash`)
     - `🪙 Tiền xu` (`coins`)
     - `🏆 Vàng & Chip` (`bullion`)
     - `💼 Hỗn hợp` (`mixed` — mặc định khuyên dùng vì thể hiện đồng thời cả cọc tiền giấy lẫn xu lẻ)
   - Lưu lựa chọn vào `localStorage` (`bt_vn_currency_style`) để giữ nguyên sở thích của người chơi qua các ván; đổi trong `ActionDock` sẽ cập nhật tức thì toàn bộ 4 Khay Kho Bạc 3D trên bàn mà không làm gián đoạn lượt chơi.
2. **Trên thẻ người chơi (`PlayerHUD.tsx`) & Âm thanh (`soundEngine.ts`):**
   - Biểu tượng cạnh số dư trong `AnimatedCashPill` đổi tương ứng theo phong cách đang chọn (Tờ tiền xanh, Đồng xu vàng, Thỏi vàng, hoặc Túi tiền hỗn hợp) kèm nhãn biến động `+300 000` / `-270 000` nảy rõ nét.
   - `soundEngine.playCurrencyTransfer(style, direction, count)` tổng hợp âm thanh Web Audio riêng biệt:
     - `cash`: Tiếng lật/đếm sột soạt tần số cao qua bộ lọc thông dải (`BiquadFilterNode` bandpass noise burst).
     - `coins`: Chuỗi âm chuông kim loại cao (`2400Hz` → `3800Hz` inharmonic sine partials) va leng keng.
     - `bullion`: Tiếng chạm kim loại trầm đầm chắc + ngân vàng thanh thoát (`880Hz` + `1760Hz`).
     - `mixed`: Kết hợp tiếng sột soạt tiền giấy mở đầu và tiếng xu leng keng kết thúc khi chạm khay.

---

## 6. Xử Lý Biên & Tiêu Chí Kiểm Thử

- **Hiệu năng & Bộ nhớ (Zero-GC):** Toàn bộ ma trận `THREE.Matrix4`, màu `THREE.Color` và trạng thái hạt bay được cấp phát tĩnh một lần duy nhất khi mount `MonopolyCanvas`; không tạo mới `Geometry`/`Material`/`Texture` trong vòng lặp `requestAnimationFrame`.
- **Tương thích GPU phần mềm / Mobile:** Khi `isSoftwareGl === true`, tự động bỏ qua `GTAOPass` & `UnrealBloomPass`, giảm số hạt tiền bay đồng thời tối đa xuống `8` nhưng vẫn giữ nguyên 4 khay kho bạc `InstancedMesh` và xúc xắc vật lý `cannon-es`.
- **Kiểm thử tự động bắt buộc (TDD):**
  1. `currencyLogic.test.ts`: Kiểm tra tách mệnh giá chính xác cho cả 4 chế độ (`0`, `35,000`, `300,000`, `2,000,000`, `12,500,000`) và kiểm tra `detectCashFlowTransfers` nhận diện đúng cả 4 loại luồng (`PLAYER_TO_PLAYER`, `PLAYER_TO_TILE`, `PLAYER_TO_BANK`, `BANK_TO_PLAYER`).
  2. `physicsEngine.test.ts`: Chạy kiểm thử toàn bộ `36` tổ hợp mặt xúc xắc `(1..6 × 1..6)` qua `cannon-es` + `Q_remap` để chứng minh 100% trường hợp viên xúc xắc nảy vật lý và dừng lại ngửa đúng cặp `(die1, die2)`.
  3. Kiểm thử trực quan bằng Browser Agent trên `http://localhost:3000`: xác nhận hiển thị 4 khay kho bạc, chuyển đổi mượt giữa cả 4 loại tiền tệ, luồng tiền bay Lúc vào / Lúc ra rõ nét, `0` lỗi Console và `0` cảnh báo WebGL.
