# ANIMATION DESIGN SPECIFICATION — Ngôn Ngữ Chuyển Động & Thiết Kế 7 Phân Hệ 3D

- **Ngày lập:** 2026-11-24 · **Nhánh:** `feature/3d-animation-overhaul` (Baseline `68c8d50`)
- **Tham chiếu thiết kế:** *Business Tour* (nhịp độ gọn gàng, đọc bàn cờ rõ tức thì), *Monopoly Plus* (chuyển động nhân vật có cá tính, xây dựng công trình có tầng lớp) & *Monopoly Madness* (lực va chạm, squash & stretch giàu năng lượng), đồng bộ hoàn toàn với **bản sắc Việt Nam** và thẩm mỹ **Low-Poly Isometric** sáng rõ.

---

## 1. Tuyên Ngôn Nghệ Thuật Chuyển Động (Motion Language)

1. **Nguyên tắc 3 Nhịp ("Nén → Bung → Dư âm"):** Mọi chuyển động gameplay trọng tâm đều có *Anticipation* ngắn (`60–110ms`) để mắt người chơi kịp bắt điểm nhìn, pha *Action* sắc nét (`back.out` / `power3.out` / parabol trọng lực), và *Follow-through* nhẹ (`80–140ms`) để vật thể mang trọng lượng vật lý thay vì dừng khựng như robot.
2. **Độ Rõ Gameplay Là Tối Thượng (Gameplay Readability First):** Không hiệu ứng nào được che khuất tên thành phố, nhãn giá tiền thuê hay khiến người chơi Online phải đợi lâu hơn nhịp chờ đã khóa của server (`1450ms` xúc xắc, `computeTokenHopTiming` + `220ms`).
3. **Thống Nhất Tỷ Lệ Tốc Độ (`1×` / `2×`):** Mọi timeline thị giác đều nhân thời gian tiến qua `visualAnimDt * speedMultiplier` (trừ rung chấn Động Đất giữ nguyên biên độ an toàn và tắt hẳn khi bật `prefers-reduced-motion`).

---

## 2. Phân Hệ A — Character Animation (`ANIM-CHAR-01..12`)

### 2.1 Đánh Giá Lựa Chọn: Blender Rigged `.glb` vs Procedural Three.js
| Tiêu chí so sánh | Procedural Three.js thuần | **Blender 4.5 Rigged `.glb` (`AnimationMixer`) + GSAP (Đã chọn — D1)** |
|---|---|---|
| **Biểu cảm & cá tính 4 Tỷ Phú Việt Nam** | Hạn chế ở xoay/scale cả nhóm; khó tạo dáng vung tay, cúi người lấy đà hay gục đầu phá sản tự nhiên | Tự do tạo keyframe NLA mượt mà (nhún vai ăn mừng, ngó quanh trong Đảo Hoang, nhún đà nhảy, múa chiến thắng) cho cả 4 nhân vật |
| **Chi phí GPU trên iGPU** | Nhẹ nếu ít mesh, nhưng tách 12 khớp bằng tay trong JS tốn thêm nhiều draw calls riêng lẻ | Gộp mỗi nhân vật thành **1 `SkinnedMesh` (hoặc rigid-bone parented `<= 12` bones)** chỉ tốn **`3–4` draw calls** & **`<= 1.800` tris/nhân vật**, nhẹ ngang mesh tĩnh |
| **Khả năng đồng bộ tốc độ `1× / 2×` & Pause** | Tự tính toán lại mọi công thức `sin/lerp` | `THREE.AnimationMixer` hỗ trợ `crossFadeTo`, `setEffectiveTimeScale`, `clampWhenFinished` và tiến thời gian chính xác bằng `mixer.update(visualAnimDt * speed)` |
| **Rủi ro tải asset** | Không có | Khắc phục hoàn toàn bằng cách giữ `createPlayerTokenMesh` làm **fallback tức thì trong frame 0**, tráo sang `.glb` ngay khi tải xong không làm khựng trận |

### 2.2 Kịch Bản Chuyển Động Chi Tiết Cho 4 Quân Cờ
- **`ANIM-CHAR-01` Idle & Breathing:** Nhân vật hít thở nhẹ (lồng ngực giãn `±2%`, đầu nhìn nhẹ về phía trước + chao bệ phương tiện ở `Medium/High`). Đóng băng hoàn toàn khi `quality === 'low'` để giữ nguyên `0 FPS` idle.
- **`ANIM-CHAR-02` Anticipation Trước Khi Đi (`90ms`):** Hạ trọng tâm (`scaleY: 0.86`, `scaleXZ: 1.09`), khuỵu nhẹ chân/đế phương tiện ngay khi xúc xắc vừa chạm kết quả, hướng mũi bệ về ô kế tiếp.
- **`ANIM-CHAR-03/04/05/06` Hop Theo Từng Ô, Xoay Hướng, Cua Góc & Tiếp Đất:**
  - Mỗi bước `stepDurationSec` (theo `computeTokenHopTiming`) gồm: *Takeoff* (`0–18%`, vươn dài `scaleY: 1.16`), *Airborne* (`18–78%`, quỹ đạo parabol cao `0.92` đơn vị, vung tay/chồm người hướng tiến), và *Landing* (`78–100%`, nén `scaleY: 0.84` rồi nảy đàn hồi về `1.0` + vòng bụi trắng nhỏ tại đế).
  - **`ANIM-CHAR-04` Yaw Alignment:** Quân cờ tự động xoay trục `Y` hướng mặt theo vector `(nextTile - currentTile)` qua đường ngắn nhất (`atan2(dx, dz)`), thay thế hoàn toàn góc cứng `Math.PI / 4` trước đây. Khi hoàn tất bước cuối cùng và đứng nghỉ trên ô, từ từ xoay nghiêng nhẹ `45°` hướng ra camera isometric để người chơi nhìn rõ mặt nhân vật.
  - **`ANIM-CHAR-05` Corner Banking:** Khi bước qua 4 ô góc (`0, 8, 16, 24`), thân nhân vật nghiêng vào tâm cua `roll = ±0.18 rad` trong `180ms` tạo cảm giác chuyển hướng mượt mà.
- **Biểu Cảm Phản Ứng Sự Kiện (`ANIM-CHAR-07..12`):**
  - **Nhận tiền (`ANIM-CHAR-07`, `650ms`):** Nhảy bật nhẹ 1 nhịp + vung 2 tay lên cao (đồng bộ `PlayerAvatar3D` mood `'celebrating'`).
  - **Trả tiền thuê/thuế (`ANIM-CHAR-08`, `600ms`):** Rụt vai, lắc nhẹ đầu, đổ người ra sau (đồng bộ mood `'stressed'`).
  - **Mua/Nâng cấp thành công (`ANIM-CHAR-10`, `550ms`):** Gật đầu tự hào + vung phụ kiện tay (`prop_R`).
  - **Ở trong Đảo Hoang (`ANIM-CHAR-09`):** Co cụm vai, đầu đảo trái-phải ngó quanh dưới vòng song tre 3D (đồng bộ mood `'jailed'`).
  - **Chiến thắng (`ANIM-CHAR-11`, lặp trên bục):** Điệu nhảy vung tay ăn mừng trên `trophy_podium.glb`.
  - **Phá sản (`ANIM-CHAR-12`, `900ms`):** Cúi gục người xuống thấp, bệ phương tiện tắt đèn và mờ dần trước khi ẩn (`bankrupt = true`).

---

## 3. Phân Hệ B — Dice Animation (`ANIM-DICE-01..07`)

> **Bất biến gameplay:** Kết quả `(die1, die2)` luôn do engine Offline hoặc Server Online chốt trước; `simulateDeterministicDiceRoll` (`cannon-es` + `Q_remap`) giữ nguyên 100% vị trí và mặt ngửa.

1. **`ANIM-DICE-01` Pre-Roll Anticipation (`140ms` trước frame tung hoặc nối đầu quỹ đạo):** Ở Offline, hai viên xúc xắc từ vị trí nghỉ nhấc bổng lên `y + 1.4` và xoay xoáy ngược hướng nhau nhẹ (`SFX: playDiceRoll()`), tạo đà rồi phóng vào quỹ đạo va chạm `cannon-es`. (Ở Online, gộp gọn trong cửa sổ `1450ms` không làm trễ `MOVING_TOKEN`).
2. **`ANIM-DICE-02/03` Va Chạm & Tia Lửa Nhỏ (`cannon-es` + `collisionTimes`):** Giữ nguyên quỹ đạo vật lý `cannon-es` (`165` bước @ `90 Hz`) kèm `soundEngine.playPhysicsDiceHit(intensity)` tại mỗi mốc `collisionTimes`; khi cường độ va chạm `> 0.55` trên mức `Medium/High`, bắn `4–6` tia sáng nhỏ tại điểm chạm.
3. **`ANIM-DICE-04/05` Landing Impact & Result Callout (`320ms`):** Khi `t = 1.0`, vẽ vòng sáng phẳng mở rộng dưới mặt cỏ quanh 2 viên xúc xắc (`scale 0.4 → 1.7`, `opacity 0.7 → 0`) và nhấp nhẹ viền sáng trên mặt ngửa.
4. **`ANIM-DICE-06` Doubles Shockwave (`ĐÔI!`):** Khi `die1 === die2` (và không ở lượt khóa đôi cuối), phóng vòng sóng vàng kim lớn lan tỏa trên sân cỏ trung tâm + tia vàng + hợp âm `playDoublesBurst()` (mới).
5. **`ANIM-DICE-07` Tactical Dice Visuals:** Khi người chơi chọn xúc xắc chiến thuật `Chẵn` (ánh ngọc lam `#0EA5E9`) hoặc `Lẻ` (ánh tím `#A855F7`), phủ vòng sáng màu tương ứng quanh xúc xắc trong pha chuẩn bị & chạm đất; khi bấm `Đổ lại` (`REROLL_DICE`), chạy hiệu ứng kéo nhanh xúc xắc về tâm xoáy `180ms` trước lần tung mới.

---

## 4. Phân Hệ C — Building & Property Animation (`ANIM-BLD-01..11`)

1. **`ANIM-BLD-01` Mua Đất (`420ms`):** Đệm nền ô (`padMesh`) bung rộng từ tâm (`0.1 → 1.0`, `back.out(1.7)`), sau đó nhà nhỏ khởi đầu (`starterPavilion`) đóng xuống từ trên cao (`y + 0.8 → 0`, `bounce.out` / `power3.in` + nảy nhẹ) kèm hạt màu chủ sở hữu và `playBuyProperty()`.
2. **`ANIM-BLD-02/03` Xây Nhà Từng Cấp & Nâng Cấp (`380–520ms`):** Thay vì phóng to đồng loạt cùng 1 khung, các nhà `Lv1..Lv3` xuất hiện **lệch pha nhau `85ms`** (`stagger: 0.085`), mỗi nhà nảy squash & stretch (`scaleY 1.3 → 0.88 → 1.0`) kèm khói bụi trắng tại chân móng và huy hiệu cấp nhà (`levelBadgeMesh`) bật pop ở cuối chuỗi.
3. **`ANIM-BLD-04` Landmark ★ (`Lv4`) Staged Reveal (`780ms`):**
   - Tầng 1: Các nhà cũ thu nhỏ tụ về tâm (`140ms`).
   - Tầng 2: Thân Khách sạn/Biểu tượng vùng (`heritage` cổ điển / `coastal` nghỉ dưỡng / `metropolis` tháp kính) mọc lên kèm vòng sáng kim loại quanh chân đế (`380ms`).
   - Tầng 3: Ngôi sao/ngọn hải đăng đỉnh tỏa chùm tia vàng (`High`) + `playLandmarkReveal()`, sau đó camera quay êm về góc toàn bàn.
4. **`ANIM-BLD-05` Buyout `2×` Takeover (`540ms`):** Vòng sóng năng lượng màu của chủ mới quét ngang qua mặt đế ô đất, chuyển màu mái & mặt tiền công trình từ màu chủ cũ sang màu chủ mới, kèm cú nhấc-đóng lại nhẹ (`scaleY: 1.0 → 1.15 → 1.0`) để người xem nhận biết tức thì thành phố vừa đổi chủ.
5. **`ANIM-BLD-06` Bán Nhà Trả Nợ (`360ms`):** Công trình thu nhỏ chìm xuống mặt đất kèm tia đồng xu bay về khay người bán / chủ nợ, xóa sạch hào quang sở hữu.
6. **`ANIM-BLD-07` Động Đất (`ch-13`, `680ms`):** Rung ngang lệch pha trên khối công trình bị nhắm trúng (`x ± 0.09` tắt dần), hạt gạch/khói nâu rơi xuống, rồi cấp công trình hạ xuống 1 bậc (hoặc san phẳng hoàn toàn nếu ở Lv0) kèm `playEarthquakeImpact()`.
7. **`ANIM-BLD-08` Mất Điện (`ch-14`, `550ms`):** Tia sét xanh tím lóe sáng (`2` xung ngắn `90ms`), tắt phụt đèn cửa sổ & chuyển thẻ giá ngoài sang xám tối (`#475569`) kèm `playPowerOutageZap()`.
8. **`ANIM-BLD-09` Khiên Bảo Hộ (`ch-15`, `480ms`):**
   - *Khi dựng Khiên:* Vòng khiên nổi từ mặt đất, khóa xoay trên đỉnh công trình với vòm bán cầu xanh ngọc mờ.
   - *Khi chặn Động Đất / Mất Điện (`blockedByShield: true`):* Đòn tấn công chạm vào vòm khiên gây lóe sáng xanh cyan, vòm khiên nứt tách thành `6–8` mảnh đa giác mờ tan biến trong `420ms` (`playShieldBlock()`) — truyền đạt trực quan tại sao thành phố không bị hạ cấp!
9. **`ANIM-BLD-10/11` Cúp Quốc Gia & Sóng Độc Quyền:** Khi đặt Cúp, vòng sáng vàng từ trên rơi xuống đỉnh công trình + chùm đèn sân vận động quét vào ô đó (`620ms`). Khi hoàn tất một nhóm màu (`ownsFullColorGroup`), tất cả 2–3 ô trong cụm đồng loạt nhấp sóng sáng nối tiếp nhau (`stagger: 90ms`) chạy dọc theo màu nhóm để báo hiệu tiền thuê đã nhân đôi `×2`.

---

## 5. Phân Hệ D — Treasury & Economy Effects (`ANIM-ECON-01..08`)

> **Bất biến kinh tế:** Mọi hoạt ảnh tiếp tục chỉ đọc chênh lệch giữa hai snapshot tiền mặt (`detectCashFlowTransfers`), tuyệt đối không tự sửa `player.cash`.

- **Cải tiến `ANIM-ECON-01..05` (Luồng tiền bay):**
  - Phân biệt rõ bằng quỹ đạo và tốc độ: tiền thuê/mua đứt bay vòng cung cao ngang qua bàn cờ; lương Start `+300K` tạo dải ruy-băng vàng ròng vươn từ Ngân hàng trung tâm; tiền Thuế `-10%` hút xoáy từ khay người nộp về ô `30` / Ngân hàng; chia cổ tức / hoàn bán nhà kèm ánh xanh ngọc.
- **`ANIM-ECON-06/07` 3D Vault Restack & HUD Sync:** Các cọc tiền/xu mới đáp xuống khay làm cọc tiền bật nhẹ (`recoilOffset`) đồng bộ với hiệu ứng nảy số trên thẻ `AnimatedCashPill` của `PlayerHUD`.
- **`ANIM-ECON-08` Thiếu Tiền & Phá Sản:** Khi người chơi vào `DEBT_RESOLUTION`, viền khay tiền 3D nhấp xung đỏ san hô nhẹ; khi xác nhận phá sản, toàn bộ cọc tiền còn lại trên khay bay hút hết về chủ nợ / Ngân hàng trong `550ms`, để lại khay trống rỗng tối màu.

---

## 6. Phân Hệ E — Cinematic Camera System (`ANIM-CAM-01..09`)

*Đặc tả toán học & state machine chi tiết nằm tại [`CAMERA-DIRECTOR-SPEC.md`](./CAMERA-DIRECTOR-SPEC.md).*
- Bật mặc định theo chế độ **Non-Blocking Smart Framing**, chạy mượt trên Critically-Damped Spring bằng `visualAnimDt`, nhường quyền ngay lập tức nếu người chơi xoay/zoom chuột, không bao giờ chặn UI hay làm chậm nhịp Online.

---

## 7. Phân Hệ F — Special Events & Environment (`ANIM-EVT-01..09`)

1. **`ANIM-EVT-01` Đảo Hoang (`Tile 8`):** Khi có người bị lưu đày vào Đảo (`ch-7`, 3 đôi, hoặc dẫm ô 8), 4 cọc tre/song chắn mờ nhô lên bao quanh vị trí quân cờ đang bị giam (`280ms`), hạ xuống ngay khi thoát đảo (kèm burst nước biển xanh khi thoát thành công ở lần thử 3 hoặc đổ đôi).
2. **`ANIM-EVT-02` Du Lịch Xuyên Việt (`World Tour`):** Mô hình máy bay nhỏ tại ô góc `24` rồ cánh quay vòng, quân cờ cất cánh theo cung parabol cao vọt ngang qua không trung bàn cờ (`1.2–1.6s`) để đáp thẳng xuống ô đích (giữ nguyên cộng `+300K` đúng khoảnh khắc đường bay cắt ngang qua Start `onStep`!).
3. **`ANIM-EVT-03` Cơ Hội (`Chance Card`):** Khi dẫm vào ô `12 / 20 / 28`, lá bài trên cùng của chồng bài `?` tại sân giữa bật vọt lên, xoay lật `180°` sáng viền vàng trong `340ms` trước/song song lúc mở `LuckCardModal` (`ANIM-UI-01`).
4. **`ANIM-EVT-04/05/06` Cúp Quốc Gia, Lễ Hội & Ngưỡng Thắng:** Ô giữ Cúp có vòng hào quang xoay chậm trên đỉnh; các ô Lễ Hội có cặp đèn lồng vàng-đỏ nhấp nhô nhẹ ở mức `Medium/High`; khi một người chơi đạt ngưỡng `2/3` nhóm màu hoặc `3/4` Resort, một xung sáng cảnh báo nhẹ quét qua bộ ô còn thiếu giúp tăng kịch tính chiến thuật.
5. **`ANIM-EVT-07/08` Ngày ↔ Đêm & Môi Trường:** Giữ nội suy `skyDomeUniforms`, đèn đường & ánh trăng êm mượt; làm mượt chuyển động quay cối xay/hải đăng/máy bay ở 4 ô góc (`cornerAnims`) và giữ nguyên khoảng không gian ngoài bàn cờ sạch sẽ (không thêm rác 3D ngoài bàn).
6. **`ANIM-EVT-09` Đồng Bộ `PlayerAvatar3D`:** Kích hoạt trực tiếp xung biểu cảm (`celebrating`, `stressed`, `jailed`, `bankrupt`) khớp thời điểm hạt tiền hoặc sự kiện 3D chạm đích.

---

## 8. Phân Hệ G — Endgame Animation (`ANIM-END-01..06`)

1. **`ANIM-END-01` Victory Reveal (`450ms`):** Dừng mọi hiệu ứng phụ không liên quan, quét dải ánh sáng hội tụ về trung tâm sân cỏ (`High/Medium`) kèm hồi kèn `playVictoryFanfare()`.
2. **`ANIM-END-02` Bục Vinh Quang & Cúp Vàng (`trophy_podium.glb`):** Bục 3D mọc lên ở giữa sân cỏ trung tâm; ở chế độ **FFA**, nhân vật thắng đứng bậc cao nhất cùng Cúp Vàng lơ lửng phía trên thực hiện `victory_dance`; ở chế độ **`TEAMS_2V2`**, cả **2 đồng đội cùng đứng trên bục vinh danh**!
3. **`ANIM-END-03/04` Phá Sản & Phản Ứng Thua Cuộc:** Người thua cuộc ở góc bàn thực hiện động tác cúi chào/thở dài (`defeat_slump`); nếu thắng nhờ `LAST_STANDING`, chuỗi phá sản cuối cùng hoàn tất mượt rồi nối thẳng vào bục vinh quang.
4. **`ANIM-END-05` Pooled Confetti (`InstancedMesh`):** Phóng `60` mảnh (`Medium`) hoặc `140` mảnh (`High`) giấy màu lấp lánh từ trên cao xoay rơi theo lực cản không khí (dùng chung 1 `InstancedMesh` cấp phát sẵn, tái sử dụng 100%, tắt ở `Low` & `Reduced Motion`).
5. **`ANIM-END-06` Camera Handoff Sang `VictoryModal`:** `CameraDirector` hạ góc nhìn xuống tầm thấp nhìn chéo qua bục chiến thắng trong `900ms`, đồng thời `VictoryModal` hiển thị bảng xếp hạng tổng kết (`screenState = 'gameover'`) mà không làm thay đổi thứ hạng hay số liệu Net Worth.
