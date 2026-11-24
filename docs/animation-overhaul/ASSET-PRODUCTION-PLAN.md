# ASSET PRODUCTION PLAN — Pipeline Blender 4.5.16 LTS (.glb) + Procedural Hybrid

- **Ngày lập:** 2026-11-24 · **Nhánh:** `feature/3d-animation-overhaul` (Baseline `68c8d50`)
- **Công cụ sản xuất đã xác minh live trên máy:** **Blender `4.5.16 LTS`** kết nối qua `MCP for Blender` v2.0 (protocol 16, `execute_code` + `get_scene_info` + `look`), kết xuất glTF 2.0 nhị phân (`.glb`) và nạp ở runtime bằng Three.js `GLTFLoader` + `THREE.AnimationMixer` (`three ^0.187.0`).

---

## 1. Phân Ranh Giới Sản Xuất Asset (Hybrid D1)

| Hạng mục 3D | Công cụ sản xuất | Lý do kỹ thuật |
|---|---|---|
| **4 Nhân Vật Quân Cờ Việt Nam** (`car` CEO Minh Khôi, `yacht` Chủ Tịch Lan Anh, `jet` Shark Hoàng Nam, `crown` Phu Nhân Ngọc Diệp) | **Blender 4.5 + Blender MCP → `.glb`** | Cần rig xương keyframe NLA mượt mà (nhún đà nhảy, vung tay ăn mừng, co vai ở Đảo Hoang, gục đầu phá sản, múa chiến thắng) mà `mergeGroupMeshesByMaterial` hiện tại đang làm đông cứng (`models.ts:892`). |
| **Cúp Vàng & Bục Vinh Quang Kết Trận** (`trophy_podium.glb`) | **Blender 4.5 + Blender MCP → `.glb`** | Đạo cụ trung tâm có tạo hình bậc vinh danh 2 vị trí (hỗ trợ cả Solo và `2v2`) + Cúp xoay mở nắp lấp lánh nhẹ gọn trong 1 file `.glb`. |
| **24 Cụm Công Trình Vùng Miền, Xúc Xắc `cannon-es`, Kho Bạc `InstancedMesh`, Sân Giữa & Vòm Khiên/Thẻ** | **Procedural Three.js + GSAP (Giữ tại `models.ts` / `treasurySystem.ts`)** | Các thành phần này thay đổi màu chủ sở hữu động (`setOwnerTint`), dùng chung geometry tĩnh và `InstancedMesh`; giữ trong Three.js cho draw call thấp nhất (`<= 3–4` calls) và 0 KB tải mạng thêm. |
| **4 Chân Dung Góc HUD (`PlayerAvatar3D.tsx`)** | **Giữ nguyên Procedural Offscreen Engine** | Mức `Low` chụp snapshot tĩnh `0 FPS` rất tối ưu; chỉ batch lại mesh trong `Wave 7` để hạ `4,220` draws/s ở `Medium`/`High`. |

---

## 2. Thiết Kế Bộ Xương Thống Nhất (Unified Chibi Armature — `<= 12` Bones)

Cả 4 nhân vật dùng **cùng một cấu trúc xương và tên xương chuẩn** để chia sẻ **duy nhất 1 bộ 12 `AnimationClip`** (giảm mạnh dung lượng tệp `.glb` và đảm bảo đồng nhất nhịp thời gian giữa 4 người chơi):

```text
root (0, 0, 0)
├── pedestal_bone       # Đế vàng + phương tiện đặc trưng (Siêu xe / Du thuyền / Chuyên cơ / Vương miện) — nghiêng độc lập khi cua góc!
└── hips (y = 0.22)
    ├── leg_L           # Chân trái (pivot hông)
    ├── leg_R           # Chân phải (pivot hông)
    └── spine (y = 0.42)
        ├── head        # Đầu + tóc + phụ kiện đầu (vương miện/kính)
        ├── arm_L       # Tay trái
        └── arm_R       # Tay phải
            └── prop_R  # Điểm gắn đạo cụ nhỏ (cặp táp / quạt / mic / trượng)
```

- **Tổng số xương:** **9 xương chính** (`root`, `pedestal_bone`, `hips`, `leg_L`, `leg_R`, `spine`, `head`, `arm_L`, `arm_R`, `prop_R` = 10 nút nếu tính `root` + `prop_R`, nằm gọn trong giới hạn `< 12` xương).
- **Kỹ thuật gắn da nhẹ tối ưu iGPU (Rigid-Bone / Single-Weight Skinning):** Mỗi bộ phận Low-Poly gắn trọng số `1.0` vào 1 xương duy nhất (không pha 4-bone blending tốn ALU shader) → `SkinnedMesh` chạy cực nhanh trên GPU tích hợp, giữ đúng thẩm mỹ khối chibi sắc nét của `CHARACTER_PERSONAS`.
- **Tô màu theo `ownerColor`:** Sử dụng 1–2 vật liệu PBR chia sẻ tối đa (`suit_mat`, `skin_palette_mat`, `gold_accent_mat`) để giữ số mesh/vật liệu mỗi nhân vật ở mức **`<= 3–4` draw calls** (vượt chuẩn cũ `<= 10` trong `performanceAssets.test.ts:286`).

---

## 3. Ngân Sách Hình Học, Tọa Độ & 12 Clip NLA Trong Blender

### 3.1 Ngân Sách Topology & Vật Liệu (Trên Mỗi Asset)
| Asset | Đường kính đế (Three.js world units) | Tam giác tối đa (`Tris`) | Số xương (`Bones`) | Số vật liệu (`Materials`) | Kích thước file `.glb` mục tiêu |
|---|---|---|---|---|---|
| `pawn_car.glb` (CEO Minh Khôi) | `0.78` (`r = 0.39`) | `<= 1,700` | `10` | `<= 4` | `<= 45 KB` |
| `pawn_yacht.glb` (Chủ Tịch Lan Anh) | `0.78` | `<= 1,750` | `10` | `<= 4` | `<= 48 KB` |
| `pawn_jet.glb` (Shark Hoàng Nam) | `0.78` | `<= 1,750` | `10` | `<= 4` | `<= 48 KB` |
| `pawn_crown.glb` (Phu Nhân Ngọc Diệp) | `0.78` | `<= 1,800` | `10` | `<= 4` | `<= 50 KB` |
| `trophy_podium.glb` (Bục & Cúp) | `2.6 × 1.5` | `<= 1,200` | `3` | `<= 3` | `<= 30 KB` |
| **Tổng cộng cả 5 file `.glb`** | — | — | — | — | **`<= 221 KB` (chưa nén gzip)** |

> **Chiến lược nén tối ưu:** Vì toàn bộ màu sắc sử dụng **Vertex Colors / 64×64 Palette Atlas nhỏ + thuộc tính PBR thuần** (không cần texture ảnh 2K), dung lượng cả 5 file `.glb` chỉ **`~160–220 KB`** (`~70–95 KB` qua HTTP gzip). Do đó **KHÔNG cần nhúng bộ giải mã Draco WASM (~180–220 KB JS/WASM phụ)** giúp thời gian giải mã trên trình duyệt gần như tức thì (`< 15ms`).

### 3.2 Danh Mục 12 `AnimationClip` (Export NLA Tracks @ `30 fps`)
1. `idle_loop` (`2.4s`, lặp): Thở nhẹ trên `spine`, gật nhẹ `head`, bập bềnh `pedestal_bone`.
2. `anticipation` (`0.12s`, clamp): Hạ `hips`, chùn gối nhẹ, hơi ngả `spine` về trước.
3. `hop_takeoff` (`0.10s`, clamp): Bật thẳng `leg_L`/`leg_R`, vươn `spine`, tay đánh lấy đà.
4. `hop_airborne` (`0.20s`, lặp/clamp): Co chân trên không, nghiêng `spine` hướng tiến.
5. `hop_land` (`0.14s`, clamp): Tiếp đất nén nhẹ `hips`, vung nhẹ 2 tay giữ thăng bằng.
6. `corner_bank` (`0.20s`, clamp): Nghiêng cả `pedestal_bone` + `hips` vào góc cua `±10°`.
7. `celebrate_short` (`0.65s`, once): Nhảy nhẹ + giơ `arm_L`/`arm_R` hình chữ V vui mừng.
8. `proud_gesture` (`0.55s`, once): Chống nạnh `arm_L`, giơ `prop_R` gật đầu tự hào.
9. `stressed_slump` (`0.60s`, once): Rụt vai, `head` lắc nhẹ sang hai bên, người hơi ngả lùi.
10. `jailed_loop` (`2.0s`, lặp): Khoanh tay/tựa `hips`, `head` ngó nghiêng trái phải lo âu.
11. `victory_dance` (`2.2s`, lặp): Nhảy nhịp điệu 2 bước kết hợp vung tay chiến thắng trên bục.
12. `defeat_slump` (`0.90s`, clamp): Quỵ nhẹ `hips`, cúi gục `head` và hạ thấp 2 tay.

---

## 4. Quy Trình Dựng & Kiểm Chứng Qua Blender MCP (`4.5.16 LTS`)

Mọi asset được tạo bằng kịch bản Python `bpy` có kiểm soát 100% thông qua `blender` MCP (không dùng generator hay tải ngoài):
1. **Quy ước trục:** Dựng nhân vật hướng mặt về **`-Y` (Blender Front)** và trục đứng **`+Z` Up**, chân đế đặt chính xác tại `z = 0.0`.
2. **Dựng & Rig bằng `execute_blender_code`:** Tạo mesh đối xứng sạch (100% quads/tris kín, không non-manifold, không ngons), gán vertex group chuẩn tên xương, đặt `NLA Tracks` cho đủ 12 clip.
3. **Kiểm tra chất lượng bắt buộc ngay trong Blender:**
   - Gọi `get_scene_info(fields=["placement", "contents", "health", "animation"])` xác nhận `ngons = 0`, `non_manifold = 0`, `unweighted_verts = 0`, đúng `<= 1,800` tris và đúng danh sách 12 clip.
   - Gọi `look` ở 3 góc (Front Isometric, Side, Top) chụp kiểm tra trực quan tỷ lệ đầu/thân/bệ xe/thuyền/máy bay/vương miện.
4. **Cờ xuất glTF 2.0 chuẩn cho Three.js (đã xác minh tồn tại trên Blender 4.5.16 LTS):**
   ```python
   bpy.ops.export_scene.gltf(
       filepath=out_path,
       export_format='GLB',
       export_yup=True,                   # Chuyển +Z Up -> +Y Up, -Y Front -> +Z Forward của Three.js
       export_apply=True,
       export_animations=True,
       export_animation_mode='NLA_TRACKS',
       export_def_bones=True,
       export_optimize_animation_size=True,
       export_skins=True,
       export_image_format='NONE'         # Pure PBR + Vertex Color / Material slots -> kích thước siêu nhỏ
   )
   ```

---

## 5. Runtime Loading (`GltfAssetPool`), Fallback & Giải Phóng Tài Nguyên

- **Nơi lưu trữ asset:** `public/assets/models/*.glb` (tải bất đồng bộ qua `GLTFLoader` không tính vào bundle JS `index-*.js`, caching qua HTTP và `GltfAssetPool` singleton).
- **Zero-Flash Procedural Fallback:** Khi trận đấu vừa mở nếu `.glb` chưa tải xong (hoặc khi chạy trong Node unit test `performanceAssets.test.ts` không có fetch HTTP), `MonopolyCanvas` gắn ngay mesh từ `createPlayerTokenMesh` ở `t = 0ms`. Khi `GltfAssetPool` tải xong, tráo nhân vật tại chỗ đúng tọa độ/hướng xoay và gọi `disposeTokenGroup` cho mesh tạm cũ.
- **Clone & Dispose An Toàn:**
  - Dùng `SkeletonUtils.clone` (từ `three/addons/utils/SkeletonUtils.js`) để nhân bản từ template cache (giữ nguyên `BufferGeometry` dùng chung trên GPU, chỉ nhân bản skeleton matrix).
  - Không bao giờ `dispose()` `BufferGeometry` dùng chung của `GltfAssetPool` khi từng nhân vật bị ẩn/đổi màu; chỉ giải phóng `AnimationMixer.uncacheRoot()` khi unmount.
