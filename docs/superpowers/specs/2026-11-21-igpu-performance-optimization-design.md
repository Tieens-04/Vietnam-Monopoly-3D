# Đặc Tả Thiết Kế (Design Spec) — Tối Ưu Hóa Hiệu Năng Hệ Thống 3D & UI Cho Card Đồ Họa Tích Hợp (Onboard GPU)

- **Ngày lập**: 2026-11-21
- **Dự án**: `cờ-tỷ-phú-3d-việt-nam`
- **Phạm vi**: Giải quyết triệt để tình trạng quá tải 100% GPU tích hợp (iGPU) và giật lag khi chơi trên `localhost` thông qua **Nhận diện phần cứng GPU tự động**, **Pipeline 3 tầng (`Thấp / Trung bình / Cao`) đổi nóng tức thì**, **Vòng lặp Render theo nhu cầu (Demand-Driven Rendering)**, **Chân dung 3D chụp Cache tĩnh**, **Dùng chung tài nguyên Hình học/Vật liệu** và **Cách ly Re-render React**.

---

## 1. Mục Tiêu & Nguyên Nhân Gốc Đã Xác Định

### 1.1. Nguyên nhân gốc gây 100% tải Card Onboard
1. **Bộ lọc phần cứng bỏ lọt iGPU:** Biến `isSoftwareGl` trong `MonopolyCanvas.tsx` và `PlayerAvatar3D.tsx` chỉ phát hiện trình dựng phần mềm (`SwiftShader`, `llvmpipe`). Mọi card onboard (`Intel HD / UHD / Iris`, `AMD Radeon(TM) Graphics` tích hợp) đều bị áp cấu hình **Ultra** với `pixelRatio` lên tới `2.0`.
2. **Hậu kỳ `EffectComposer` ngốn băng thông cực nặng mỗi frame:** Render target `HalfFloatType` kèm `samples: 4` (4× MSAA), `GTAOPass` (vẽ lại toàn bộ hình học lần thứ 2 để lấy G-Buffer và gọi `scene.traverse` 2 lần mỗi frame), cùng `UnrealBloomPass` chạy liên tục 60 lần/giây ngay cả vào Ban ngày khi `strength = 0`.
3. **WebGL Context thứ 2 chạy song song 60 FPS trong `PlayerAvatar3D.tsx`:** Dựng cảnh 3D `256×256` với `MeshPhysicalMaterial` (`sheen` + `clearcoat` + `RoomEnvironment`) cho 4–5 nhân vật cùng lúc (240–300 lần render/giây) rồi gọi `ctx2d.drawImage` chéo sang Canvas 2D, gây nghẽn đồng bộ RAM chia sẻ trên iGPU.
4. **ShadowMap `2048×2048` vẽ lại mỗi frame & trùng lặp tài nguyên 3D:** `renderer.shadowMap.autoUpdate = true` buộc hàng trăm mesh nhỏ vẽ lại bóng đổ 60 lần/giây dù đứng yên; 24 cụm nhà trong `models.ts` khởi tạo lặp hàng trăm `BufferGeometry`, `MeshPhysicalMaterial` và 24 `CanvasTexture` huy hiệu cấp nhà ngay từ đầu.
5. **Render không nghỉ khi bị che khuất & Re-render UI mỗi giây:** `<MonopolyCanvas>` vẫn chạy tối đa tần số quét phía sau `StartModal` / `PauseModal` / `VictoryModal`, và bộ đếm `turnTimeLeft` nhảy mỗi giây kéo toàn bộ `<PlayerHUD>` cùng `<ActionDock>` re-render thừa.

### 1.2. Mục tiêu cần đạt
- Giữ nguyên **100% độ sắc nét** của chữ tiếng Việt trên mặt ô đất 3D, bố cục giao diện Business Tour, xúc xắc vật lý `cannon-es`, kho bạc 3D `InstancedMesh` và ngoại hình nhân vật 3D.
- Trên máy dùng card onboard (mặc định tự động vào mức **Thấp**): hạ tải GPU xuống **~0%–5% khi ở Phòng chờ hoặc bàn cờ đứng yên chờ lượt**, và **~25%–45% mượt mà khi lăn xúc xắc / di chuyển quân cờ / xoay camera**.
- Cung cấp bộ chọn **Chất lượng Đồ họa (`Tự động / Thấp / Vừa / Cao`)** tại cả Phòng chờ (`StartModal`) và Cài đặt trong trận (`ActionDock`), đổi nóng tức thì không làm mất ván đấu, góc xoay camera hay kết nối Online.

---

## 2. Kiến Trúc Mô-đun & Luồng Dữ Liệu

```
src/
├── game/
│   ├── types.ts                        # (Cập nhật) Thêm GraphicsQualityPref & GraphicsQualityTier
│   ├── graphicsQuality.ts              # (Mới) Nhận diện GPU, lưu/đọc localStorage, bảng thông số 3 tầng & xét trạng thái Active/Idle
│   └── graphicsQuality.test.ts         # (Mới) Unit test TDD cho phân loại chuỗi GPU, cấu hình 3 tầng & logic On-Demand
├── three/
│   ├── models.ts                       # (Cập nhật) Gom dùng chung Geometry/Material tĩnh, trì hoãn tạo LevelBadgeTexture, hỗ trợ tắt clearcoat
│   └── treasurySystem.ts               # (Cập nhật) Thêm hasActiveAnimations() & setQualityProfile() để nghỉ 0 FPS khi không có tiền bay
└── components/
    ├── GraphicsQualityPicker.tsx       # (Mới) Cụm nút chọn Đồ họa (Tự động / Thấp / Vừa / Cao) chuẩn thẩm mỹ Business Tour
    ├── MonopolyCanvas.tsx              # (Cập nhật) Lazy EffectComposer, Shadow on-demand, Hot-swap cấu hình & Demand-driven render loop
    ├── PlayerAvatar3D.tsx              # (Cập nhật) Snapshot 3D Cache tĩnh (0 FPS ở mức Thấp) & giới hạn 15/30 FPS ở mức Vừa/Cao
    ├── StartModal.tsx                  # (Cập nhật) Tích hợp GraphicsQualityPicker tại Thiết Lập Bàn Đấu
    ├── ActionDock.tsx                  # (Cập nhật) Tích hợp GraphicsQualityPicker vào Settings Popover + bọc React.memo
    ├── PlayerHUD.tsx                   # (Cập nhật) Bọc React.memo cho PlayerHUD & PlayerCornerCard
    └── App.tsx                         # (Cập nhật) Quản lý state chất lượng đồ họa, truyền cờ che khuất bàn cờ & ổn định callback
```

---

## 3. Nhận Diện Phần Cứng GPU & Bảng Thông Số 3 Tầng (`graphicsQuality.ts`)

### 3.1. Kiểu dữ liệu & Lưu trữ
- `export type GraphicsQualityPref = 'auto' | 'low' | 'medium' | 'high'` (lưu `localStorage` khóa `bt_vn_graphics_quality`, mặc định `'auto'`).
- `export type GraphicsQualityTier = 'low' | 'medium' | 'high'`.
- Khi mount ứng dụng, ghi `document.body.dataset.quality = resolvedTier` để đồng bộ kiểm thử và chẩn đoán.

### 3.2. Thuật toán Phân loại Chuỗi GPU (`classifyGpuRenderer`)
Đọc chuỗi `UNMASKED_RENDERER_WEBGL` (hoặc `RENDERER` nếu trình duyệt ẩn thông tin):
1. **GPU phần mềm (`isSoftwareGl = true`):** Khớp `/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i` → trả về `{ tier: 'low', isSoftwareGl: true, label: 'GPU Phần mềm' }`.
2. **Card đồ họa rời (`Dedicated GPU`):** Không chứa từ khóa tích hợp (`Integrated`, `UHD`, `HD Graphics`, `Iris`) và khớp `/NVIDIA|GeForce|RTX|GTX|Quadro|Radeon\s*RX|Radeon\s*Pro|Arc\s*A\d|Apple\s*M\d\s*(Pro|Max|Ultra)/i` → trả về `{ tier: 'high', isSoftwareGl: false, label: 'GPU Rời' }`.
3. **Card onboard / Tích hợp / Di động / Chuỗi ẩn danh (Mặc định an toàn):** Khớp `/Intel|UHD|HD Graphics|Iris|Radeon\(TM\)\s*Graphics|Vega|Adreno|Mali|PowerVR|Apple\s*GPU/i` hoặc chuỗi chung bị trình duyệt che (`ANGLE`, `WebKit WebGL`, rỗng) → trả về `{ tier: 'low', isSoftwareGl: false, label: 'Card Onboard / Tích hợp' }`.

### 3.3. Bảng Thông Số Thực Thi (`GraphicsQualityProfile`)

| Thuộc tính Profile | Mức **Thấp (`low`)** | Mức **Vừa (`medium`)** | Mức **Cao (`high`)** |
| :--- | :--- | :--- | :--- |
| `maxPixelRatio` | `1.0` | `1.25` | `1.75` (`1.0` nếu `isSoftwareGl`) |
| `antialias` (khởi tạo WebGL) | `false` | `true` | `true` (`false` nếu `isSoftwareGl`) |
| `usePostProcessing` (`GTAO` + `Bloom`) | `false` | `false` | `true` (`false` nếu `isSoftwareGl`) |
| `shadowsEnabled` | `false` | `true` | `true` (`false` nếu `isSoftwareGl`) |
| `shadowMapSize` | `0` | `1024` (`PCFShadowMap`) | `2048` (`PCFSoftShadowMap`) |
| `useEnvironmentMap` (`RoomEnvironment`) | `false` (bù cường độ đèn `1.12×`) | `true` | `true` |
| `usePhysicalClearcoat` | `false` | `false` | `true` |
| `animateAmbientProps` (mây/hoa/khiên nhấp nhô lúc nghỉ) | `false` | `true` | `true` |
| `idleBoardFps` (khi bàn cờ đứng yên) | **`0` (Ngủ hẳn — On-Demand)** | `20 FPS` | `60 FPS` |
| `activeBoardFps` (khi có chuyển động) | `60 FPS` | `60 FPS` | `60 FPS` |
| `avatarFps` (`PlayerAvatar3D`) | **`0` (Snapshot 3D Cache tĩnh)** | `15 FPS` | `30 FPS` |
| `avatarPixelSize` | `160` (`144` nếu `isSoftwareGl`) | `192` | `256` |

---

## 4. Pipeline Bàn Cờ 3D Theo Nhu Cầu & Đổi Nóng (`MonopolyCanvas.tsx`)

### 4.1. Vòng lặp Render Theo Nhu Cầu (Demand-Driven Loop)
Bổ sung hàm đánh thức `requestRender()` nội bộ và bộ kiểm tra `shouldKeepBoardAnimating`:
1. **Tự động ngủ khi bị che hoặc ẩn tab:**
   - Nếu `document.hidden === true`: dừng hoàn toàn lịch trình vẽ (`0 FPS`); đăng ký sự kiện `visibilitychange` để đánh thức ngay khi người chơi quay lại tab.
   - Nếu `isBoardOccluded === true` (`viewScreenState !== 'playing'`, tức đang mở `StartModal`, `PauseModal` hoặc `VictoryModal`): chỉ vẽ **đúng 1 frame nền tĩnh** lúc vừa mở hoặc đổi chế độ sáng/resize, sau đó dừng hoàn toàn vòng lặp (`0 FPS`).
2. **Phát hiện chuyển động thực sự trong trận (`isActivelyAnimating`):**
   - Đang lăn xúc xắc (`activeDiceAnimRef.current !== null`).
   - Quân cờ đang nhảy hoặc trượt về vị trí nghỉ (`activeHopAnimRef.current !== null` hoặc khoảng cách tới đích `> 0.004`).
   - Kho bạc có luồng tiền đang bay hoặc khay đang nảy đàn hồi (`treasury.hasActiveAnimations() === true`).
   - Có hạt pháo hoa ngôi sao đang hoạt động (`activeSparkCount > 0`).
   - Ô đất đang nâng/hạ độ cao hoặc nhà mới xây đang nảy `popTimers` (`hasTileOrBuildingMotion === true`).
   - Chuyển cảnh Ngày ↔ Đêm đang diễn ra (`Math.abs(targetNight - currentNightFactor) > 0.002`).
   - Camera đang xoay/trượt quán tính (`OrbitControls` phát sự kiện `'change'`), đang `resetCamera` hoặc `cinematicCamera` đang hội tụ góc nhìn.
3. **Điều tiết tốc độ khung hình:**
   - Khi `isActivelyAnimating === true`: chạy `requestAnimationFrame` mượt mà ở `60 FPS` (hoặc `afterDraw` fenceSync nếu `isSoftwareGl`).
   - Khi `isActivelyAnimating === false`:
     - Ở mức **`low`**: không đặt `requestAnimationFrame` kế tiếp (**`0 FPS`**). Mọi thay đổi rời rạc (chuột di qua ô đất làm đổi `hoveredTileIdx`, click chọn ô đất, đồng hồ `turnTimeLeft` nhảy giây mỗi `1s`, mua/nâng cấp đất, đổi kiểu tiền tệ, resize cửa sổ) đều gọi `requestRender()` để vẽ ngay lập tức mà không trễ nhịp.
     - Ở mức **`medium`**: hẹn nhịp vẽ cách quãng `50ms` (`20 FPS`) để giữ chuyển động mây/hoa/khiên nhẹ nhàng với tải GPU thấp.
     - Ở mức **`high`**: giữ `requestAnimationFrame` `60 FPS`.

### 4.2. Cập nhật ShadowMap Thông Minh & Khởi Tạo Lười Hậu Kỳ
- Đặt `renderer.shadowMap.autoUpdate = false` cho mọi mức có bật bóng đổ (`medium`, `high`). Chỉ gán `renderer.shadowMap.needsUpdate = true` khi có chuyển động vật thể trong cảnh (xúc xắc, quân cờ, nhà mọc, tiền bay, ô đất nâng, đổi hướng nắng Ngày/Đêm) hoặc vừa bật lại bóng đổ. Thao tác xoay/thu phóng camera bằng chuột không làm vẽ lại ShadowMap.
- **Lazy Post-Processing:** Ở mức `low` và `medium`, không tạo `EffectComposer`, `GTAOPass`, `UnrealBloomPass` hay `composerRT`. Chỉ khởi tạo chuỗi này khi người dùng chọn hoặc được phân vào mức `high`; nếu hạ từ `high` xuống `low`/`medium`, gọi `dispose()` giải phóng bộ đệm `HalfFloatType` ngay lập tức.
- Ở mức `high`:
  - Tự động đặt `bloomPass.enabled = currentNightFactor > 0.005` để tắt hẳn 5 lượt blur vào Ban ngày.
  - Thay thế lệnh `scene.traverse(...)` kép mỗi frame trong `GTAOPass` bằng danh sách tham chiếu các mesh trong suốt đã thu thập sẵn (cập nhật khi thêm/xóa quân cờ).

---

## 5. Dùng Chung Hình Học, Vật Liệu & Tối Ưu Kho Bạc (`models.ts`, `treasurySystem.ts`)

1. **Chia sẻ `BufferGeometry` & `Material` tĩnh trong `models.ts`:**
   - Dùng chung các `BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, `SphereGeometry` lặp lại của đế ô đất, gờ nhãn giá ngoài, 24 bộ công trình (`starterPavilion`, `houses`, `hotel`) và mô hình khiên bảo vệ khách sạn (`createProtectionShieldModel`), đồng thời đánh dấu `userData.sharedResource = true` để hàm dọn dẹp không `dispose` nhầm tài nguyên dùng chung còn tham chiếu, hoặc gom quản lý tập trung rõ ràng.
   - Không gọi `createLevelBadgeTexture` sẵn 24 lần khi tạo bàn cờ; khởi tạo `levelBadgeMat.map = null` (vì `levelBadgeMesh.visible = false` mặc định) và chỉ sinh `CanvasTexture` khi ô đất đạt `level >= 1`.
   - Khi tắt `usePhysicalClearcoat` (`low`, `medium`), gán `facadeMat.clearcoat = 0` và `roofMat.clearcoat = 0` (hoặc dùng `MeshStandardMaterial`) để bỏ tính toán lớp phản xạ GGX thứ hai.
2. **Tối ưu `treasurySystem.ts`:**
   - Xuất thêm phương thức `hasActiveAnimations(): boolean` (trả về `true` khi `activeFlights.length > 0` hoặc bất kỳ khay kho bạc nào còn độ lệch nảy `Math.abs(recoilOffset) > 0.001 || Math.abs(recoilVelocity) > 0.001`).
   - Xuất thêm phương thức `setQualityProfile(profile: GraphicsQualityProfile)` để bật/tắt `castShadow` & `receiveShadow` trên 4 `InstancedMesh` và các khay kho bạc, đồng thời ở mức `low` bỏ qua cập nhật `uTimeShared` liên tục khi không có tờ tiền nào đang bay.

---

## 6. Engine Chân Dung `PlayerAvatar3D` Chụp Cache Tĩnh (`PlayerAvatar3D.tsx`)

1. Bổ sung `setAvatarGraphicsTier(tier: GraphicsQualityTier)` trên `sharedAvatarEngine`:
   - **Mức `low` (Snapshot 3D Cache Tĩnh — `0 FPS`):**
     - Tạo kho lưu ảnh chụp `snapshotCache = new Map<string, HTMLCanvasElement>()` theo khóa `key = "${archetype}|${mood}|${isActive ? 1 : 0}|${facingSign}|${sizePx}"`.
     - Khi avatar mount hoặc đổi trạng thái (`key` thay đổi), nếu chưa có trong cache thì đặt nhân vật ở tư thế biểu cảm chuẩn (`blinkAmount = 0` để không bao giờ chụp trúng khoảnh khắc nhắm mắt), dựng **đúng 1 frame** trên `WebGLRenderer` ở kích thước `160×160`, lưu vào `snapshotCache` rồi vẽ ra `canvas2d` của thẻ người chơi.
     - Vòng lặp `requestAnimationFrame` của `sharedAvatarEngine` **dừng hoàn toàn (`0 FPS`)**, loại bỏ 100% chi phí `ctx2d.drawImage` mỗi frame nhưng vẫn giữ nguyên diện mạo nhân vật 3D sắc nét.
   - **Mức `medium` (`15 FPS`) & `high` (`30 FPS`):**
     - Điều tiết chu kỳ `tick()` theo ngưỡng thời gian (`66ms` cho `15 FPS`, `33ms` cho `30 FPS`), cập nhật kích thước buffer `192×192` (`medium`) hoặc `256×256` (`high`).
     - Tự động tạm dừng vòng lặp khi `document.hidden === true` và tiếp tục khi tab hiển thị lại.

---

## 7. Giao Diện Chọn Đồ Họa & Cách Ly Re-render React

1. **Component `src/components/GraphicsQualityPicker.tsx`:**
   - Gồm 4 nút bấm trực quan đồng bộ bảng màu Business Tour:
     - `⚡ Tự động` (`auto`)
     - `🌱 Thấp` (`low`)
     - `⚖️ Vừa` (`medium`)
     - `✨ Cao` (`high`)
   - Hiển thị dòng trạng thái nhỏ gọn bên cạnh tiêu đề (ví dụ: `Đang áp dụng: Thấp · Card Onboard` khi ở chế độ `Tự động`) để người chơi biết rõ máy mình đang chạy mức nào.
   - Tích hợp vào cột **Thiết Lập Bàn Đấu** của `StartModal.tsx` và hộp thoại **Âm Thanh & Tuỳ Chỉnh** (`bt-settings-popover`) của `ActionDock.tsx`.
2. **Cách ly Re-render mỗi giây trong `App.tsx`, `PlayerHUD.tsx`, `ActionDock.tsx`:**
   - Bọc `React.memo` cho `PlayerCornerCard`, `PlayerHUD` và `ActionDock`.
   - Ổn định toàn bộ các prop hàm truyền từ `App.tsx` xuống `PlayerHUD` và `ActionDock` bằng `useCallback` (bao gồm `onToggleSound`, `onOpenPause`, `onOpenAssetsModal`, `onOpenRulebook`, `onResetCamera`, `onChangeSpeed`) để nhịp đếm ngược `turnTimeLeft` mỗi giây chỉ cập nhật mặt đồng hồ số 3D giữa sân mà không kéo 4 thẻ HUD hay thanh công cụ vẽ lại DOM.

---

## 8. Xử Lý Biên & Tiêu Chí Kiểm Thử

1. **Xử lý biên:**
   - Đổi qua lại liên tục `Tự động` → `Cao` → `Thấp` → `Vừa` ngay giữa lượt lăn xúc xắc hoặc khi tiền đang bay: không rơi mất animation Promise, không rò rỉ `WebGLRenderTarget`, không đen màn hình.
   - Khi đang ở mức `Thấp` (`0 FPS` lúc nghỉ) mà font chữ tải xong bất đồng bộ (`whenAllGameFontsLoaded`), gọi `requestRender()` ngay sau khi cập nhật lại texture mặt ô đất để chữ sắc nét hiển thị tức thì.
2. **Kiểm thử tự động bắt buộc (TDD):**
   - `src/game/graphicsQuality.test.ts`:
     - Phân loại chính xác các chuỗi GPU thực tế: `ANGLE (Intel, Intel(R) UHD Graphics 620 ...)`, `Intel(R) Iris(R) Xe Graphics`, `AMD Radeon(TM) Graphics`, `NVIDIA GeForce RTX 3060`, `AMD Radeon RX 6600`, `Google SwiftShader`, và chuỗi ẩn `WebKit WebGL`.
     - Lưu, đọc và xử lý giá trị lỗi trong `localStorage` cho `GraphicsQualityPref`.
     - Đối chiếu bảng thông số `resolveGraphicsProfile` cho cả 3 mức `low`, `medium`, `high` và trường hợp `isSoftwareGl = true`.
     - Kiểm tra hàm thuần `shouldKeepBoardAnimating` trả về đúng `true`/`false` cho mọi tổ hợp trạng thái chuyển động và che khuất màn hình.
   - Toàn bộ suite `npm test`, `npm run lint` (`tsc --noEmit`) và `npm run build` đạt `100%` pass.
   - Kiểm thử trực quan trên trình duyệt tại `localhost`: xác nhận chọn đổi mượt cả 4 nút đồ họa ở Phòng chờ & Cài đặt trong trận, bàn cờ ngủ `0 FPS` khi mở Phòng chờ hoặc đứng yên ở mức `Thấp`, bung mượt khi đổ xúc xắc/xoay chuột, `0` lỗi Console và `0` cảnh báo WebGL.
