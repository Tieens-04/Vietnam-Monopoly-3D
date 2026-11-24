# ANIMATION INVENTORY — Danh Mục Tra Cứu Toàn Bộ 66 Hạng Mục Chuyển Động

- **Quy chuẩn mã:** `ANIM-<NHÓM>-<STT>`. Toàn bộ 8 nhóm tài liệu thiết kế và 8 Wave triển khai dùng chung duy nhất danh mục này.
- **Ký hiệu công nghệ:**
  - `GLB+Mixer`: Model rig xương từ Blender 4.5.16 LTS chạy qua `THREE.AnimationMixer` (kèm fallback procedural tức thì).
  - `GSAP+Three`: `gsap.timeline({ paused: true })` đẩy thủ công theo `visualAnimDt * speedMultiplier`.
  - `Cannon+GSAP`: Mô phỏng `cannon-es` + `Q_remap` kết hợp trang trí GSAP.
  - `Instanced+Shader`: `THREE.InstancedMesh` + GLSL Shader (Zero-GC).
  - `UI Motion/CSS`: CSS transitions / `motion` cho lớp giao diện 2D, tôn trọng `prefers-reduced-motion`.

---

## 1. Nhân Vật Bàn Cờ (`ANIM-CHAR-01` .. `ANIM-CHAR-12`)

| Mã ID | Tên Animation | Trigger Gameplay | Công nghệ | Thời lượng `1×` / `2×` | Easing / Clip | SFX (`soundEngine.ts`) | Low / Medium / High | Reduced Motion | Khớp Online |
|---|---|---|---|---|---|---|---|---|---|
| `ANIM-CHAR-01` | Idle & Breathing | Đang đứng trên ô chờ lượt | `GLB+Mixer` | Lặp `2.4s` / `2.4s` | `idle_loop` (sin mượt) | Không | **Low: Đóng băng `0 FPS`** · Med: `20 FPS` · High: `60 FPS` | Giữ yên (không nhún) | Non-blocking |
| `ANIM-CHAR-02` | Move Anticipation Crouch | Chuẩn bị bước đầu tiên sau khi đổ | `GLB+Mixer` + `GSAP+Three` | `90ms` / `50ms` | `anticipation` (`power2.in`) | Không | Cả 3 mức chạy đủ | Thu gọn còn `40ms` scale | Gộp đầu bước 0 |
| `ANIM-CHAR-03` | Tile-by-Tile Hop | Mỗi bước di chuyển trong `tilePath` | `GLB+Mixer` + `gameplayAnimDt` | `300ms` (hoặc capped) / `160ms` | `hop_takeoff` → `hop_airborne` → `hop_land` | `playTokenHop(step)` | Cả 3 mức chạy đủ (xoay hướng + vung tay) | Giảm độ cao nhảy `-40%` | Khớp `computeTokenHopTiming` |
| `ANIM-CHAR-04` | Travel-Direction Yaw | Hướng mặt nhân vật theo chiều đi | `GSAP+Three` | `120ms` / `65ms` | `power2.out` | Không | Cả 3 mức chạy đủ | Xoay mượt không nghiêng | Song song bước nhảy |
| `ANIM-CHAR-05` | 90° Corner Bank & Pivot | Bước qua ô góc `0, 8, 16, 24` | `GLB+Mixer` + `GSAP+Three` | `180ms` / `95ms` | `corner_bank` (`sine.inOut`) | Không | Low: xoay phẳng · Med/High: nghiêng thân `±0.18 rad` | Tắt nghiêng thân | Song song bước nhảy |
| `ANIM-CHAR-06` | Landing Squash & Stretch | Chạm mặt ô ở bước cuối | `GSAP+Three` | `160ms` / `90ms` | `elastic.out(1, 0.55)` | Nhẹ khi đáp | Low: scale đơn giản · Med/High: + vòng bụi 3D | Giảm biên độ scale `±5%` | Chạy trong `220ms` pad |
| `ANIM-CHAR-07` | Cash Gain Joy | Nhận tiền thuê / Lương Start / Cổ tức | `GLB+Mixer` | `650ms` / `340ms` | `celebrate_short` | `playCashGain()` | Cả 3 mức chạy đủ (`onEnd` ngủ lại ở Low) | Giữ vẫy tay ngắn | Non-blocking cue |
| `ANIM-CHAR-08` | Pay Rent / Tax Slump | Trả tiền thuê / Đóng thuế / Phạt | `GLB+Mixer` | `600ms` / `320ms` | `stressed_slump` | `playCashPay()` | Cả 3 mức chạy đủ | Giữ cúi đầu ngắn | Non-blocking cue |
| `ANIM-CHAR-09` | Lost Island Trapped | `player.inJail === true` tại ô 8 | `GLB+Mixer` | Lặp `2.0s` / `2.0s` | `jailed_loop` | `playJailAlert()` lúc vào | Low: pose tĩnh khi đứng chờ · Med/High: lặp chậm | Pose tĩnh | Đồng bộ theo snapshot |
| `ANIM-CHAR-10` | Buy / Upgrade Gesture | Mua đất / Xây nhà thành công | `GLB+Mixer` | `550ms` / `290ms` | `proud_gesture` | `playBuyProperty()` | Cả 3 mức chạy đủ | Gật đầu nhẹ | Non-blocking cue |
| `ANIM-CHAR-11` | Match Victory Celebration | Thắng trận trên bục vinh danh | `GLB+Mixer` | Lặp `2.2s` / `2.2s` | `victory_dance` | `playVictoryFanfare()` | Cả 3 mức chạy đủ | Pose ăn mừng tĩnh | Chạy ở `GAME_OVER` |
| `ANIM-CHAR-12` | Bankruptcy Defeat Slump | `player.bankrupt === true` | `GLB+Mixer` + `GSAP+Three` | `900ms` / `500ms` | `defeat_slump` (`power3.in`) | `playBankruptSlump()` *(mới)* | Cả 3 mức chạy đủ trước khi ẩn | Mờ dần `300ms` | Non-blocking cue |

---

## 2. Xúc Xắc Vật Lý (`ANIM-DICE-01` .. `ANIM-DICE-07`)

| Mã ID | Tên Animation | Trigger Gameplay | Công nghệ | Thời lượng `1×` / `2×` | Easing / Curve | SFX | Low / Medium / High | Reduced Motion | Khớp Online |
|---|---|---|---|---|---|---|---|---|---|
| `ANIM-DICE-01` | Pre-Roll Anticipation | Bắt đầu `animateDiceRoll` | `GSAP+Three` | `140ms` / `75ms` | `back.in(1.4)` | `playDiceRoll()` | Cả 3 mức | Nâng nhẹ tại chỗ `60ms` | Gộp trong `1450ms` |
| `ANIM-DICE-02` | `cannon-es` Tumble | Pha lăn va chạm chính | `Cannon+GSAP` | `~1.30–1.38s` / `0.68s` | Physics `90 Hz` + `Q_remap` | `playPhysicsDiceHit()` | Cả 3 mức (tắt bóng ở Low) | Giữ nguyên mặt đáp chuẩn | Khớp `< 1450ms` server |
| `ANIM-DICE-03` | Collision Micro-Sparks | Tại `collisionTimes` cường độ `> 0.55` | `Instanced+Shader` | `220ms` / `140ms` | Linear fade + gravity | Đính kèm `ANIM-DICE-02` | Low: Tắt · Med: `4` hạt · High: `8` hạt | Tắt tia lửa | Song song `ANIM-DICE-02` |
| `ANIM-DICE-04` | Final Settle Impact Ring | Frame cuối `t = 1.0` | `GSAP+Three` | `320ms` / `180ms` | `power2.out` | Nhẹ tại `t=1` | Low: 1 vòng mờ · Med/High: vòng sắc nét | Tắt sóng lan | Chạy trong phần dư `1450ms` |
| `ANIM-DICE-05` | Result Callout Highlight | Kết thúc lăn xúc xắc | `GSAP+Three` | `350ms` / `200ms` | `power1.out` | Không | Cả 3 mức | Giữ viền sáng | Hiển thị trước bước nhảy |
| `ANIM-DICE-06` | Doubles Golden Shockwave | `die1 === die2` (không khóa đôi) | `GSAP+Three` + `Instanced` | `520ms` / `280ms` | `expo.out` | `playDoublesBurst()` *(mới)* | Low: vòng vàng · Med/High: vòng + `12` tia vàng | Tắt tia hạt | Non-blocking |
| `ANIM-DICE-07` | Tactical Dice Tint/Rewind | Chọn `EVEN`/`ODD` hoặc `REROLL_DICE` | `GSAP+Three` | `220ms` / `120ms` | `power2.inOut` | `playTacticalRollCue()` *(mới)* | Cả 3 mức | Chỉ đổi màu viền | Khớp pha `REROLL_DECISION` |

---

## 3. Công Trình & Bất Động Sản (`ANIM-BLD-01` .. `ANIM-BLD-11`)

| Mã ID | Tên Animation | Trigger Gameplay | Công nghệ | Thời lượng `1×` / `2×` | Easing / Curve | SFX | Low / Medium / High | Reduced Motion | Khớp Online |
|---|---|---|---|---|---|---|---|---|---|
| `ANIM-BLD-01` | Land Pad Unfurl & Stamp | Mua ô đất trống (`Lv0` / Resort) | `GSAP+Three` | `420ms` / `230ms` | `back.out(1.7)` + `bounce.out` | `playBuyProperty()` | Low: pop gọn · Med/High: 2 nhịp đệm + mái | Fade/scale êm `180ms` | Non-blocking cue |
| `ANIM-BLD-02` | Sequential Houses (`Lv1..3`) | Mua kèm nhà hoặc xây nhiều nhà | `GSAP+Three` | `380–520ms` / `220–280ms` | Stagger `85ms` + `back.out(1.5)` | `playBuildHouse(lvl)` | Low: không bụi · Med/High: + khói chân móng | Không stagger nảy | Non-blocking cue |
| `ANIM-BLD-03` | Upgrade Morph & Badge Pop | Nâng cấp `Lv1→2→3` | `GSAP+Three` | `380ms` / `210ms` | `elastic.out(1, 0.6)` | `playBuildHouse(lvl)` | Cả 3 mức + huy hiệu bật | Scale đơn `150ms` | Non-blocking cue |
| `ANIM-BLD-04` | Landmark ★ (`Lv4`) Reveal | Nâng cấp từ `Lv3 → Lv4` | `GSAP+Three` + `Instanced` | `780ms` / `420ms` | 3 bước (`power3.in` → `back.out(1.4)`) | `playLandmarkReveal()` *(mới)* | Low: không tia · Med/High: vòng kim loại + tia sao | Tắt tia sao | Non-blocking cue |
| `ANIM-BLD-05` | Buyout `2×` Color-Wave | Mua đứt bất động sản đối thủ | `GSAP+Three` | `540ms` / `300ms` | `power2.out` + wave | `playBuyProperty()` | Low: đổi màu + nhấc nhẹ · Med/High: + vòng sóng | Đổi màu êm `200ms` | Non-blocking cue |
| `ANIM-BLD-06` | Liquidation Dismantle | Bán tài sản khi `DEBT_RESOLUTION` | `GSAP+Three` | `360ms` / `200ms` | `power2.in` | `playCashGain()` | Cả 3 mức | Scale hạ `150ms` | Non-blocking cue |
| `ANIM-BLD-07` | Earthquake Collapse (`ch-13`) | Áp dụng thẻ Động Đất (không Khiên) | `GSAP+Three` + `Instanced` | `680ms` / `360ms` | Rung tắt dần + `power3.in` | `playEarthquakeImpact()` *(mới)* | Low: rung nhẹ + hạ cấp · Med/High: + bụi nâu | Chỉ nhấp nháy & hạ cấp | Non-blocking cue |
| `ANIM-BLD-08` | Power Outage Dim (`ch-14`) | Áp dụng thẻ Mất Điện | `GSAP+Three` | `550ms` / `300ms` | 2 xung chập + dim | `playPowerOutageZap()` *(mới)* | Cả 3 mức (tắt đèn & xám thẻ giá) | Chuyển tối êm `200ms` | Non-blocking cue |
| `ANIM-BLD-09` | Protection Shield (`ch-15`) | Dựng Khiên / Khiên vỡ (`blockedByShield`) | `GSAP+Three` | `480ms` / `260ms` | `back.out` / `power3.out` vỡ | `playShieldDeploy()` / `playShieldBlock()` *(mới)* | Low: ẩn hiện vòng · Med/High: vòm cyan + mảnh vỡ | Tắt mảnh vỡ | Non-blocking cue |
| `ANIM-BLD-10` | Championship Trophy Drop | Đặt hoặc dời Cúp Quốc Gia | `GSAP+Three` | `620ms` / `340ms` | `bounce.out` | `playChampionshipFanfare()` *(mới)* | Low: vòng vàng · Med/High: cúp rơi + chùm sáng | Hiện vòng vàng | Non-blocking cue |
| `ANIM-BLD-11` | Monopoly Completion Wave | Hoàn tất bộ màu 2–3 ô | `GSAP+Three` | `540ms` / `300ms` | Stagger `90ms`, `sine.inOut` | `playMonopolyChime()` *(mới)* | Cả 3 mức | Nháy sáng nhẹ đồng loạt | Non-blocking cue |

---

## 4. Kinh Tế & Kho Bạc 3D (`ANIM-ECON-01` .. `ANIM-ECON-08`)

| Mã ID | Tên Animation | Trigger Gameplay | Công nghệ | Thời lượng `1×` / `2×` | Easing / Curve | SFX | Low / Medium / High | Reduced Motion | Khớp Online |
|---|---|---|---|---|---|---|---|---|---|
| `ANIM-ECON-01` | `PLAYER_TO_PLAYER` Stream | Tiền thuê / Buyout / Sinh nhật | `Instanced+Shader` | `850–1100ms` / `550ms` | Quadratic Bezier + bounce | `playCurrencyTransfer()` | Low: tối đa 6 hạt · Med: 10 · High: 14 | Giảm số hạt `50%` | Đọc snapshot delta |
| `ANIM-ECON-02` | `PLAYER_TO_TILE` Arc | Mua đất / Xây nhà / Nâng cấp | `Instanced+Shader` | `780ms` / `450ms` | Bezier + đáp xuống ô | `playCurrencyTransfer()` | Low: 6 hạt · Med/High: 12 | Giảm số hạt `50%` | Đọc snapshot delta |
| `ANIM-ECON-03` | `PLAYER_TO_BANK` Drain | Thuế 10% / Bảo lãnh 200K / Phí WT 50K | `Instanced+Shader` | `820ms` / `480ms` | Bezier hút về Ngân hàng | `playCashPay()` | Cả 3 mức | Giảm số hạt `50%` | Đọc snapshot delta |
| `ANIM-ECON-04` | Start `+300K` Salary Ribbon | Bước qua / Dừng ô Bắt Đầu `0` | `Instanced+Shader` | `880ms` / `500ms` | Bezier vàng từ Ngân hàng | `playCashGain()` | Low: 6 cọc vàng · Med/High: 12 cọc | Tắt hạt phụ | Đọc snapshot delta |
| `ANIM-ECON-05` | Dividend / Sale Refund | Cổ tức `+150K` / Bán nhà trả nợ | `Instanced+Shader` | `820ms` / `460ms` | Bezier về khay người nhận | `playCashGain()` | Cả 3 mức | Giảm số hạt | Đọc snapshot delta |
| `ANIM-ECON-06` | 3D Vault Stack & Recoil | Sau mỗi biến động tiền trên khay | `Instanced+Shader` | `350ms` / `220ms` | Spring damped bounce | Đính kèm bay tiền | Tắt shadow khay ở Low | Tắt rung khay | Khớp 100% số dư |
| `ANIM-ECON-07` | HUD Counter & Delta Pill | Thay đổi `player.cash` trên `PlayerHUD` | `UI Motion/CSS` | `420ms` / `260ms` | `power2.out` | Không | Cả 3 mức | Nhảy số tức thì | Đồng bộ 4 client |
| `ANIM-ECON-08` | Debt Pulse & Vault Empty | `DEBT_RESOLUTION` / `bankrupt = true` | `GSAP+Three` + `UI` | Lặp `1.2s` / `550ms` rút cạn | `sine.inOut` / `power2.in` | `playCashPay()` | Cả 3 mức | Không nhấp nháy | Non-blocking |

---

## 5. Đạo Diễn Camera (`ANIM-CAM-01` .. `ANIM-CAM-09`)

| Mã ID | Tên Shot Camera | Trigger | Công nghệ | Thời lượng chuyển | Thuật toán | SFX | Low / Medium / High | Reduced Motion | Khớp Online |
|---|---|---|---|---|---|---|---|---|---|
| `ANIM-CAM-01` | Safe Isometric Overview | Mới vào ván / Reset / Tắt Camera động | `GSAP+Three` | `650ms` | Critically-Damped Spring (`λ=4.0`) | Không | Cả 3 mức | Trượt nhanh `250ms` | Non-blocking |
| `ANIM-CAM-02` | Turn-Start Active Focus | Đầu lượt mới (trừ khi user đang Orbit) | `GSAP+Three` | `550ms` | Spring (`λ=3.8`) lệch `58%` | Không | Low: giữ Overview · Med/High: bật | Tắt tự đẩy góc nhìn | Non-blocking |
| `ANIM-CAM-03` | Dice Courtyard Framing | Trong pha `ROLLING_DICE` | `GSAP+Three` | `500ms` | Spring (`λ=4.8`) vào sân giữa | Không | Low: giữ Overview · Med/High: zoom nhẹ | Giữ Overview | Non-blocking |
| `ANIM-CAM-04` | Token Lead-Follow | Trong `animateTokenPath` (`MOVING_TOKEN`) | `GSAP+Three` | Theo hành trình | Spring (`λ=5.4`) + lead vector hướng đi | Không | Low: giữ Overview · Med/High: bám mượt | Giữ Overview | Non-blocking |
| `ANIM-CAM-05` | Transaction Framing | Mua đất / Mua đứt trên ô đích | `GSAP+Three` | `480ms` | Spring (`λ=4.2`) hướng về ô đất | Không | Low: tắt · Med/High: bám nhẹ | Tắt | Không che modal |
| `ANIM-CAM-06` | Landmark ★ Hero Angle | Nâng cấp công trình lên cấp `4` | `GSAP+Three` | `720ms` | Spring (`λ=4.6`) góc thấp `18°` | Không | Low: tắt · Med/High: zoom nhẹ | Tắt | Non-blocking cue |
| `ANIM-CAM-07` | Special Event Focus | Động Đất / Mất Điện / Cúp / World Tour | `GSAP+Three` | `560ms` | Spring + micro-shake `<= 0.07` (chỉ Quake) | Không | Low: tắt · Med/High: bật (tắt shake ở Low) | Tắt hoàn toàn shake/zoom | Non-blocking cue |
| `ANIM-CAM-08` | Victory Podium Orbit | Vào `GAME_OVER` | `GSAP+Three` | `900ms` | Quỹ đạo chậm về bục giữa sân | Không | Cả 3 mức (Low trượt thẳng) | Cắt êm `300ms` | Đồng bộ khi `GAME_OVER` |
| `ANIM-CAM-09` | OrbitControls Yield & Recovery | User kéo chuột / chạm xoay bất kỳ lúc nào | `Three Controls` | Tức thì `0ms` | Ngắt `CameraDirector` ngay lập tức | Không | Cả 3 mức | Như bình thường | Ưu tiên người dùng |

---

## 6. Sự Kiện Đặc Biệt & Môi Trường (`ANIM-EVT-01` .. `ANIM-EVT-09`)

| Mã ID | Tên Animation | Trigger | Công nghệ | Thời lượng `1×` / `2×` | Easing / Curve | SFX | Low / Medium / High | Reduced Motion | Khớp Online |
|---|---|---|---|---|---|---|---|---|---|
| `ANIM-EVT-01` | Lost Island Bars & Splash | Vào/Ra khỏi Đảo Hoang (`tile 8`) | `GSAP+Three` | `320ms` / `180ms` | `back.out` / `power2.in` | `playJailAlert()` | Cả 3 mức | Fade nhanh | Đồng bộ `inJail` |
| `ANIM-EVT-02` | World Tour 3D Flight | Chuyến bay từ ô `24` tới ô đích | `GSAP+Three` + `GLB` | `computeTokenHopTiming` | Parabol cao `2.4` + vệt mây sáng | `playWorldTourTakeoff()` *(mới)* | Low: không vệt · Med/High: vệt sáng bay | Bay thẳng thấp `350ms` | Khớp đường bay `TOKEN_MOVED` |
| `ANIM-EVT-03` | Chance Card 3D Deck Flip | Dẫm ô Cơ Hội `12 / 20 / 28` | `GSAP+Three` | `340ms` / `200ms` | Lật `180°` + `back.out` | `playCardDraw()` | Low: nhấc nhẹ · Med/High: xoay lật tia vàng | Fade nhẹ | Song song `LuckCardModal` |
| `ANIM-EVT-04` | Championship Searchlight | Kích hoạt/Dời Cúp Quốc Gia | `GSAP+Three` | `700ms` / `380ms` | Quét nón sáng mềm | `playChampionshipFanfare()` | Low: tắt chùm · Med/High: 1–2 chùm sáng | Tắt quét sáng | Non-blocking |
| `ANIM-EVT-05` | Festival `×2` Lantern Glow | 3 ô Lễ Hội đầu mùa đang bật | `GSAP+Three` | Lặp `2.8s` | `sine.inOut` | Không | Low: tĩnh `0 FPS` · Med/High: nhấp nhô | Tĩnh | Giữ đồng bộ ô Lễ Hội |
| `ANIM-EVT-06` | Monopoly Brink Pulse | Sở hữu `N-1` ô của bộ màu / `3/4` Resort | `GSAP+Three` | `600ms` / `340ms` | 2 nhịp viền vàng | Không | Low: không lặp · Med/High: 1 xung khi đạt ngưỡng | 1 viền tĩnh | Non-blocking |
| `ANIM-EVT-07` | Day ↔ Night Transition | Nút chuyển Sáng/Tối | `GSAP+Three` | `950ms` | `power2.inOut` | `playAmbienceToggle()` | Low: 1 step `300ms` · Med/High: mượt `950ms` | Chuyển nhanh `250ms` | Cục bộ theo máy |
| `ANIM-EVT-08` | Corner Diorama Ambient | Cối xay, máy bay, cúp góc quay nhẹ | `GSAP+Three` | Lặp | Tốc độ đều theo `visualAnimDt` | Không | **Low: Tắt (`0 FPS` idle)** · Med: `20 FPS` · High: `60 FPS` | Tắt | Cục bộ |
| `ANIM-EVT-09` | HUD Avatar Mood Reaction | Khi có sự kiện tiền/đảo/mua/thắng | `PlayerAvatar3D` | `1.2s` giữ mood | `computeAvatarPoseTargets` | Không | Low: cập nhật 1 snapshot mới · Med/High: mượt | Snap mood | Khớp mọi client |

---

## 7. Kết Trận & UI Motion (`ANIM-END-01..06` & `ANIM-UI-01..04`)

| Mã ID | Tên Animation | Trigger | Công nghệ | Thời lượng `1×` / `2×` | Easing | SFX | Low / Medium / High | Reduced Motion | Khớp Online |
|---|---|---|---|---|---|---|---|---|---|
| `ANIM-END-01` | Victory Reveal Beat | Kích hoạt `evaluateMatchWinner` / hết 20:00 | `GSAP+Three` | `450ms` | `expo.out` | `playVictoryFanfare()` | Cả 3 mức | `200ms` fade | Đồng bộ `GAME_OVER` |
| `ANIM-END-02` | Winner Podium & Trophy | Vào `GAME_OVER` (Solo & `2v2`) | `GLB+Mixer` + `GSAP` | `750ms` + lặp | `back.out(1.4)` | `playChampionshipFanfare()` | Cả 3 mức (Low đứng tĩnh sau mọc) | Hiện thẳng `200ms` | Hỗ trợ 2 người `2v2` |
| `ANIM-END-03` | Mid-Match Bankruptcy | Người chơi phá sản giữa ván | `GLB+Mixer` + `Instanced` | `750ms` / `420ms` | `power3.in` | `playBankruptSlump()` | Cả 3 mức | `250ms` fade | Khớp `PLAYER_BANKRUPT` |
| `ANIM-END-04` | Defeated Reactions | Kết thúc trận cho người thua | `GLB+Mixer` | Lặp / `800ms` | `defeat_slump` | Không | Low: pose tĩnh · Med/High: lặp chậm | Pose tĩnh | Khớp `GAME_OVER` |
| `ANIM-END-05` | Pooled Confetti Fireworks | Bắn pháo giấy chiến thắng | `Instanced+Shader` | `3.2s` (tự ngủ sau hết) | Gravity + air drag | Pop nhẹ | Low: Tắt · Med: `60` mảnh · High: `140` mảnh | **Tắt hoàn toàn** | Chạy ở `GAME_OVER` |
| `ANIM-END-06` | Camera Handoff to Modal | Chốt sau bục vinh danh → `VictoryModal` | `GSAP+Three` + `UI` | `900ms` | `power2.out` | Không | Cả 3 mức | Hiện modal sau `200ms` | Không chặn nút Chơi tiếp |
| `ANIM-UI-01` | Modal Motion Entrance | Mở các Modal quyết định / Thẻ Cơ Hội | `UI Motion/CSS` | `200ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | `playCardDraw()` (thẻ) | Cả 3 mức (`0` backdrop-blur trên WebGL) | Opacity fade `100ms` | Khớp trạng thái |
| `ANIM-UI-02` | Speech Bubble Projection | Bot / Sự kiện phát thoại trên đầu pawn | `MonopolyCanvas` 2D DOM | `150ms` | `translate3d` GPU | `playChatPop()` | Cả 3 mức | Không nảy | Khớp 4 máy |
| `ANIM-UI-03` | Turn & Landing Cue Toast | Đầu lượt / Rơi vào ô | `UI Motion/CSS` | `220ms` | Spring nhẹ | Không | Cả 3 mức | Fade đơn | Khớp snapshot |
| `ANIM-UI-04` | ActionDock Tactile Press | Hover / Nhấn các nút 3D Casual | `UI Motion/CSS` | `130ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Nhẹ (nếu bật) | Cả 3 mức | Không dịch chuyển Y | Khóa sạch khi `!isSynced` |
