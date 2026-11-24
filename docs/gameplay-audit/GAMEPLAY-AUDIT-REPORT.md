# COMPREHENSIVE GAMEPLAY AUDIT REPORT — Cờ Tỷ Phú 3D Việt Nam

> **Cập nhật hậu khắc phục & Independent Review (2026-11-24):** Toàn bộ **11/11 lỗi** phát hiện trong báo cáo kiểm toán gốc bên dưới (đã nâng mức `BUG-04` P2→P1 và `BUG-05` P3→P1) cùng 7 điểm gia cố từ vòng Independent Second-Agent Review đã được triển khai sửa lỗi theo TDD và xác minh lại từ đầu (`106/106` unit/sim tests, `45/45` headed Playwright E2E chạy trọn vẹn sau lần sửa cuối, `190/190` seeded simulations, benchmark thuần RAF `60/30/15/5/2.5 FPS` và đồng hồ Offline `0.0s / 61.0s`). Điểm chất lượng trung bình tăng từ **`85.0 / 100` → `95.1 / 100`**.
> Xem chi tiết đầy đủ tại: [`BUG-FIX-REPORT.md`](./BUG-FIX-REPORT.md) · [`REGRESSION-TEST-REPORT.md`](./REGRESSION-TEST-REPORT.md) · [`PERFORMANCE-COMPARISON.md`](./PERFORMANCE-COMPARISON.md) · [`FINAL-GAMEPLAY-AUDIT.md`](./FINAL-GAMEPLAY-AUDIT.md) · [`RELEASE-READINESS-CHECKLIST.md`](./RELEASE-READINESS-CHECKLIST.md).
> *(Nội dung bên dưới giữ nguyên bản ghi kiểm toán gốc tại `main @ 515feab` để đối chiếu Before/After minh bạch).*

- **Ngày thực hiện kiểm toán gốc:** 2026-11-24
- **Nhánh & Commit kiểm toán:** `main` @ `515feab` (working tree mã nguồn hoàn toàn sạch trước và sau kiểm toán)
- **Game tham chiếu:** *Business Tour* (8Floor / Creobit) kết hợp hệ thống đặc tả thiết kế nội bộ tại `docs/superpowers/specs/`.
- **Phương pháp thực hiện:** Kết hợp đọc sâu 100% mã nguồn thực thi (`rules.ts`, `boardData.ts`, `types.ts`, `onlineTypes.ts`, `App.tsx`, `roomManager.ts`, `wsServer.ts`, `appServer.ts`, `onlineClient.ts`, `botQuipClient.ts`, `MonopolyCanvas.tsx`, `physicsEngine.ts`, `treasurySystem.ts`, các modal UI & `soundEngine.ts`) + chạy toàn bộ test suite chuẩn + chạy **190 trận simulation Bot-vs-Bot có seed tái lập** + kiểm thử trực tiếp trên **nhiều cửa sổ trình duyệt Chrome thật (Playwright Headed Mode)** bao gồm 4 người chơi thật, mạng trễ `700ms RTT`, ngắt nóng WebSocket giữa animation, thu nhỏ cửa sổ / hạ FPS xuống `2.5–5.0 FPS`, tái hiện lỗi trạng thái Xúc xắc chiến thuật Online và giả lập sập Gemini API.

---

## 1. Tóm tắt Điều hành (Executive Summary)

| Hạng mục kiểm chứng | Kết quả thực tế |
|---|---|
| `npm run lint` / `npm test` / `npm run build` | **PASS** (`0` lỗi TS) / **84/84 PASS** / **PASS** (cảnh báo bundle client `1,345.24 kB`) |
| `npx playwright test --headed` (bộ E2E có sẵn) | **41/41 PASS** trên Chrome headed (`11.7 phút`, `0` fail) |
| Simulation Bot-vs-Bot có seed tái lập (`OnlineRoomManager`) | **190/190 trận hoàn thành tự nhiên**, `0` trận kẹt/deadlock, `0` vi phạm bất biến tiền hay sở hữu |
| Kiểm thử trình duyệt thực bổ sung (Online 4P, Người+Bot, 700ms RTT, Đứt WS, FPS thấp, Không Gemini Key, Tactical Dice Jail) | Hoàn tất 100% kịch bản; phát hiện & tái hiện trực tiếp end-to-end các lỗi ẩn sâu |
| Tổng hợp lỗi phát hiện (đã khử trùng lặp theo root cause) | **`0 × P0` · `2 × P1` · `4 × P2` · `5 × P3` (Tổng cộng: 11 lỗi)** |

### Kết luận Mức độ Sẵn sàng Phát hành (Release Readiness Verdict)
- **Trạng thái:** **CÓ ĐIỀU KIỆN — Sẵn sàng phát hành sau khi vá Đợt 1 & Đợt 2 (6 lỗi P1/P2 + `BUG-06` hỗ trợ, ước lượng ~0.5–1 ngày làm việc).**
- **Lý giải:**
  - Nền tảng gameplay cốt lõi, máy trạng thái lượt chơi, hệ thống kinh tế, vật lý xúc xắc `cannon-es`, âm thanh WebAudio và khả năng tự phục hồi kết nối Online đạt độ ổn định rất cao (**0 lỗi P0**, không xảy ra crash, không nhân đôi tiền hay kẹt luồng qua hơn 230 trận kiểm thử).
  - Tuy nhiên, trước khi mở rộng cho người chơi thực tế (đặc biệt là chế độ Online & Đấu Đội 2v2), dự án **cần khắc phục 2 lỗi P1 và 4 lỗi P2**:
    1. `BUG-02` (**P1**): Thứ tự lượt Online xếp hết người thật trước Bot, làm gãy luật luân phiên đội `Đội A → Đội B` ở chế độ 2v2 khi người thật ngồi ghế `0` và `2`, đồng thời làm lệch vị trí góc HUD / khay tiền 3D so với ghế sảnh.
    2. `BUG-01` (**P1**): Bộ đếm AFK Online tăng theo từng *phase* hết giờ thay vì từng *lượt*, khiến người chơi mới AFK ở ngay Lượt 1 (~62s) đã bị Bot AI tiếp quản kèm log báo sai `"AFK 2 lượt liên tiếp"`.
    3. `BUG-04` (**P2**): Client Online lưu `GAME_ACTION` vào hàng đợi khi đứt mạng và tự động xả lại ngay sau `RECONNECT_ROOM`, gây thực thi nhầm hành động cũ sang một lượt khác (đã tái hiện live end-to-end mất trắng lượt trong Đảo Hoang).
    4. `BUG-11` (**P2**): Client Online không reset lựa chọn `selectedDiceChoice` (`EVEN`/`ODD`) đầu lượt mới / khi vào Đảo Hoang / khi hết lượt Chẵn-Lẻ, khiến cú bấm `🎲 Đổ Săn Đôi` đầu tiên ở Đảo Hoang bị server từ chối `INVALID_ACTION` và bật banner báo lỗi.
    5. `BUG-03` (**P2**): Đồng hồ trận 20:00 và đồng hồ lượt 45s ở Offline bị trôi chậm ~28.3% do tạo lại `setInterval(1000)` mỗi lần đổi `turnPhase`.
    6. `BUG-10` (**P2**): Kẹp cứng `animDt <= 0.06s` cho cả Promise xúc xắc/quân cờ làm animation bị slow-motion `3.5×–16.7×` khi máy chạy dưới `16 FPS` hoặc khi cửa sổ bị che khuất khiến trình duyệt giảm nhịp RAF xuống `1–2.4 Hz`.

---

## 2. Phân tích chuyên sâu theo từng trụ cột kiểm toán

### 2.1 Luật chơi so với Business Tour & Đặc tả dự án (Chi tiết tại `BUSINESS-TOUR-RULES-COMPARISON.md`)
- **Khớp chuẩn Business Tour gốc:** Bàn cờ 32 ô (4 góc, 8 bộ màu, 4 Resort, 3 Cơ Hội, 1 Thuế); 4 điều kiện thắng tức thì (`LAST_STANDING`, `TRIPLE_MONOPOLY`, `SIDE_MONOPOLY`, `RESORT_MONOPOLY`); quy tắc 3 lần Đôi vào Đảo Hoang; cơ chế Đảo Hoang 3 lượt (đổ Đôi thoát không thưởng lượt kế, trượt lần 3 tự do miễn phí, nộp bảo lãnh `200K` hoặc dùng Thẻ Thoát Đảo); chặn xây nhảy cóc Landmark ★ (bắt buộc đã có 3 Nhà ở lượt trước mới được nâng lên cấp 4); Mua đứt `2×` chặn Resort/Landmark/Khiên; bộ 3 thẻ chiến thuật Động Đất / Mất Điện / Khiên Bảo Hộ (nhắm vào thành phố có Khiên sẽ tiêu thụ mất Khiên `blockedByShield: true`); chế độ Đấu Đội 2v2 miễn thuê đồng đội và gộp sở hữu độc quyền.
- **Các luật đã được dự án chủ động tùy chỉnh (`CUSTOM` — được khóa rõ trong `docs/superpowers/specs/` và được bảo toàn nguyên vẹn):**
  - Tắt xây nhà từ xa tại ô Bắt Đầu (Spec Phase 1 §3.1).
  - Kết thúc hành động lượt ngay sau khi Mua đứt `2×`, không mở nâng cấp tiếp trong cùng lượt (Spec Phase 1 §3.4).
  - Cạnh độc quyền `BOARD_SIDES` (`SIDE_MONOPOLY`) bao gồm cả các ô Resort nằm trên cạnh đó (Spec Phase 1 §2.2).
  - Cúp Quốc Gia miễn phí (`0K`), duy nhất 1 thành phố đăng cai toàn bàn với hệ số nhân toàn cục lũy tiến `2× → 3× → 4×...` (Spec Phase 1 §3.3).
  - Bán tài sản khi thiếu tiền hoàn 100% vốn đầu tư và bồi thường phá sản trả đủ 100% giá trị thanh lý cho chủ nợ (Spec Phase 1 §3.6).
- **Sai lệch thực thi về luật lượt chơi & trạng thái xúc xắc Online:** `BUG-02` (thứ tự lượt Online không theo ghế) và `BUG-11` (client Online không reset lựa chọn xúc xắc `EVEN`/`ODD` đầu lượt mới).

### 2.2 Game Flow & State Machine (Chi tiết tại `GAMEPLAY-FLOW.md`)
- Chuỗi 13 giá trị `TurnPhase` (12 pha trong lượt + `GAME_OVER`) được khóa đồng bộ bằng `turnPhaseRef` (Offline) và kiểm tra tức thì trước mọi `await` trong `OnlineRoomManager` (Online).
- **Kiểm chứng chống khai thác thao tác:**
  - Gửi hành động trái lượt bị chặn ngay bằng `NOT_YOUR_TURN` (`C1`, `F3`).
  - Bấm liên tục nút Đổ xúc xắc 10 lần + nhấn `Space` 6 lần chỉ tạo đúng `1` lần tung xúc xắc (`D2`, `C2`).
  - Gửi đúp lệnh mua đất chỉ trừ tiền đúng `1` lần (`C3`).
  - Chuỗi sự kiện lồng nhau phức tạp nhất (thẻ Cơ Hội di chuyển tới thành phố đối thủ → thiếu tiền mở `DEBT_RESOLUTION` → bán nhà trả nợ còn dư tiền → mở tiếp `BUYOUT_DECISION`; hoặc thẻ Sinh Nhật `ch-10` làm ≥ 2 người chơi mắc nợ cùng lúc trong `pendingDebtQueue` rồi trả lại lượt + chuỗi đôi cho người rút thẻ) đều vận hành hoàn chỉnh không rò rỉ trạng thái.

### 2.3 Hệ thống Kinh tế (Economy Audit)
- Mọi giao dịch mua đất, xây nhà, trả tiền thuê (kể cả nhân chồng Độc quyền × Lễ hội × Cúp), thuế 10% vốn BĐS, phí World Tour `50K`, bảo lãnh Đảo `200K`, thanh lý trả nợ hoàn 100% vốn đều chính xác tuyệt đối đến từng đơn vị trên cả HUD, state nội bộ và server.
- Hệ thống Kho bạc 3D (`treasurySystem.ts`) chỉ diễn hoạt trực quan dựa trên chênh lệch giữa hai snapshot tiền mặt, hoàn toàn tách biệt khỏi kết quả giao dịch số học.
- **2 phát hiện biên trong hệ thống kinh tế:**
  - `BUG-05` (**P3**): Hết giờ trận `20:00` ngay giữa `DEBT_RESOLUTION` chưa khấu trừ khoản nợ đang treo khi chấm điểm Net Worth.
  - **Ghi nhận thiết kế kinh tế (không phải bug code):** Theo Spec §3.6, khi người chơi phá sản vì nợ đối thủ, toàn bộ BĐS được trả về Ngân hàng (vô chủ) *đồng thời* chủ nợ vẫn được nhận tiền mặt tương đương `cash + 100% giá trị BĐS` của người thua. Cơ chế này tạo thêm tiền mới vào ván đấu và có thể sinh hiện tượng "kingmaking" nếu người sắp thua chủ động dẫm vào đất của một người cụ thể.

### 2.4 Đánh giá Bot AI & Khả năng kháng lỗi Gemini API
- **Độ tin cậy thực thi:** Hoàn thành **190/190 trận Bot-vs-Bot** tự động (trung bình `82` lượt ở 4P FFA, `48` lượt ở 2P, `53` lượt ở 2v2) với `0` trận kẹt và `0` lệnh bất hợp lệ. Trên giao diện thật (`F6`), 4 Bot tự động đấu với nhau mượt mà (`20` dòng nhật ký sự kiện chỉ trong `18s` đầu ở tốc độ `2×`) tới tận bảng tổng kết `VictoryModal`.
- **Chiến thuật & Công bằng:** Bot biết ưu tiên hoàn tất bộ độc quyền / chặn bộ thắng tức thì của đối thủ, chọn mục tiêu Cúp & thẻ Động đất/Mất điện/Khiên hợp lý (tự giảm trọng số khi ô đối thủ đang có Khiên Bảo Hộ), tự đánh giá Chẵn/Lẻ & Đổ lại xúc xắc chiến thuật và tự bán tài sản trả nợ tối ưu (trừ điểm trừ nhỏ `BUG-08` chưa xét đất đồng đội khi tự bán ở 2v2). Bot dùng chung bộ luật và không đọc trộm bộ bài hay kết quả xúc xắc tương lai; kiểm định 40 trận đo lợi thế ghế (`B6`) cho tỷ lệ thắng cân bằng tuyệt đối giữa 4 ghế: **`10 / 10 / 9 / 11`**.
- **Độc lập hoàn toàn với Gemini API (`F7`):** Khi khởi chạy không có `GEMINI_API_KEY` hoặc khi `/api/bot-quip` bị ép trả lỗi `HTTP 500`, cả server (`appServer.ts:231-239`) lẫn client (`botQuipClient.ts:21-53`) đều lập tức chuyển sang bộ câu thoại tiếng Việt có sẵn theo từng hình mẫu nhân vật, trả lượt về cho người chơi bình thường (`gameStillPlayableAfter500: true`).

### 2.5 Multiplayer Online & Khả năng chịu lỗi mạng
- **Thẩm quyền Server (Server Authority):** Server kiểm soát hoàn toàn xúc xắc, vị trí, số dư và quyền sở hữu; payload sai kiểu, vượt biên `16 KiB` hoặc spam tốc độ cao đều bị `wsServer.ts` và `roomManager.ts` chặn an toàn.
- **Đồng bộ 4 người chơi thật & Kháng đứt mạng (`F1`, `F2`, `F3`, `D7`, `D8`):**
  - Trên 4 cửa sổ Chrome độc lập (`F1`), tiền mặt, vòng chạy, biểu cảm, thẻ Cơ Hội (hiện cho cả 4 người xem nhưng chỉ mở nút xác nhận cho người đang đi), bảng xếp hạng `VictoryModal` và thao tác đưa cả phòng về sảnh chờ đều khớp 100%.
  - Dưới độ trễ mạng `700ms ± 120ms`, ngắt nóng WebSocket ngay giữa lúc xúc xắc đang bay (`+350ms`), hoặc nhấn F5 tải lại trang ngay giữa lúc quân cờ đang nhảy 9 ô (`+1750ms`), trình duyệt đều tự động `RECONNECT_ROOM` bằng `sessionToken`, lọc sạch gói sự kiện trùng `eventSeq` và khôi phục đúng modal quyết định tại ô đích với `0` lỗi console.
- **Các lỗi Online cần sửa:** `BUG-01` (đếm AFK), `BUG-02` (thứ tự ghế), `BUG-04` (phát lại action cũ sau khi nối mạng lại), `BUG-11` (không reset `selectedDiceChoice` đầu lượt mới), `BUG-06` (bỏ qua im lặng làm khóa nút 6s), `BUG-09` (watchdog dự phòng cho Bot).

### 2.6 Đồng bộ Animation, Đồ họa 3D & Âm thanh
- Mô phỏng xúc xắc vật lý `cannon-es` (`165` bước ở `90 Hz`) luôn đáp phẳng đúng mặt `(die1, die2)` trong `1.30s – 1.38s` (`< 1.45s` nhịp chờ server).
- Đổi nóng chất lượng đồ họa (`Cao → Thấp → Vừa → Cao`), tốc độ (`1× ↔ 2×`), Chế độ Ban đêm và kiểu Tiền tệ 3D ngay giữa lúc xúc xắc và quân cờ đang di chuyển không làm rớt ngữ cảnh WebGL hay lệch ô đích (`F5`, `D9`).
- Hệ thống âm thanh tổng hợp WebAudio (`soundEngine.ts`) kích hoạt đầy đủ các hiệu ứng tung xúc xắc, va chạm khay, bước nhảy quân cờ, mua nhà, thu tiền thuê, rút thẻ, còi Đảo Hoang (`237` sự kiện âm thanh đo trực tiếp trong `D9`) và chịu lỗi an toàn khi trình duyệt khóa autoplay.
- Điểm cần cải thiện duy nhất ở tầng animation là `BUG-10` (tách `gameplayAnimDt` khỏi trần kẹp `0.06s` để không bị slow-motion `3.5×–16.7×` ở `< 16 FPS` hoặc cửa sổ bị che khuất).

---

## 3. Chấm điểm chất lượng thực nghiệm (Thang 0 – 100)

| # | Hạng mục đánh giá | Điểm số | Căn cứ chấm điểm thực nghiệm |
|---|---|---|---|
| 1 | **Core Gameplay** | **90 / 100** | Đầy đủ 12 pha trong lượt + `GAME_OVER`, 32 ô, 15 thẻ Cơ Hội, 4 điều kiện thắng, FFA & 2v2; 0 deadlock qua 190 trận sim + toàn bộ E2E. |
| 2 | **Rules Accuracy** | **88 / 100** | Khớp chặt luật Business Tour và toàn bộ Spec tùy chỉnh của dự án; trừ điểm do lỗi thứ tự lượt ghế Online (`BUG-02`). |
| 3 | **Economy System** | **88 / 100** | 0 sai lệch số học, 0 cộng/trừ tiền hai lần, bảo toàn chủ sở hữu tuyệt đối; trừ nhẹ do `BUG-05` (nợ treo lúc hết giờ) và `BUG-08` (auto-sale 2v2). |
| 4 | **Bot AI** | **85 / 100** | Hoàn thành 190/190 trận, tỷ lệ thắng theo ghế cân bằng `10/10/9/11`, biết chốt nước thắng tức thì và chống lỗi Gemini API hoàn hảo; trừ nhẹ `BUG-08` & `BUG-09`. |
| 5 | **Multiplayer Synchronization** | **75 / 100** | Kiến trúc server-authoritative và tự phục hồi đứt mạng giữa animation rất tốt (`F1–F3`), nhưng bị kéo điểm bởi `BUG-01`, `BUG-02`, `BUG-04` và `BUG-11`. |
| 6 | **State Management** | **85 / 100** | Cơ chế ref-mirror + `sessionEpoch` chống race condition hiệu quả; kiến trúc tách đôi engine Offline (`App.tsx`) và Online (`roomManager.ts`) cần giữ kỷ luật đồng bộ (`BUG-07`, `BUG-11`). |
| 7 | **Animation Synchronization** | **82 / 100** | Xúc xắc vật lý chính xác, landing latch mượt, đổi nóng Graphics Quality an toàn; trừ điểm do hiện tượng giãn thời gian ở `< 16 FPS` / cửa sổ bị che (`BUG-10`). |
| 8 | **Gameplay Stability** | **94 / 100** | 0 crash, 0 unhandled exception, 0 WebGL context loss qua toàn bộ bài test tải nặng, spam click, F5 giữa chừng và 190 ván dài. |
| 9 | **Gameplay UX** | **79 / 100** | Giao diện trực quan, phản hồi âm thanh/3D sống động; trừ điểm vì đồng hồ Offline chạy chậm 28.3% (`BUG-03`), lỗi từ chối cú bấm đầu ở Đảo Hoang do `selectedDiceChoice` cũ (`BUG-11`), khóa nút 6s khi lệch phase (`BUG-06`) và thông báo AFK sớm (`BUG-01`). |
| 10 | **Test Coverage** | **84 / 100** | Bộ 84 unit tests + 41 Playwright E2E sẵn có rất chất lượng; chỉ để lọt một số kịch bản thời gian thực, thứ tự ghế rỗng 2v2, hàng đợi offline, Tactical Dice Online và FPS thấp vừa được bổ sung trong đợt kiểm toán này. |
| — | **Điểm Trung Bình Toàn Diện** | **85.0 / 100** | Nền tảng kỹ thuật vững chắc, sẵn sàng hoàn thiện nhanh để phát hành chính thức. |

---

## 4. Danh mục Tài liệu Bàn giao trong `docs/gameplay-audit/`

1. [`GAMEPLAY-AUDIT-REPORT.md`](./GAMEPLAY-AUDIT-REPORT.md) — Báo cáo kiểm toán gốc (Baseline `515feab`) làm mốc đối chiếu Before/After.
2. [`BUSINESS-TOUR-RULES-COMPARISON.md`](./BUSINESS-TOUR-RULES-COMPARISON.md) — Đối chiếu chi tiết toàn bộ cơ chế Core & Special Tiles theo 5 nhóm phân loại chuẩn (bảo toàn 100% luật `CUSTOM`).
3. [`GAMEPLAY-FLOW.md`](./GAMEPLAY-FLOW.md) — Sơ đồ vòng đời trận đấu, máy trạng thái 12 pha trong lượt + `GAME_OVER`, kiến trúc Offline vs Online và cơ chế đồng bộ 3D.
4. [`BUG-LIST.md`](./BUG-LIST.md) — Danh sách 11 lỗi với mức độ cập nhật và trạng thái `11/11 FIXED & VERIFIED`.
5. [`TEST-MATRIX.md`](./TEST-MATRIX.md) — Ma trận kiểm thử toàn diện đã cập nhật kết quả chạy mới hậu sửa lỗi.
6. [`FIX-IMPLEMENTATION-PLAN.md`](./FIX-IMPLEMENTATION-PLAN.md) — Kế hoạch triển khai 3 Wave và ghi chú điều chỉnh kỹ thuật thực tế.
7. [`BUG-FIX-REPORT.md`](./BUG-FIX-REPORT.md) — Báo cáo kỹ thuật chi tiết cho từng bản vá trong 11/11 lỗi + Audit Hardening & Independent Review Round 2.
8. [`REGRESSION-TEST-REPORT.md`](./REGRESSION-TEST-REPORT.md) — Kết quả chạy hồi quy mới (106 unit/sim tests, 45 headed E2E, 190 seeded simulations, probes & live Chrome checks).
9. [`PERFORMANCE-COMPARISON.md`](./PERFORMANCE-COMPARISON.md) — So sánh hiệu năng Before/After tại `60/30/15/5/2.5 FPS`, tab ẩn, Pause/Resume, Graphics Quality & đồng hồ Offline.
10. [`FINAL-GAMEPLAY-AUDIT.md`](./FINAL-GAMEPLAY-AUDIT.md) — Báo cáo kiểm chứng cuối cùng (adversarial diff audit + bảng điểm Before/After 10 hạng mục).
11. [`RELEASE-READINESS-CHECKLIST.md`](./RELEASE-READINESS-CHECKLIST.md) — Bảng kiểm nghiệm thu tiêu chí phát hành & mức độ sẵn sàng nâng cấp Animation 3D.
12. [`PROGRESS-LEDGER.md`](./PROGRESS-LEDGER.md) — Sổ theo dõi tiến độ toàn bộ 3 Wave, Audit Hardening, Independent Review Round 2 và kết quả cổng kiểm thử.
