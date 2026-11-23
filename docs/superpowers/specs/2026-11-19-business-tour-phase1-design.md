# Đặc Tả Thiết Kế (Design Spec) — Chuẩn Hóa Business Tour 3D Việt Nam (Giai Đoạn 1 & Lộ Trình Tổng Thể)

- **Ngày lập**: 2026-11-19
- **Dự án**: `cờ-tỷ-phú-3d-việt-nam`
- **Phạm vi triển khai của Spec này**: **Giai đoạn 1 — Bàn cờ 32 ô chuẩn Business Tour, Hệ thống Kinh tế / Xây dựng / 4 Góc chuẩn, Nhãn giá động 3D & Vá toàn bộ lỗi hệ thống** (nền tảng bắt buộc cho Giai đoạn 2, 3, 4).

---

## 1. Mục Tiêu & Các Quyết Định Thiết Kế Đã Chốt (`/grill-me`)

Dự án chuyển đổi dứt điểm từ khung lai Cờ Tỷ Phú cổ điển 28 ô sang luật **Business Tour** chuẩn xác 100% mang bản sắc địa danh Việt Nam, chia thành **4 giai đoạn độc lập, nối tiếp nhau**:

| Giai đoạn | Mục tiêu trọng tâm | Trạng thái |
| :--- | :--- | :--- |
| **Giai đoạn 1 (Spec này)** | Bàn cờ **32 ô** Việt hóa (20 Thành phố / 8 nhóm màu + 4 Khu nghỉ dưỡng Đảo/Vịnh + 4 Góc chuẩn); tiền thật `2,000,000` (bỏ nhân ẩn `×3000`); đếm vòng `laps` khóa cấp nhà (lên Cấp 3 rồi mới lên Khách sạn `4 ★` khi ghé lại); Mua đứt `2×` chuẩn; Bán trả nợ `100%` + `Auto-Sale` + Phá sản trả đất về Ngân hàng (chủ nợ nhận tiền mặt còn lại + `100%` giá trị thanh lý BĐS); **CÚP QUỐC GIA** miễn phí (`0K`) lũy tiến `2×→3×...` & Lễ Hội đầu trận; Sân bay Du Lịch bay ở **lượt kế tiếp** tới ô trống / đất mình; Thuế `10%` bất động sản; bỏ `TradeModal` & `taxPool`; nhãn Tiền Thuê thực tế trên 3D; vá sạch bug 3D/Timer/Bot AI/Server. | **Đã triển khai & đồng bộ R2/R3** |
| **Giai đoạn 2** | Bộ Thẻ Cơ Hội (`?`) chiến thuật tương tác bàn cờ (*Mất điện, Động đất, Khiên bảo vệ, Đăng cai Cúp, Mừng sinh nhật cưỡng chế trả 25K*), tùy chọn **Xúc xắc chiến thuật** (Chẵn/Lẻ/Đổ lại — mặc định TẮT ở Phòng chờ), mô hình 3D chi tiết cho 4 Đảo/Vịnh & hiệu ứng 3D Cúp/Lễ Hội/Khiên/Mất điện, HUD Tổng Tài Sản + Nhạc nền BGM bật/tắt riêng. | **Đã tích hợp đầy đủ** |
| **Giai đoạn 3** | Chế độ **Đấu Đội 2v2 (`Doubles`)** (Xanh vs Đỏ: miễn tiền thuê, miễn mua lại & miễn thẻ tấn công đồng đội, gộp chung tài sản xét điều kiện thắng Độc quyền), **Đồng hồ Trận Nhanh 20 phút (`1200s`)** phân định thắng thua theo Tổng Tài Sản Ròng (`Net Worth`), nâng cấp Bot AI chiến thuật sâu (phối hợp 2v2, dùng xúc xắc chiến thuật, thẻ tấn công/phòng thủ). | **Đã tích hợp đầy đủ** |
| **Giai đoạn 4** | **Online Multiplayer** qua WebSocket trên `server.ts` (tạo phòng mã PIN / link mời, state authoritative chống gian lận, tự động thế Bot khi mất kết nối hoặc AFK & cho phép lấy lại quyền điều khiển `RECLAIM_CONTROL`). | **Đã tích hợp đầy đủ** |

---

## 2. Thiết Kế Bàn Cờ 32 Ô Việt Hóa & Tọa Độ Không Gian 3D

### 2.1. Toán học không gian 3D (Giữ nguyên khung sân trong `11.4 × 11.4`)
Hiện tại khung đế bàn cờ (`chassisTop = 16.44`), sân cỏ trũng (`lawnGeo = 11.38`), tường chắn (`stepWallSpan = 11.36`) và cụm đạo cụ tiền/xu bên ngoài đều khớp quanh khoảng cách lòng bàn cờ `[-5.7, +5.7]` (`11.4` đơn vị) và tâm 4 ô góc tại `(±7.0, ±7.0)`.
Để mở rộng từ 6 ô/cạnh (28 ô) lên **7 ô/cạnh (32 ô)** mà không làm vỡ bất kỳ mối ghép 3D hay góc máy isometric nào:
- `TOTAL_TILES = 32`
- Ô góc (`0, 8, 16, 24`): kích thước giữ nguyên `CORNER_SIZE = 2.6 × 2.6`, tâm tại `(±7.0, ±7.0)`.
- Ô cạnh thường (`7` ô mỗi cạnh): chiều sâu giữ nguyên `D = 2.6`, chiều rộng `W = 11.4 / 7` (`≈ 1.62857`), xếp khít tuyệt đối trong đoạn `[-5.7, +5.7]`:
  - **Cạnh Nam (`bottom`, ô `1..7`)**: `z = +7.0`, `x = 5.7 - W / 2 - (idx - 1) * W`, `rotationY = 0`
  - **Cạnh Tây (`left`, ô `9..15`)**: `x = -7.0`, `z = 5.7 - W / 2 - (idx - 9) * W`, `rotationY = -Math.PI / 2`
  - **Cạnh Bắc (`top`, ô `17..23`)**: `z = -7.0`, `x = -5.7 + W / 2 + (idx - 17) * W`, `rotationY = Math.PI`
  - **Cạnh Đông (`right`, ô `25..31`)**: `x = +7.0`, `z = -5.7 + W / 2 + (idx - 25) * W`, `rotationY = Math.PI / 2`
- Các mô hình nhà/khách sạn (`createOwnershipBuildingSuite`), nhãn giá chìa ra ngoài (`createProtrudingPriceTab`) và khe đứng của quân cờ (`getTokenSlotOffset`) co giãn theo hằng số `EDGE_TILE_WIDTH = 11.4 / 7` (thu ngang ~14% so với `1.9`, đảm bảo không chồng lấn sang ô bên cạnh).

### 2.2. Danh mục chi tiết 32 Ô Bàn Cờ (Đúng cấu trúc Business Tour gốc)
Toàn bộ đơn vị tiền tệ lưu trữ và hiển thị bằng **số thực trực tiếp** (`BT_DISPLAY_MULTIPLIER = 1`), định dạng rút gọn `50K`, `1.2M`, `2M` hoặc phân tách hàng nghìn `2 000 000`.

- **8 Nhóm Màu (`ColorGroup`)**: `BROWN` (Nâu đất), `CYAN` (Xanh ngọc), `PINK` (Hồng sen), `ORANGE` (Cam), `AMBER` (Vàng kim), `RED` (Đỏ), `PURPLE` (Tím), `EMERALD` (Xanh lục bảo).
- **4 Khu Nghỉ Dưỡng Đảo/Vịnh (`TileKind.RESORT`)**: Giá mua `200,000`; không xây nhà; miễn nhiễm Mua đứt (`Buyout`); tiền thuê phụ thuộc tổng số Resort người đó sở hữu:
  - Sở hữu `1` Resort: `50,000`
  - Sở hữu `2` Resort: `150,000`
  - Sở hữu `3` Resort: `400,000`
  - Sở hữu `4` Resort: `1,000,000` (đồng thời kích hoạt **Chiến thắng Độc quyền Du lịch `RESORT_MONOPOLY`** ngay lập tức).

| Chỉ số | Tên Ô | Phân loại (`TileKind`) | Nhóm màu | Giá Đất | Giá 1 Cấp Nhà / KS | Tiền thuê `[Đất, 1 Nhà, 2 Nhà, 3 Nhà, Khách sạn ★]` |
|---:|:---|:---|:---|---:|---:|:---|
| **0** | **BẮT ĐẦU** | `START` | — | — | — | Đi qua hoặc dừng nhận lương `+300,000`; tăng `laps += 1` |
| **1** | Hà Giang | `PROPERTY` | `BROWN` (3) | `50,000` | `50,000` | `[10K, 30K, 90K, 250K, 450K]` |
| **2** | Sa Pa | `PROPERTY` | `BROWN` (3) | `60,000` | `50,000` | `[12K, 36K, 108K, 280K, 500K]` |
| **3** | Đà Lạt | `PROPERTY` | `BROWN` (3) | `70,000` | `50,000` | `[14K, 42K, 126K, 320K, 550K]` |
| **4** | **Vịnh Hạ Long** | `RESORT` | — | `200,000` | — | Resort 1/4: `[50K, 150K, 400K, 1M]` |
| **5** | Ninh Bình | `PROPERTY` | `CYAN` (3) | `90,000` | `75,000` | `[18K, 54K, 160K, 400K, 700K]` |
| **6** | Huế | `PROPERTY` | `CYAN` (3) | `100,000` | `75,000` | `[20K, 60K, 180K, 450K, 750K]` |
| **7** | Hội An | `PROPERTY` | `CYAN` (3) | `120,000` | `75,000` | `[24K, 72K, 210K, 500K, 850K]` |
| **8** | **ĐẢO HOANG** | `LOST_ISLAND` | — | — | — | Dừng vào bị giam ngay (tối đa 3 lượt; bảo lãnh `200,000`) |
| **9** | Quy Nhơn | `PROPERTY` | `PINK` (3) | `140,000` | `100,000` | `[28K, 84K, 250K, 600K, 1,000K]` |
| **10** | Tuy Hòa | `PROPERTY` | `PINK` (3) | `150,000` | `100,000` | `[30K, 90K, 270K, 650K, 1,050K]` |
| **11** | Phan Thiết | `PROPERTY` | `PINK` (3) | `160,000` | `100,000` | `[32K, 96K, 290K, 700K, 1,100K]` |
| **12** | **CƠ HỘI (`?`)** | `CHANCE` | — | — | — | Rút thẻ từ bộ bài Cơ Hội chung |
| **13** | Vũng Tàu | `PROPERTY` | `ORANGE` (2) | `180,000` | `125,000` | `[36K, 108K, 320K, 780K, 1,250K]` |
| **14** | **Đảo Lý Sơn** | `RESORT` | — | `200,000` | — | Resort 2/4: `[50K, 150K, 400K, 1M]` |
| **15** | Nha Trang | `PROPERTY` | `ORANGE` (2) | `200,000` | `125,000` | `[40K, 120K, 360K, 850K, 1,350K]` |
| **16** | **CÚP QUỐC GIA** | `WORLD_CHAMPIONSHIPS` | — | — | — | Chọn miễn phí (`0K`) 1 thành phố sở hữu đăng cai (`2× → 3× → 4×...`) |
| **17** | Buôn Ma Thuột | `PROPERTY` | `AMBER` (2) | `220,000` | `150,000` | `[44K, 132K, 390K, 920K, 1,500K]` |
| **18** | **Côn Đảo** | `RESORT` | — | `200,000` | — | Resort 3/4: `[50K, 150K, 400K, 1M]` |
| **19** | Cần Thơ | `PROPERTY` | `AMBER` (2) | `240,000` | `150,000` | `[48K, 144K, 430K, 1,000K, 1,600K]` |
| **20** | **CƠ HỘI (`?`)** | `CHANCE` | — | — | — | Rút thẻ từ bộ bài Cơ Hội chung |
| **21** | Bắc Ninh | `PROPERTY` | `RED` (3) | `260,000` | `175,000` | `[52K, 156K, 460K, 1,100K, 1,750K]` |
| **22** | Bình Dương | `PROPERTY` | `RED` (3) | `280,000` | `175,000` | `[56K, 168K, 500K, 1,200K, 1,900K]` |
| **23** | Hải Phòng | `PROPERTY` | `RED` (3) | `300,000` | `175,000` | `[60K, 180K, 540K, 1,300K, 2,050K]` |
| **24** | **DU LỊCH XUYÊN VIỆT** | `WORLD_TOUR` | — | — | — | Chờ tại sân bay; **đầu lượt kế tiếp** trả `50,000` bay tới ô trống / đất mình |
| **25** | **Phú Quốc** | `RESORT` | — | `200,000` | — | Resort 4/4: `[50K, 150K, 400K, 1M]` |
| **26** | Đồng Nai | `PROPERTY` | `PURPLE` (2) | `320,000` | `200,000` | `[64K, 192K, 580K, 1,400K, 2,200K]` |
| **27** | Đà Nẵng | `PROPERTY` | `PURPLE` (2) | `350,000` | `200,000` | `[70K, 210K, 630K, 1,500K, 2,400K]` |
| **28** | **CƠ HỘI (`?`)** | `CHANCE` | — | — | — | Rút thẻ từ bộ bài Cơ Hội chung |
| **29** | **Hà Nội** | `PROPERTY` | `EMERALD` (2) | `400,000` | `250,000` | `[80K, 240K, 720K, 1,700K, 2,750K]` |
| **30** | **CƠ QUAN THUẾ** | `TAX` | — | — | — | Thu **10% tổng giá trị vốn bất động sản** đang sở hữu |
| **31** | **TP. Hồ Chí Minh** | `PROPERTY` | `EMERALD` (2) | `450,000` | `250,000` | `[90K, 270K, 810K, 1,900K, 3,100K]` |

- **Định nghĩa 4 Cạnh cho `LINE_MONOPOLY`** (sở hữu toàn bộ ô `PROPERTY` + `RESORT` trên 1 cạnh):
  - `SOUTH`: `[1, 2, 3, 4, 5, 6, 7]` (7 ô)
  - `WEST`: `[9, 10, 11, 13, 14, 15]` (6 ô)
  - `NORTH`: `[17, 18, 19, 21, 22, 23]` (6 ô)
  - `EAST`: `[25, 26, 27, 29, 31]` (5 ô đắt nhất bàn cờ)

---

## 3. Luật Chơi Cốt Lõi, Kinh Tế & Dòng Chảy Lượt Đi

### 3.1. Vốn khởi điểm, Lương & Theo dõi Vòng (`laps`)
- Phòng chờ (`StartModal` / `OnlineLobbyPanel`) cho phép chọn vốn khởi điểm: **Chuẩn (`2,000,000`)** hoặc **Đại gia (`3,000,000`)**, chế độ **Đấu đơn (`FFA`)** hoặc **Đấu đội `2v2` (`TEAMS_2V2`)**, tùy chọn **Xúc xắc chiến thuật (`Chẵn / Lẻ / Đổ lại`)** (mặc định TẮT để tương thích ngược), và **Đồng hồ giới hạn trận 20 phút (`1200s`)** xét thắng theo Tổng Tài Sản Ròng (`Net Worth`) khi hết giờ.
- `PlayerState` bổ sung:
  - `laps: number` (khởi tạo `0`; mỗi lần đi qua hoặc đáp trúng ô `0` khi di chuyển tiến về phía trước — kể cả bằng máy bay Du Lịch hoặc thẻ Cơ Hội tiến tới — được cộng `+300,000` và `laps += 1`; dừng tại ô `0` chỉ nhận lương và tăng vòng, không nâng cấp thành phố từ xa).
  - `pendingWorldTour: boolean` (khởi tạo `false`; bật thành `true` khi kết thúc bước đi trên ô `24` Sân bay Du Lịch).
  - `teamId?: 0 | 1` (chế độ `2v2`), `evenOddCharges?: number` (`3`), `rerollCharges?: number` (`2`).

### 3.2. Mua đất, Giới hạn Xây dựng theo Vòng & Nâng cấp Khách sạn
- **Mua lần đầu khi đáp vào `PROPERTY` vô chủ**:
  - Vòng đầu tiên (`player.laps === 0`): Chỉ được chọn mua **Đất trống (`level = 0`)**, **1 Nhà (`level = 1`)**, hoặc **2 Nhà (`level = 2`)**.
  - Từ vòng thứ hai trở đi (`player.laps >= 1`): Mở khóa thêm tùy chọn mua ngay **3 Nhà (`level = 3`)**.
  - **Không bao giờ** được xây Khách sạn (`level = 4 ★`) ngay trong lần đầu mua đất trống.
- **Đáp vào `RESORT` vô chủ**: Chỉ mua quyền sở hữu (`level = 0`, giá `200,000`), không có cấp nhà.
- **Đáp lại vào `PROPERTY` đã thuộc sở hữu của mình**:
  - Nếu `player.laps === 0`: Chỉ được nâng tối đa lên `level = 2`.
  - Nếu `player.laps >= 1`:
    - Khi thành phố đang ở `level < 3`: Được phép nâng tối đa lên `level = 3` (3 Nhà).
    - Khi thành phố **đã có sẵn `level === 3` từ trước**: Mở khóa nâng cấp lên **Khách Sạn Biểu Tượng (`level = 4 ★`)**.
- **Bảo vệ của Khách Sạn Biểu Tượng (`level = 4 ★`) & Khu Nghỉ Dưỡng (`RESORT`)**:
  - Miễn nhiễm hoàn toàn với **Mua đứt (`Buyout 2×`)**.

### 3.3. Hệ số Nhân Tiền Thuê, Lễ Hội Đầu Trận & Cúp Quốc Gia
- **Trạng thái Bàn cờ (`MatchBoardModifiers`)**:
  - `festivalTileIndices: number[]` — Khi bắt đầu ván mới, chọn ngẫu nhiên **3 thành phố** thuộc các nhóm màu khác nhau gắn cờ **Lễ Hội cố định (`×2` tiền thuê)**.
  - `championshipTileIndex: number | null` — Thành phố duy nhất đang giữ **Cúp Quốc Gia** (khởi tạo `null`).
  - `championshipMultiplier: number` — Hệ số nhân hiện tại của Cúp Quốc Gia (khởi tạo `1`; lần đầu có người đặt Cúp nhảy lên `2`, mỗi lần Cúp được đặt mới hoặc dời chỗ lại tăng `+1`: `2 → 3 → 4 → 5...`).
- **Công thức Tiền Thuê Thực Tế (`calculateRent`)**:
  - Với `RESORT`: `RESORT_RENTS[ownedResortCount - 1]` (`50K / 150K / 400K / 1M` — biến thể kinh tế giữ nguyên).
  - Với `PROPERTY`:
    `baseRent = tile.rents[prop.level]`
    `colorMult = ownsFullColorGroup ? 2 : 1`
    `festivalMult = festivalTileIndices.includes(tile.index) ? 2 : 1`
    `champMult = championshipTileIndex === tile.index ? championshipMultiplier : 1`
    `totalRent = baseRent * colorMult * festivalMult * champMult`
  - Trong chế độ `2v2`: nếu người dừng là đồng đội của chủ sở hữu (`areTeammates`), tiền thuê bằng `0`.
- **Ô Góc 16 — CÚP QUỐC GIA (`WORLD_CHAMPIONSHIPS`)**:
  - Phí đăng cai tại Ô 16 là **`CHAMPIONSHIP_FEE = 0`** (miễn phí — biến thể kinh tế giữ nguyên).
  - Khi người chơi dừng tại Ô 16:
    - Nếu người chơi sở hữu ít nhất 1 `PROPERTY`: Chuyển sang `turnPhase = 'CHAMPIONSHIP_SELECTION'`. Người chơi có thể chọn miễn phí 1 thành phố của mình trên bàn cờ (hoặc trong modal gợi ý) đăng cai Cúp Quốc Gia, hoặc bấm **Bỏ qua**.
    - Khi xác nhận chọn thành phố `targetIdx`: tăng hệ số Cúp lên `nextMult = championshipTileIndex === null ? 2 : championshipMultiplier + 1`, gán `championshipTileIndex = targetIdx`, kiểm tra hiệu ứng hiển thị nhãn tiền thuê mới rồi kết thúc hành động lượt.
    - Nếu không sở hữu `PROPERTY` nào: Ghi nhật ký tham quan Sân vận động miễn phí và kết thúc hành động lượt.

### 3.4. Mua Đứt Đất Đối Thủ (`Buyout 2×`)
- Khi đáp vào `PROPERTY` của đối thủ:
  1. Bắt buộc thanh toán đủ `totalRent` trước (nếu thiếu tiền mặt phải qua bước Bán tài sản trả nợ).
  2. Sau khi đã trả xong tiền thuê (kể cả vừa bán bớt thành phố khác để trả nợ mà vẫn còn tiền dư!), nếu `prop.level < 4` và `player.cash >= buyoutCost`:
     - `buyoutCost = (tile.price + prop.level * tile.houseCost) * 2`
     - Mở `BuyoutDecisionModal` hỏi người chơi có muốn chi `buyoutCost` để chiếm quyền sở hữu thành phố đó không.
  3. Nếu đồng ý: Trừ `buyoutCost` của người mua, cộng thẳng `buyoutCost` cho chủ cũ, đổi `ownerId` sang người mua, **giữ nguyên `prop.level` hiện tại**, kiểm tra ngay điều kiện thắng Độc quyền (`TRIPLE_MONOPOLY` / `LINE_MONOPOLY`), và **kết thúc hành động lượt ngay** (tuyệt đối không mở `UPGRADE_DECISION` trong cùng lượt vừa mua đứt).

### 3.5. Đảo Hoang (Ô 8), Du Lịch Xuyên Việt (Ô 24) & Cơ Quan Thuế (Ô 30)
- **Ô 8 — Đảo Hoang (`LOST_ISLAND`)**:
  - Không còn khái niệm "Thăm Tù". Bất kỳ ai kết thúc di chuyển tại Ô 8 (do đổ xúc xắc đáp trúng, rút thẻ Cơ Hội bị đày, hoặc đổ 3 lần đôi liên tiếp) đều bị đặt `inJail = true, jailTurns = 0, doublesStreak = 0, pendingWorldTour = false`.
  - Đầu lượt khi `inJail === true`:
    1. Dùng **Thẻ Thoát Đảo Hoang** (`jailFreeCards > 0`) → thoát ngay, tiếp tục đổ xúc xắc.
    2. Nộp bảo lãnh **`200,000`** (`JAIL_FINE = 200_000`) → thoát ngay, tiếp tục đổ xúc xắc.
    3. Thử đổ xúc xắc:
       - Nếu ra **Đôi**: Thoát Đảo Hoang miễn phí (`doublesStreak = 0` — không được thưởng thêm lượt đổ phụ từ cú đôi thoát đảo) và đi đúng tổng số nút vừa đổ.
       - Nếu **không ra Đôi** ở lần thử thứ 1 hoặc 2 (`jailTurns` tăng lên `1` hoặc `2`): Đứng yên tại Đảo Hoang và kết thúc lượt.
       - Nếu **không ra Đôi ở lần thử thứ 3** (`jailTurns` đạt `3`): Theo chuẩn Business Tour, hết 3 lượt giam giữ người chơi **tự động được trả tự do miễn phí** và đi tiếp tổng số nút vừa đổ.
- **Ô 24 — Sân Bay Du Lịch (`WORLD_TOUR`)**:
  - Khi đáp xuống Ô 24: Đặt `pendingWorldTour = true`, thông báo đã đặt chân tới Sân bay (sẵn sàng bay vào lượt kế tiếp), và kết thúc hành động lượt đó (nếu vào Ô 24 bằng xúc xắc Đôi thì theo luật vẫn còn lượt đổ tiếp — ngay ở lượt đổ tiếp đó sẽ kích hoạt lựa chọn bay!).
  - Đầu lượt mới (hoặc lượt đổ tiếp) khi `player.pendingWorldTour === true` và `!player.inJail`:
    - Nếu `player.cash >= 50,000` và trên bàn cờ có ít nhất 1 mục tiêu hợp lệ (**ô `PROPERTY`/`RESORT` vô chủ** HOẶC **`PROPERTY` đang thuộc sở hữu của chính người chơi đó**): Mở `turnPhase = 'WORLD_TOUR'` đầu lượt.
    - Người chơi chọn:
      - **Bay (`50,000`)** tới 1 ô hợp lệ → trừ `50,000`, tắt `pendingWorldTour = false`, `doublesStreak = 0`, di chuyển theo chiều kim đồng hồ tới ô đích (nếu đi qua Ô 0 nhận lương `+300,000` & `laps += 1`), xử lý ô đích xong sẽ sang kết thúc lượt.
      - **Không bay (Đổ xúc xắc thường)** → tắt `pendingWorldTour = false` và chuyển sang `AWAIT_ROLL` bình thường.
- **Ô 30 — Cơ Quan Thuế (`TAX`)**:
  - Tiền thuế = `Math.round(totalRealEstateValue * 0.10)`, trong đó `totalRealEstateValue` là tổng vốn đầu tư (`price + level * houseCost`) của toàn bộ `PROPERTY` và `RESORT` người chơi đang nắm giữ.
  - Nếu người chơi chưa sở hữu bất động sản nào (`tax === 0`): Miễn thuế (`0`), kết thúc hành động lượt.
  - Tiền thuế nộp về Ngân hàng (xóa hoàn toàn biến `taxPool`).

### 3.6. Thanh Lý Trả Nợ (`100%` + `Auto-Sale`), Phá Sản & Gỡ Bỏ Giao Dịch (`Trade`)
- **Chỉ bán tài sản khi giải quyết nợ (`DEBT_RESOLUTION`)**:
  - Gỡ nút bán nhà/bán đất tự do ngoài lúc mắc nợ và gỡ toàn bộ `TradeModal` (`AuctionAndTradeModals.tsx` + logic `evaluateBotTradeOffer`).
  - Khi `player.cash < debtAmount`:
    - Tính `totalPortfolioValue = sum(propInvestedValue)` (hoàn **100%** vốn đầu tư cho mỗi thành phố/Resort bán lại cho Ngân hàng; khi bán 1 thành phố là bán trọn gói đất + nhà trên ô đó về trạng thái vô chủ `ownerId: null, level: 0`, nếu thành phố đó đang giữ Cúp Quốc Gia thì gỡ Cúp `championshipTileIndex = null`).
    - Mở giao diện **"Chọn Thành Phố Để Bán Trả Nợ"** hiển thị rõ:
      1. `Số tiền còn thiếu` (`Math.max(0, debtAmount - (player.cash + selectedRefund))`)
      2. `Số tiền còn dư sau khi trả nợ`
      3. Danh sách các thành phố/Resort đang sở hữu để tick chọn nhiều ô cùng lúc + nút **"Bán Tự Động Tối Ưu" (`Auto-Sale`)** + nút **"Xác Nhận Bán & Trả Nợ"** + nút **"Tuyên Bố Phá Sản"**.
    - **Thuật toán `computeOptimalAutoSale(playerId, neededCash, properties, boardModifiers)`**:
      - Nếu tổng toàn bộ tài sản `< neededCash`, đánh dấu không đủ khả năng chi trả (khuyến nghị Phá sản).
      - Ngược lại, chấm điểm ưu tiên giữ lại cho từng ô (Khách sạn Cấp 4 > ô thuộc bộ Độc quyền màu hoàn chỉnh > Resort khi có ≥2 > ô giữ Cúp Quốc Gia > ô lẻ giá rẻ) và chọn tập con có tổng hoàn tiền `>= neededCash` sao cho **tổng điểm chiến thuật bị mất thấp nhất**, sau đó ưu tiên lượng tiền thừa nhỏ nhất.
- **Xử lý Phá Sản đồng nhất 100% giữa Người và Bot**:
  - Với **Bot AI** trong `DEBT_RESOLUTION`: Kiểm tra ngay đầu tiên `if (bot.cash + totalPortfolioValue < pendingDebt.amount)` → gọi thẳng `handleDeclareBankruptcy()` mà **không bán lẻ tẻ trước đó**. Nếu đủ khả năng trả, Bot gọi trực tiếp `computeOptimalAutoSale` để bán đúng gói thành phố tối ưu và thanh toán nợ!
  - Trong `handleDeclareBankruptcy()`:
    - Nếu nợ đối thủ (`creditorId !== null`): Chuyển cho `creditorId` **phần `cash` mặt còn lại CỘNG `100%` giá trị bất động sản được thanh lý** (`calculateBankruptcyCreditorPayout` — biến thể kinh tế giữ nguyên).
    - **Toàn bộ** các ô `PROPERTY` và `RESORT` của người phá sản đều trả về Ngân hàng (`ownerId: null, level: 0`), gỡ Cúp Quốc Gia nếu đang đặt trên các ô đó.

### 3.7. Sửa Dứt Điểm Đồng Hồ Đếm Ngược Lượt Đi (`45s`)
- Đồng hồ `45s` chỉ khởi tạo lại khi **bắt đầu một lượt mới** (hoặc khi được thưởng thêm lượt mới từ xúc xắc Đôi), **không** bị reset lại 45s khi chuyển qua các bước con (`BUY_DECISION`, `BUYOUT_DECISION`, `DEBT_RESOLUTION`, `REROLL_DECISION`) trong cùng 1 lượt.
- Khi hết giờ (`turnTimeLeft === 0`) đối với người chơi (đồng thời xóa `doublesStreak = 0` trong mọi nhánh hết giờ quyết định để không thưởng thêm lượt khi AFK):
  - `WORLD_TOUR`: Tự bỏ qua chuyến bay và đổ xúc xắc.
  - `AWAIT_ROLL`: Nếu đang ở Đảo Hoang thì tự đổ xúc xắc thử vận may; nếu ở ngoài thì tự đổ xúc xắc.
  - `REROLL_DECISION`: Tự xác nhận giữ kết quả đổ hiện tại và di chuyển (`CONFIRM_ROLL_MOVE`).
  - `BUY_DECISION` / `UPGRADE_DECISION` / `BUYOUT_DECISION` / `CHAMPIONSHIP_SELECTION` / `CARD_TARGET_SELECTION`: Tự động bỏ qua.
  - `CARD_REVEAL`: Tự xác nhận thẻ.
  - `DEBT_RESOLUTION`: Tự động chạy `computeOptimalAutoSale` để bán trả nợ ngay; nếu tổng tài sản không đủ trả nợ thì tự động gọi `handleDeclareBankruptcy()` (triệt tiêu hoàn toàn lỗi treo đồng hồ ở `00:00`).
  - Lượt đi tự động kết thúc ngay sau khi hoàn tất hành động ở pha con (`completeTurnAfterAction`), không dùng trạng thái trung gian chờ bấm kết thúc lượt.

---

## 4. Đồng Bộ Đồ Họa 3D, HUD, Bộ Thẻ Cơ Hội GĐ1 & Backend

1. **Khớp 100% 4 Góc 3D trong `src/three/models.ts` & `src/three/textures.ts`**:
   - Góc `0`: Bắt Đầu (`START`).
   - Góc `8`: Đảo Hoang (`LOST_ISLAND` — cập nhật nhãn sàn `ĐẢO HOANG`).
   - Góc `16`: Cúp Quốc Gia (`WORLD_CHAMPIONSHIPS` — dùng mô hình Sân vận động mái vòm + Cúp Vàng xoay).
   - Góc `24`: Du Lịch Xuyên Việt (`WORLD_TOUR` — dùng mô hình Nhà ga Sân bay + Máy bay phản lực).
2. **Nhãn Giá 3D Động ngoài rìa bàn cờ (`MonopolyCanvas.tsx` + `rules.ts`)**:
   - Ô chưa có chủ (`ownerId === null`): Hiển thị **Giá Mua gốc** (ví dụ `200K`).
   - Ô đã có chủ (`ownerId !== null`): Tự động đổi sang hiển thị **Tiền Thuê Thực Tế Hiện Tại** (đã nhân Độc quyền màu × Lễ hội × Cúp Quốc Gia, ví dụ `360K` hoặc `1.44M`) trên nền màu chủ sở hữu, kèm ký hiệu `🏆` nếu đang giữ Cúp hoặc `🎉` nếu là thành phố Lễ Hội.
   - Ô Cơ Quan Thuế (`30`): Nhãn hiển thị `-10%`.
3. **Sân cỏ trung tâm (`createCourtyardDiorama`)**:
   - Thay chữ 3D `taxPool` chết bằng dòng chữ nổi 3D thể hiện trạng thái Cúp/Giải đấu hiện tại (ví dụ `CÚP ×2`, `CÚP ×3`, hoặc `2 000 000` mục tiêu khi chưa có Cúp) và sửa đồng hồ 3D khởi tạo đúng `45s`.
4. **Bộ Thẻ Cơ Hội Giai đoạn 1 (Gộp 3 ô `12, 20, 28` về 1 bộ `CHANCE_CARDS` đồng nhất)**:
   - Cập nhật toàn bộ chỉ số ô đích & giá trị tiền sang thang 32 ô Business Tour (gồm: *Về Bắt Đầu `+300K`*, *Bay tới Sân bay Du Lịch*, *Tới TP.HCM / Hà Nội / Phú Quốc*, *Đăng cai Cúp Quốc Gia miễn phí*, *Đày ra Đảo Hoang*, *Thẻ Thoát Đảo Hoang*, *Tới Cơ quan Thuế*, *Mừng Sinh Nhật `+25K` từ mỗi người*, *Phạt vi phạm `-50K`*, *Cổ tức `+150K`*, *Động đất*, *Mất điện*, *Khiên bảo hộ*).
5. **Sửa Backend `server.ts` & `TileInspectorCard`**:
   - Đổi model dự phòng không tồn tại `'gemini-4-hydrogen'` thành `'gemini-2.5-flash'`, bỏ nhân `BT_DISPLAY_MULTIPLIER = 3000` trong `server.ts`, tách bộ nhớ câu thoại theo client/session.
   - Cập nhật `TileInspectorCard` hiển thị đầy đủ bảng tiền thuê 1–4 Khu nghỉ dưỡng (`RESORT`), thông tin Lễ Hội `×2` và Cúp Quốc Gia hiện tại.

---

## 5. Tổ Chức Mô-Đun & Kiểm Thử (Testing & Verification)

### 5.1. Kiến trúc tách lớp phục vụ mở rộng (Phase 2–4 Ready)
- `src/game/types.ts`: Cập nhật `TileKind` (`START`, `PROPERTY`, `RESORT`, `CHANCE`, `TAX`, `LOST_ISLAND`, `WORLD_CHAMPIONSHIPS`, `WORLD_TOUR`), `ColorGroup` (8 màu), `PlayerState` (`laps`, `pendingWorldTour`), `MatchBoardModifiers`, `AutoSalePlan`. Xóa `TradeOffer`, `TradeEvaluationResult`, `PropertyState.mortgaged`.
- `src/game/boardData.ts`: Định nghĩa 32 ô chuẩn, 8 nhóm màu, bộ thẻ Cơ Hội thang tiền mới.
- `src/game/rules.ts`: Toàn bộ hàm thuần (pure functions) tính tọa độ 32 ô, tiền thuê nhân hệ số Lễ Hội / Cúp / Resort, kiểm tra cấp xây dựng theo `laps`, `Buyout 2×`, Thuế `10%`, thuật toán `computeOptimalAutoSale`, kiểm tra 4 điều kiện thắng (`LAST_STANDING`, `TRIPLE_MONOPOLY`, `LINE_MONOPOLY`, `RESORT_MONOPOLY`), và Bot AI cập nhật cho 32 ô (biết mua/chặn Cạnh & 4 Resort, chọn thành phố đặt Cúp, bay lượt kế tiếp, tự thanh lý tối ưu).
- `package.json`: Bổ sung script `"test": "tsx --test src/game/*.test.ts"` và gỡ các package không sử dụng nếu không còn tham chiếu.

### 5.2. Tiêu chí Kiểm thử Bắt buộc (`src/game/rules.test.ts` + Build)
1. Kiểm tra đủ 32 ô, tọa độ không gian không chồng lấn, 4 góc đúng chỉ số `0, 8, 16, 24`, 8 nhóm màu (20 thành phố) và 4 Resort (`4, 14, 18, 25`).
2. Kiểm tra giới hạn xây dựng theo `laps`: `laps = 0` chặn Cấp 3 & 4; `laps >= 1` cho lên Cấp 3, chỉ khi đang ở Cấp 3 mới lên được Cấp 4 (`★`).
3. Kiểm tra `calculateRent`: kết hợp chính xác giữa Độc quyền màu (`×2`), Lễ Hội (`×2`) và Cúp Quốc Gia lũy tiến (`×2, ×3, ×4...`), cũng như bậc tiền thuê `1..4` của Resort.
4. Kiểm tra `Buyout 2×` chặn đúng Cấp 4 & Resort, và Thuế `10%` tính chuẩn trên tổng vốn bất động sản.
5. Kiểm tra `computeOptimalAutoSale` (giữ lại Khách sạn & bộ Độc quyền khi có ô lẻ đủ trả nợ; báo không đủ khi tổng vốn `< nợ`) và kiểm tra 4 điều kiện thắng.
6. Chạy `npm test`, `npm run lint` (`tsc --noEmit`), và `npm run build` xanh 100%.
