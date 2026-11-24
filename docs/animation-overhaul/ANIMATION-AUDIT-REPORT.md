# ANIMATION AUDIT REPORT — Cờ Tỷ Phú 3D Việt Nam (Baseline `68c8d50`)

- **Ngày kiểm toán:** 2026-11-24
- **Nhánh & Commit nền tảng:** `feature/3d-animation-overhaul` (xuất phát từ Stable Gameplay Baseline `main @ 68c8d50`)
- **Game tham chiếu:** *Business Tour* (lối chơi chính & thẩm mỹ bàn cờ) kết hợp nguyên tắc chuyển động, camera và phản hồi xúc giác từ *Monopoly Plus* & *Monopoly Madness*, giữ nguyên bản sắc Việt Nam và phong cách Low-Poly Isometric sáng rõ.
- **Dữ liệu thực nghiệm đối chiếu:** Đo đạc trực tiếp trên trình duyệt Chrome `--headed` (`1440×900`, `scratch/baseline_metrics.json`) cùng chuỗi 5 ảnh chụp Before (`audit_before_overview_day.png`, `audit_before_overview_night.png`, `audit_before_dice_and_hop.png`, `audit_before_buy_and_treasury.png`, `audit_before_special_and_card.png`).

---

## 1. Tổng Quan Kiểm Toán 12 Module Hiện Tại

| Module (`src/`) | Vai trò hiện tại | Điểm mạnh đang có | Hạn chế & Nguyên nhân gốc cần nâng cấp |
|---|---|---|---|
| `src/components/MonopolyCanvas.tsx` | Vòng lặp `WebGLRenderer` duy nhất, điều phối xúc xắc, nhảy ô, nhà mọc, Camera, Kho bạc, Ngày/Đêm | Tách rạch ròi `gameplayAnimDt` & `visualAnimDt`; single-flight scheduler (`0 FPS` idle trên `Low`); `resolveOnce()` + `onStep` chuẩn | Khóa cứng `token.rotation.y = Math.PI / 4` khi nhảy (`:2153`); `springPopScale` đơn giản trên nhà (`:186-194`); `animateDiceRoll`/`animateTokenPath` xóa `manualOrbitOverrideRef` ép giật góc nhìn người dùng (`:546, :582`); thiếu hẳn hiệu ứng cho Đảo Hoang, World Tour bay 3D, Cơ Hội, Động đất, Mất điện, Khiên vỡ, Độc quyền và Kết trận |
| `src/three/models.ts` | Dựng hình procedural bàn cờ, 4 quân cờ, 24 cụm công trình vùng miền, 4 góc, sân giữa | Bộ 24 công trình chia 3 phong cách (`heritage`, `coastal`, `metropolis`) sắc nét; `mergeGroupMeshesByMaterial` giảm draw call tốt | `createPlayerTokenMesh` (`:535-894`) gọi `mergeGroupMeshesByMaterial(group)` ở `:892`, **hàn chết toàn bộ đầu/thân/tay/bệ phương tiện** thành khối cứng không thể diễn hoạt khớp xương |
| `src/components/PlayerAvatar3D.tsx` | Engine WebGL offscreen cho 4 chân dung góc HUD | `low` chụp snapshot bitmap tĩnh `0 FPS` rất nhẹ iGPU; biểu cảm `deriveAvatarMood` sinh động | Các mesh trong `CharacterRigRefs` chưa batch theo vật liệu, khiến ở `Medium`/`High` offscreen renderer bắn **`2,672.7 – 4,220` draw calls/sec** cho riêng 4 khung ảnh nhỏ; chưa có xung kích hoạt đồng bộ từ hiệu ứng bàn cờ |
| `src/three/physicsEngine.ts` | Mô phỏng `cannon-es` tất định cho xúc xắc + `Q_remap` mặt ngửa + nảy khay tiền | Vật lý nảy thật `165` bước @ `90 Hz`, luôn đáp chuẩn `(die1, die2)` mọi 36 tổ hợp trong `1.30–1.38s` | Thiếu pha chuẩn bị tung (`Anticipation`), hiệu ứng va chạm/tiếp đất, và thiếu tín hiệu 3D rõ ràng cho **Đổ Đôi** hoặc **Xúc xắc chiến thuật** (`EVEN`/`ODD`/`REROLL`) |
| `src/three/treasurySystem.ts` | 4 Khay Kho bạc + Ngân hàng dùng `InstancedMesh` + GLSL Flutter/Glint + hạt bay Bezier | Chỉ tốn `2` instanced draw calls trên bàn; hoàn toàn tách biệt khỏi logic số dư; có độ nảy khay (`computePhysicalTrayBounceY`) | Chưa có hiệu ứng đặc trưng cho **Lương Start `+300K`**, **Thuế `-10%`**, **Khay tiền nhấp nháy cảnh báo thiếu tiền**, và **rút cạn khay khi Phá sản** |
| `src/three/textures.ts` | Sinh toàn bộ `CanvasTexture` cho 32 ô đất, nhãn giá, sân cỏ, xúc xắc, đồng hồ | Chữ tiếng Việt cực sắc nét; đồng hồ giữa sân tái sử dụng 1 texture tại chỗ (`performanceAssets.test.ts:358`) | Cấp phát 28 mặt ô `512×768` + sân `1024×1024` + cỏ `1536×576` + 12 mặt xúc xắc `384×384` với mipmap đầy đủ đẩy tổng VRAM texture thực lên **`~110 MB`** (`Low`, probe upper-bound `229.72 MB`) và **`~180–200 MB`** (`High`, probe `303.92–309.94 MB`) |
| `src/game/graphicsQuality.ts` | Phân loại iGPU/dGPU, `computeBoardFrameDeltas()`, `createBoardFrameScheduler()` | Nền tảng kiến trúc iGPU tuyệt vời: `Low` ngủ thực sự (`3` frame/3s do đồng hồ 1s), watchdog `500ms` single-flight | Cần mở rộng `shouldKeepBoardAnimating` để đọc thêm trạng thái `AnimationDirector.hasActiveVisualAnimations()` sao cho idle clip trên `Low` vẫn giữ nguyên `0 FPS` |
| `src/game/gameplayClock.ts` | Đồng hồ đếm ngược đơn điệu dựa trên `performance.now()` | Chính xác tuyệt đối (`0.0s` drift / `61s`), bảo toàn `carryMs` khi chuyển pha | Giữ nguyên 100%; lấy làm hình mẫu để nâng cấp `waitGameBeat` |
| `src/audio/soundEngine.ts` | Bộ tổng hợp WebAudio procedural (0 file âm thanh ngoài) | Có sẵn 14 hàm SFX (`playPhysicsDiceHit`, `playTokenHop`, `playCurrencyTransfer`, `playVictoryFanfare`...) kèm `DynamicsCompressorNode` | Thiếu âm thanh riêng cho **Đổ Đôi**, **Động đất**, **Mất điện**, **Khiên vỡ**, **Lên Landmark ★**, **Cúp Quốc Gia**, **Độc quyền** và **World Tour bay** |
| `src/App.tsx` | Điều phối vòng đời lượt Offline, nhận snapshot/event Online, gọi `animateDiceRoll`/`animateTokenPath` | Khóa `sessionEpochRef` và `prevOnlineSyncedRef` chặt chẽ | `waitGameBeat` (`:955-975`) trừ `60ms` cố định mỗi `setTimeout(60)` nên khi tab ẩn bị Chrome throttle `1 Hz`, nhịp chờ `740ms` giãn thành `~10.5s`; `cinematicCamera` mặc định `false` (`:326`); thiếu kênh phát sự kiện hình ảnh không chặn luồng (`AnimationEventDispatcher`) cho các pha giao dịch & sự kiện đặc biệt |
| `src/game/visualTheme.ts` | Hồ sơ kiến trúc 24 ô đất, `computeSafeBoardCameraPose` (`FOV 26°`), kẹp bóng thoại | Đóng khung 32 ô + 4 khay tiền sạch sẽ trên cả Desktop `1440×900` lẫn Mobile | Bố cục bóng thoại & HUD rất tốt (giữ nguyên); chỉ cần đồng bộ vùng an toàn cho `CameraDirector` mới |
| `src/index.css` & `package.json` | CSS `.animate-pop-in` / `.animate-float-gentle`, `prefers-reduced-motion`; có sẵn `motion ^12.23.24` | Hỗ trợ `oklab`, `@media (prefers-reduced-motion: reduce)` (`:394-399`) | Thư viện `motion` đã cài ở `package.json:30` nhưng **chưa hề được sử dụng** trong bất kỳ component nào (`0` import); `gsap` chưa được cài đặt |

---

## 2. Quan Sát Trực Tiếp Từ Trình Duyệt Chrome (`68c8d50`)

1. **Toàn cảnh Ban ngày & Ban đêm (`audit_before_overview_day.png`, `audit_before_overview_night.png`):**
   - Bàn cờ diamond `FOV 26°`, 4 khay tiền góc, chữ tiếng Việt trên mặt ô và 4 thẻ `PlayerHUD` cực kỳ rõ ràng, sạch sẽ.
   - Tuy nhiên, khi chuyển Ban đêm trên mức `High`, `UnrealBloomPass` + `GTAOPass` cùng đèn sân khấu khiến số shader programs tăng lên `82` và FPS rớt xuống **`20.67 FPS`** ngay cả khi đứng yên.
2. **Xúc xắc & Nhảy quân cờ (`audit_before_dice_and_hop.png`):**
   - Hai viên xúc xắc hồng lăn và va chạm vật lý tốt trong sân cỏ trũng (`cannon-es`), nhưng khi bắt đầu đổ **không có pha nhấc lên/xoay đà chuẩn bị** và khi đáp xuống mặt bàn không có vòng sóng/hạt phản hồi (nếu ra Đôi hoặc dùng Xúc xắc Chẵn/Lẻ không có dấu hiệu thị giác nổi bật).
   - Ở `High` lúc lăn xúc xắc + nhảy 11 ô, **`drawCallsPerFrame` tăng gấp đôi từ `321` lên `685.3`** và **`trianglesPerFrame` từ `26,797` lên `54,351`** (`24.8 FPS`, `p95 = 66.6ms`) do bóng đổ `2048×2048` + G-buffer `GTAOPass` vẽ lại liên tục từng frame.
3. **Mua đất, Xây nhà & Kho bạc bay tiền (`audit_before_buy_and_treasury.png`):**
   - Dải tiền Polymer & xu bay vòng cung từ khay slot 0 lên ô Phan Thiết rất bắt mắt và rõ hướng dòng tiền; nhưng tòa nhà chỉ bật lên bằng một hàm scale tuyến tính-sin (`springPopScale`), thiếu hiệu ứng nảy theo từng tầng nhà/mái và thiếu khung máy lấy nét nhẹ khi lên công trình lớn.
4. **Thẻ Cơ Hội & Sự kiện đặc biệt (`audit_before_special_and_card.png`):**
   - Bộ bài `?` ở giữa sân cỏ trũng đứng yên bất động khi người chơi dẫm ô Cơ Hội — modal 2D đột ngột bật đè lên giữa màn hình, thiếu cầu nối thị giác từ lá bài 3D trên bàn bay lên.

---

## 3. Bảng Chấm Điểm Hiện Trạng Theo 11 Tiêu Chí (Thang 1–10)

| Nhóm Animation hiện tại | Smoothness | Timing | Easing | Anticipation | Follow-through | Squash & Stretch | Physical Weight | Visual Feedback | Camera Comp. | Readability | Perf. Cost *(10=nhẹ)* | Trung bình |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1. Nhân vật bàn cờ (Pawns)** | 5 | 5 | 4 | **1** | **2** | 4 | 3 | 4 | 5 | 7 | 8 | **4.5 / 10** |
| **2. Chân dung HUD (`PlayerAvatar3D`)** | 8 | 8 | 7 | 5 | 6 | 4 | 6 | 8 | 8 | 9 | **4** *(Med/High)* | **6.6 / 10** |
| **3. Xúc xắc (`cannon-es`)** | 9 | 8 | 8 | **2** | 6 | 3 | 9 | 6 | 5 | 9 | 7 | **6.6 / 10** |
| **4. Công trình & Nâng cấp** | 6 | 6 | 5 | **2** | 4 | 5 | 4 | 6 | 4 | 8 | 7 | **5.2 / 10** |
| **5. Kho bạc 3D & Dòng tiền** | 8 | 8 | 8 | 5 | 8 | 6 | 8 | 9 | 6 | 9 | 8 | **7.5 / 10** |
| **6. Camera (`cinematicCamera`)** | 6 | 5 | 6 | 2 | 4 | — | 5 | 4 | 5 | 7 | **4** *(High)* | **4.8 / 10** |
| **7. Sự kiện đặc biệt (Cúp/Thẻ/Đảo/WT)** | 3 | 3 | 3 | **1** | **1** | **1** | **2** | **3** | **2** | 6 | 9 | **3.1 / 10** |
| **8. Môi trường & Ngày/Đêm** | 8 | 8 | 8 | — | 6 | — | 7 | 8 | 8 | 9 | **5** *(Night)* | **7.4 / 10** |
| **9. Kết thúc trận & Phá sản** | 3 | 3 | 2 | **1** | **2** | **1** | **2** | **3** | **2** | 7 | 9 | **3.2 / 10** |
| **10. UI Modals & Âm thanh WebAudio** | 8 | 8 | 8 | 4 | 6 | 5 | 6 | 8 | — | 9 | 9 | **7.1 / 10** |

---

## 4. Phân Loại Quyết Định Từng Thành Phần (`KEEP / IMPROVE / REPLACE / ADD`)

| Quyết định | Danh sách hạng mục cụ thể | Lý do kỹ thuật & định hướng nâng cấp |
|---|---|---|
| **`KEEP` (Giữ nguyên lõi)** | • Động cơ vật lý `cannon-es` + `Q_remap` (`physicsEngine.ts`)<br>• Hệ thống `InstancedMesh` Kho bạc 3D & GLSL Flutter/Glint (`treasurySystem.ts`)<br>• Bộ lập lịch `createBoardFrameScheduler()` + `computeBoardFrameDeltas()` + fallback `500ms` (`graphicsQuality.ts`)<br>• Kiến trúc `Snapshot 0 FPS` ở mức `Low` của `PlayerAvatar3D.tsx`<br>• Bộ tổng hợp WebAudio + `DynamicsCompressorNode` (`soundEngine.ts`)<br>• Hệ thống thẻ/nút Casual Glossy UI & `clampSpeechBubbleToViewport` | Đây là các thành phần chất lượng cao, đã được chứng minh ổn định tuyệt đối trong Phase 1 (0 bug, 0 memory leak, không cần phụ thuộc file âm thanh ngoài). |
| **`IMPROVE` (Cải thiện đáng kể)** | • **Camera:** Nâng cấp `computeCinematicCameraPose` thành `CameraDirector` thông minh bật mặc định (không giật `manualOrbitOverrideRef` khi bấm Roll, hỗ trợ framing giao dịch/Landmark/sự kiện)<br>• **Công trình 24 ô:** Thay `springPopScale` đơn lẻ bằng GSAP timeline theo tầng (đế → tường → mái → huy hiệu), thêm sóng đổi màu Buyout 2× & dỡ nhà<br>• **Kho bạc & Tiền bay:** Bổ sung phản hồi lương Start `+300K`, Thuế `-10%`, cảnh báo thiếu tiền & rút cạn khay khi phá sản<br>• **Xúc xắc:** Thêm bước chuẩn bị nhấc xoay (`Anticipation`), vòng chạm đất (`Impact Ring`)<br>• **Hiệu năng iGPU (`Wave 7`):** Tối ưu kích thước/mipmap `CanvasTexture` (`textures.ts`), batch mesh trong `PlayerAvatar3D.tsx` (hạ `4,220` draws/s) & `waitGameBeat` monotonic | Giải quyết trực tiếp các điểm yếu về Easing/Anticipation/Follow-through và cắt giảm mạnh gánh nặng draw call/VRAM ở `Medium` và `High`. |
| **`REPLACE` (Thay thế có kiểm soát)** | • **4 Quân cờ bàn cờ cứng (`createPlayerTokenMesh` bị `mergeGroupMeshesByMaterial`):** Thay bằng **model 3D có khớp xương rig nhẹ (`<= 12` xương, `.glb` từ Blender 4.5 + `AnimationMixer`)** giữ nguyên 100% tạo hình & bảng màu `CHARACTER_PERSONAS` (`car`/`yacht`/`jet`/`crown`) + giữ `createPlayerTokenMesh` làm fallback tức thì khi đang tải `.glb`<br>• **Góc xoay cố định `token.rotation.y = Math.PI / 4` khi nhảy ô:** Thay bằng xoay mượt theo hướng di chuyển (`yaw`) + nghiêng cua góc 90° | Khắc phục điểm yếu lớn nhất (`4.5/10`) về sự sống động của nhân vật trên bàn cờ mà vẫn giữ nguyên phong cách Low-Poly Isometric Việt Nam. |
| **`ADD` (Bổ sung mới)** | • **Hạ tầng `AnimationDirector` + `AnimationEventDispatcher` + GSAP Manual-Stepped (`paused: true` đẩy bằng `visualAnimDt`)**<br>• **Chuỗi hoạt ảnh Sự kiện đặc biệt 3D:** Hộp/chấn song Đảo Hoang, máy bay/vệt bay 3D World Tour qua bàn cờ, lật lá bài `?` từ sân giữa nối vào modal Cơ Hội, tia sáng Cúp Quốc Gia, rung chấn Động Đất, chập điện Mất Điện, vòm Khiên Bảo Hộ deploy & vỡ khi chặn đòn, sóng hào quang hoàn tất Độc quyền<br>• **Chuỗi Kết Trận 3D:** Bục Vinh Danh + Cúp 3D (`trophy_podium.glb`), điệu nhảy thắng cuộc (Solo & 2v2), hoạt ảnh thua cuộc/Phá sản, và pháo hoa giấy `InstancedMesh` pooled<br>• **SFX bổ sung trong `soundEngine.ts`** cho các sự kiện đặc biệt mới | Đưa trải nghiệm hình-âm lên chuẩn board game thương mại (*Business Tour* / *Monopoly Plus*), đồng thời không làm chậm hay phá vỡ đồng bộ server Online. |
