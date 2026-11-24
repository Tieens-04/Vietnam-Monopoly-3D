# Đặc Tả Thiết Kế (Design Spec) — Nâng Cấp Chế Độ Chơi Online Với Bạn Bè (3 Đợt)

- **Ngày lập**: 2026-11-24
- **Dự án**: `cờ-tỷ-phú-3d-việt-nam`
- **Kiến trúc tổng thể**: WebRTC P2P Mesh qua WebSocket `/ws` sẵn có + Định danh `participantId` thống nhất tại `OnlineRoomManager` (Phương án 1 đã duyệt).
- **Phạm vi triển khai**: Lộ trình gồm **3 Đợt độc lập, nối tiếp nhau**, có thể lập kế hoạch và triển khai cuốn chiếu từng đợt mà không phá vỡ tương thích ngược của ván đấu Online hiện tại.

---

## 1. Mục Tiêu & Các Quyết Định Thiết Kế Đã Chốt (`/grill-me`)

Mục tiêu là nâng cấp chế độ chơi Online từ mức "chơi được cùng nhau" lên trải nghiệm **tụ tập hội bạn trọn vẹn** (giao tiếp mượt mà, lập phòng linh hoạt, đón bạn vào trễ không gián đoạn, tương tác 3D cà khịa vui nhộn và vinh danh chuỗi trận).

| Đợt | Trọng tâm phân hệ | Các quyết định đã chốt |
| :--- | :--- | :--- |
| **Đợt 1** | **Giao tiếp Phòng (Chat chữ & Voice Chat WebRTC)** | - **Voice Chat**: Mặc định **Tắt Mic** khi vào phòng; hỗ trợ cả **Open Mic** (1 chạm bật/tắt) lẫn **Push-to-Talk** (giữ phím `V` / giữ nút trên cảm ứng). **1 kênh Voice chung** toàn phòng (người chơi + khán giả nói chuyện như ngồi chung bàn), ai ồn tự Mute/chỉnh âm lượng cục bộ.<br>- **Text Chat**: Ngăn kéo thu gọn mở từ thanh nút phải (`ActionDock`) có chấm đỏ tin chưa đọc + bong bóng nổi `4s` cạnh Avatar góc màn hình (`PlayerHUD`) + khung chat trực tiếp trong Sảnh chờ & Màn kết thúc; hỗ trợ tab **Cả phòng (`ALL`)** và **Đội (`TEAM`)** trong `2v2`. |
| **Đợt 2** | **Quản lý Sảnh chờ, Khán giả & Thế chỗ Bot** | - **Đổi ghế & Xếp đội 2v2**: Giữ quy tắc ghế chẵn/lẻ xen kẽ (`seatIndex % 2`) cho lượt đi công bằng; bấm ghế trống để nhảy sang ngay, bấm ghế có người để gửi lời mời đổi chỗ (`15s`), Chủ phòng được hoán đổi trực tiếp 2 ghế bất kỳ.<br>- **Ready & Quyền Chủ phòng**: Khách bắt buộc bấm **Sẵn sàng** mới mở nút Bắt đầu (tự đặt lại nếu Chủ phòng đổi luật); bổ sung **Kick**, **Chuyển Chủ phòng** và chọn **Độ khó Bot AI** (`easy` / `normal` / `hard`).<br>- **Khán giả & Hot-Join Bot**: Tối đa **4 Khán giả/phòng**; được xem 3D, chat/voice chung và bấm **Xin thế chỗ Bot** (Chủ phòng duyệt `20s`; chỉ cho ghế Bot bù từ đầu hoặc ghế người cũ đã rời hẳn `explicitlyLeft`, tuyệt đối không chiếm ghế người đang mất mạng tạm thời). |
| **Đợt 3** | **Tương tác 3D, Ping Ô Đất & Chuỗi trận Vinh danh** | - **Vật phẩm ném 3D**: 4 vật phẩm đậm chất Việt Nam (**🩴 Dép tổ ong, 🍅 Cà chua, 🎉 Pháo giấy, 💸 Cọc tiền**) ném từ thẻ Avatar đối thủ bay parabol sang quân cờ 3D của họ; hồi chiêu `4s` và có công tắc tắt trong Cài đặt.<br>- **Ping ô đất 3D**: **Công khai cho toàn bàn** ở cả `FFA` và `2v2`; kích hoạt bằng `Alt+Click` / Chuột phải trên PC hoặc nút Ping trong hộp thoại thông tin ô đất trên Mobile (`🎯 Nhắm ô này`, `⚠️ Coi chừng`, `🏆 Đặt Cúp đây`).<br>- **Chuỗi trận & Vinh danh**: Lưu **Bảng điểm Chuỗi trận** theo phiên phòng (Cúp thắng + Điểm hạng, Chủ phòng reset được), tự tính `3–4` **Danh hiệu hài hước** cuối ván trên `VictoryModal`, kèm nút **Copy / Tải Ảnh Card Tổng Kết** (`1200 × 675` PNG). |

---

## 2. Nền Tảng Chung: Định Danh `RoomParticipant` Thống Nhất

### 2.1. Vấn đề hiện tại
Hiện tại `OnlineRoomManager` (`src/server/roomManager.ts`) quản lý con người theo `HumanSeatRecord` gắn chặt vào `seatIndex` (`0..3`) và chỉ nhận dạng bằng `sessionToken` bí mật (không được gửi ra cho các client khác). Khi bổ sung Voice P2P, Khán giả, Đổi ghế và Bảng điểm Chuỗi trận, cần một mã định danh công khai bền vững độc lập với số ghế.

### 2.2. Thiết kế `RoomParticipant`
- Mỗi thành viên khi `CREATE_ROOM` hoặc `JOIN_ROOM` được cấp một `participantId: string` công khai (ví dụ `p_${crypto.randomBytes(4).toString('hex')}`), tách biệt hoàn toàn với `sessionToken` bí mật.
- Cấu trúc bản ghi nội bộ trên server:

```ts
export type ParticipantRole = 'player' | 'spectator';
export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface RoomParticipantSummary {
  participantId: string;
  playerName: string;
  role: ParticipantRole;
  seatIndex: number | null;
  playerId: number | null;
  tokenType: TokenArchetype | null;
  connected: boolean;
  isHost: boolean;
  ready: boolean;
  micEnabled: boolean;
}
```

- `ROOM_JOINED` và `ROOM_SNAPSHOT` bổ sung `yourParticipantId: string` và mảng `participants: RoomParticipantSummary[]`.
- Khi thành viên đổi ghế, từ Khán giả lên thế chỗ Bot, hoặc tải lại trang (`RECONNECT_ROOM`), `participantId` **không đổi** → kết nối WebRTC P2P, lịch sử Chat và điểm Chuỗi trận được bảo toàn liên tục.

---

## 3. Đợt 1 — Hệ Thống Giao Tiếp Phòng: Chat Chữ & Voice Chat WebRTC

### 3.1. Kiến trúc Voice Chat P2P Mesh (`src/utils/voiceMeshClient.ts`)
- **Mô hình mạng**: WebRTC P2P Mesh ngang hàng thuần trình duyệt (`RTCPeerConnection`), chỉ truyền 1 track audio Opus (`~24–32 kbps`). Với tối đa `4` người chơi + `4` khán giả (`8` thành viên/phòng → tối đa `7` kết nối/máy), băng thông tải lên mỗi máy chỉ khoảng `~200 kbps`, hoàn toàn không làm tải nặng Node.js Server trên Render.
- **Bắt tay chống xung đột (Perfect Negotiation)**:
  - Với mọi cặp `(myParticipantId, remoteParticipantId)`, thành viên có `participantId` nhỏ hơn theo thứ tự từ điển đóng vai `polite = true`, thành viên còn lại đóng vai `polite = false`.
  - Khi nhận được `offer` đồng thời (glare), `polite peer` tự rollback local description và nhận offer mới; `impolite peer` bỏ qua offer xung đột.
- **Chính sách xin quyền Micro lịch sự**:
  - Khi vào phòng, mặc định `micEnabled = false`, **chưa gọi `navigator.mediaDevices.getUserMedia`**. Kết nối P2P vẫn được thiết lập ở chế độ `recvonly` để người dùng nghe thấy cả phòng nói chuyện ngay lập tức dù chưa bật mic (hoặc không có mic).
  - Chỉ khi bấm nút **Bật Mic** (hoặc giữ Push-to-Talk lần đầu), client mới xin quyền `{ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }`, gắn track vào các `RTCPeerConnection` hiện có và thực hiện renegotiation.
- **Hai chế độ điều khiển Mic (`src/components/VoiceControlBar.tsx`)**:
  - **Open Mic (mặc định)**: Bấm 1 chạm nút Micro để bật/tắt `audioTrack.enabled`.
  - **Push-to-Talk (PTT)**: Công tắc chuyển chế độ ngay trên popover Voice. Khi bật PTT, track audio mặc định `enabled = false`, chỉ mở khi người dùng giữ phím `V` (không kích hoạt khi đang gõ trong `<input>`/`<textarea>`) hoặc nhấn giữ nút Micro trên màn hình cảm ứng.
- **Chỉ báo đang nói & Âm lượng cục bộ**:
  - Client đo mức RMS trên `AnalyserNode` (`AudioContext`) cho cả mic cục bộ và luồng âm thanh nhận về từ từng peer (cập nhật theo chu kỳ `120ms`, ngưỡng lọc nhiễu nền) để vẽ **vòng sáng xanh lá** quanh Avatar tại `PlayerHUD` và `OnlineLobbyPanel`.
  - Mỗi thành viên có nút Mute cục bộ và thanh trượt âm lượng (`0%–100%`) cho từng peer khác, lưu theo `participantId` trong phiên.
- **Cấu hình ICE (STUN / TURN)**:
  - Bổ sung endpoint `GET /api/rtc-config` tại `src/server/appServer.ts`:
    - Mặc định trả về STUN miễn phí (`stun:stun.l.google.com:19302`, `stun:stun.cloudflare.com:3478`).
    - Nếu server có khai báo biến môi trường `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`, endpoint tự động gộp thêm cụm TURN vào `iceServers` để xuyên NAT đối xứng trên mạng 4G khắt khe.
- **Xử lý lỗi & An toàn ngữ cảnh**:
  - Nếu `window.isSecureContext === false` (ví dụ mở bằng IP LAN `http://192.168.x.x`), nút Mic tự chuyển sang trạng thái cảnh báo *"Cần HTTPS hoặc localhost để bật Micro"*, không văng ngoại lệ và vẫn cho phép dùng Chat chữ bình thường.
  - Nếu một cặp peer rơi vào trạng thái `failed` / `disconnected` quá `4s`, `polite peer` tự động kích hoạt `restartIce()`.

### 3.2. Giao thức WebSocket cho Đợt 1 (`src/game/onlineTypes.ts`)
- **Client → Server**:
  - `{ type: 'SEND_CHAT_MESSAGE'; channel: 'ALL' | 'TEAM'; text: string }`
  - `{ type: 'RTC_SIGNAL'; targetParticipantId: string; signal: { kind: 'offer' | 'answer'; sdp: string } | { kind: 'ice'; candidate: RTCIceCandidateInit } }`
  - `{ type: 'UPDATE_VOICE_STATE'; micEnabled: boolean }`
- **Server → Client**:
  - `ROOM_EVENT` / `GAME_EVENT` dạng `CHAT_MESSAGE`:
    ```ts
    export interface RoomChatMessage {
      id: number;
      participantId: string;
      playerId: number | null;
      senderName: string;
      senderColor: string;
      role: ParticipantRole;
      channel: 'ALL' | 'TEAM';
      teamId?: TeamId;
      text: string;
      createdAt: number;
    }
    ```
  - `{ type: 'RTC_SIGNAL'; fromParticipantId: string; signal: ... }` (chỉ gửi riêng tới `targetParticipantId` trong cùng phòng, kiểm tra chéo phòng nghiêm ngặt).

### 3.3. Text Chat đa màn hình (`src/components/OnlineChatDrawer.tsx`)
- **Chống spam & Bảo mật kênh Đội**:
  - Chuẩn hóa chuỗi, giới hạn tối đa `160` ký tự, bỏ tin rỗng, hồi chiêu `800ms`/tin nhắn mỗi client.
  - Phòng giữ tối đa `60` tin nhắn kênh `ALL` gần nhất trong `OnlineRoomSnapshot.chatHistory` (và `30` tin nhắn kênh `TEAM` cho từng đội, chỉ trả về cho thành viên thuộc đúng đội đó khi xây dựng snapshot cá nhân hóa).
  - Khi gửi `channel: 'TEAM'` trong `TEAMS_2V2` (và người gửi là `player` có `teamId`), server **chỉ phát bản tin tới các client cùng `teamId`**; phe đối thủ và Khán giả không nhận được dữ liệu. Nếu phòng không ở chế độ `TEAMS_2V2` hoặc người gửi là Khán giả, server tự động ép về `ALL`.
- **Trải nghiệm UI**:
  - **Trong trận**: Thêm nút Chat có badge số tin chưa đọc trên thanh công cụ phải `bt-right-utility-rail` (`src/components/ActionDock.tsx`), tích hợp sẵn các chip câu thoại nhanh tiếng Việt bên cạnh ô nhập chữ. Khi ngăn kéo Chat đang đóng, tin nhắn mới hiện **bong bóng chữ nổi `4s`** trên thẻ Avatar tương ứng ở `PlayerHUD.tsx` (tái sử dụng vị trí hiển thị gọn của `playerEmotes`).
  - **Sảnh chờ & Kết thúc ván**: Nhúng khung Chat gọn bên dưới/bên cạnh danh sách ghế trong `OnlineLobbyPanel.tsx` và trong `VictoryModal` (`TileModalAndDialogs.tsx`) để hội bạn trao đổi khi chờ đủ người và bàn tái đấu.

---

## 4. Đợt 2 — Quản Lý Sảnh Chờ, Đổi Phe 2v2, Khán Giả & Thế Chỗ Bot

### 4.1. Xếp ghế & Đổi phe 2v2 công bằng
- Quy luật đội hình `2v2` giữ nguyên `teamId = (seatIndex % 2) as TeamId` (Ghế `0, 2` là Đội A Xanh; Ghế `1, 3` là Đội B Đỏ) để đảm bảo lượt đi luân phiên giữa hai đội.
- **Các bản tin mới**:
  - `{ type: 'MOVE_TO_SEAT'; targetSeatIndex: number }` — chuyển ngay vào ghế trống ở trạng thái `lobby` (áp dụng cho cả người đang ngồi ghế khác lẫn Khán giả muốn lên ghế chơi).
  - `{ type: 'REQUEST_SEAT_SWAP'; targetSeatIndex: number }` — khách gửi lời mời đổi ghế với người đang ngồi ở `targetSeatIndex` (tồn tại tối đa `15s`, mỗi người chỉ có 1 lời mời đang chờ tại một thời điểm).
  - `{ type: 'RESPOND_SEAT_SWAP'; requestId: string; accept: boolean }` — người nhận bấm Đồng ý để hoán đổi `seatIndex` giữa hai bên.
  - `{ type: 'HOST_SWAP_SEATS'; seatA: number; seatB: number }` — Chủ phòng hoán đổi tức thì hai ghế bất kỳ trong `lobby`.
  - `{ type: 'MOVE_TO_SPECTATOR' }` — người đang ngồi ghế chủ động nhường ghế xuống làm Khán giả (nếu số Khán giả chưa đạt trần `4`).

### 4.2. Ready Check, Quyền Chủ phòng & Độ khó Bot AI
- **Ready Check (`{ type: 'SET_READY'; ready: boolean }`)**:
  - Trong `lobby`, Chủ phòng luôn tính là đã sẵn sàng; tất cả khách đang ngồi ghế và đang kết nối phải có `ready === true` thì nút **Bắt Đầu Ván Online** mới bật.
  - Khi Chủ phòng cập nhật bất kỳ luật phòng nào ảnh hưởng gameplay (`matchMode`, `maxPlayers`, `startingCash`, `fillBots`, `tacticalDiceEnabled`, `festivalEnabled`, `botDifficulty`), server tự động đặt `ready = false` cho tất cả khách và gửi thông báo log ngắn trong khung chat sảnh để khách xác nhận lại.
- **Quyền Chủ phòng**:
  - `{ type: 'TRANSFER_HOST'; targetParticipantId: string }`: Chuyển quyền Chủ phòng cho 1 thành viên đang ngồi ghế và đang kết nối.
  - `{ type: 'KICK_PARTICIPANT'; targetParticipantId: string }`: Đuổi người chơi hoặc khán giả khỏi phòng, gửi lỗi `KICKED_BY_HOST`, xóa khỏi `humans`/`spectators` và vô hiệu hóa `sessionToken` cũ. (Trong trận `playing`, nếu kick một người đang chơi, ghế của họ chuyển sang Bot AI với `explicitlyLeft = true` tương tự rời phòng chủ động).
- **Độ khó Bot AI (`botDifficulty: 'easy' | 'normal' | 'hard'`)**:
  - Mở rộng các hàm quyết định Bot trong `src/game/rules.ts` nhận tham số tùy chọn `difficulty: BotDifficulty = 'normal'`:
    - `easy` (*Tập sự*): Giữ ngưỡng tiền dự phòng cao hơn, xác suất mua đứt thấp, chỉ nâng cấp tối đa 2 nhà ở đầu trận và chọn mục tiêu thẻ phá hoại đơn giản.
    - `normal` (*Sành sỏi*): Giữ nguyên logic chiến thuật chuẩn hiện tại.
    - `hard` (*Cá mập*): Ưu tiên mạnh việc mua/mua đứt ô chặn hoàn thiện nhóm màu đối phương (kể cả đồng đội địch trong `2v2`), chọn mục tiêu Cúp Quốc Gia và thẻ Động đất/Mất điện vào thành phố có doanh thu kỳ vọng cao nhất của địch.

### 4.3. Khán giả (`Spectator`) & Xin thế chỗ Bot giữa trận (`Hot-Join Bot`)
- **Giới hạn & Luồng vào phòng**:
  - Hằng số `MAX_SPECTATORS_PER_ROOM = 4` (tổng tối đa `8` người kết nối/phòng để WebRTC Voice Mesh luôn ổn định).
  - Khi `JOIN_ROOM` vào một phòng đang `playing` (hoặc đang `lobby` nhưng đã đủ `maxPlayers` ghế người), thay vì trả lỗi `MATCH_ALREADY_STARTED` hoặc `ROOM_FULL`, server tự động đưa người mới vào danh sách `spectators` nếu `spectators.length < 4` (chỉ báo lỗi `ROOM_FULL` khi cả ghế lẫn 4 chỗ khán giả đều kín).
  - Nếu người dùng là Khán giả, `yourSeatIndex = null`, `yourPlayerId = null`, UI hiển thị thanh trạng thái *"👁️ Đang xem trực tiếp"* cùng Voice Bar và Chat Drawer.
- **Xin thế chỗ Bot (`REQUEST_BOT_TAKEOVER` / `RESPOND_BOT_TAKEOVER`)**:
  - **Quy tắc đủ điều kiện của `targetPlayerId`**:
    1. Trạng thái phòng là `playing` và `room.match` tồn tại.
    2. Nhân vật `player` chưa phá sản (`!player.bankrupt`) và `player.isBot === true`.
    3. Không có `HumanSeatRecord` nào gắn `playerId === targetPlayerId` với `explicitlyLeft === false` (nghĩa là chỉ chấp nhận **Bot bù từ đầu trận** hoặc **ghế người cũ đã bấm Rời Phòng hẳn**; tuyệt đối không xâm phạm ghế của người bạn vừa rớt mạng tạm thời đang chờ `RECONNECT_ROOM` / `RECLAIM_CONTROL`).
  - **Luồng duyệt 1 chạm**:
    - Khán giả gửi `{ type: 'REQUEST_BOT_TAKEOVER'; targetPlayerId: number }` → Server tạo yêu cầu có hạn `20s` gửi lên `snapshot.pendingTakeoverRequest` cho Chủ phòng.
    - Chủ phòng gửi `{ type: 'RESPOND_BOT_TAKEOVER'; requestId: string; accept: boolean }`.
    - Nếu `accept === true`:
      - Chuyển `RoomParticipant` từ `spectators` sang `humans` (tạo/cập nhật `HumanSeatRecord` với `seatIndex = targetPlayerId`, `playerId = targetPlayerId`).
      - Cập nhật `player.name = participant.playerName`, `player.isBot = false`, `player.onlineBotTakeover = false`, `player.onlineConnected = true`.
      - Nếu đúng lượt nhân vật đó đang chờ quyết định, hủy `botActionTimer` và gọi `ensureSubPhaseTimeFloor(room.match, 18)` để người mới có đủ thời gian xử lý.
      - Ghi log trận đấu và phát `ROOM_SNAPSHOT` mới.

---

## 5. Đợt 3 — Tương Tác 3D, Ping Ô Đất, Chuỗi Trận & Vinh Danh

### 5.1. Vật phẩm ném 3D "Cà khịa" (`src/three/tauntProjectiles.ts`)
- **4 loại vật phẩm (`BoardTauntKind`)**:
  - `slipper`: 🩴 Dép tổ ong (mesh tổ hợp đế cong + quai ngang có họa tiết lỗ tròn đặc trưng).
  - `tomato`: 🍅 Cà chua chín (cầu đỏ + cuống xanh + cụm giọt vỡ khi chạm đích).
  - `confetti`: 🎉 Pháo giấy chúc mừng (mảnh sắc màu tung tóe tại vị trí mục tiêu).
  - `cash_stack`: 💸 Cọc tiền buộc đai vàng bay xoay vòng.
- **Tuân thủ ngân sách hiệu năng iGPU**:
  - Tích hợp vào vòng đời của `SpecialEventEffects` (`src/three/specialEventEffects.ts`).
  - Khởi tạo trước cố định `4` slot vật phẩm bay trong Object Pool (`POOL_TAUNT_SLOTS = 4`), `0` lần gọi `new THREE.BufferGeometry()` hay `new THREE.Material()` trong lúc chơi.
  - Quỹ đạo bay parabol mượt `~0.65s` từ tọa độ bàn cờ của `fromPlayerId` sang `targetPlayerId`, kèm hiệu ứng âm thanh tổng hợp nhẹ từ `src/audio/soundEngine.ts`.
  - Tôn trọng `prefers-reduced-motion` và tùy chọn cá nhân **"Tắt hiệu ứng ném đồ 3D"** (lưu `localStorage`, đặt trong menu Cài đặt của `ActionDock.tsx`).
- **Giao thức & Chống spam**:
  - Client gửi `{ type: 'SEND_BOARD_TAUNT'; targetPlayerId: number; tauntKind: BoardTauntKind }` (từ nút tương tác nhanh trên thẻ `PlayerHUD` của người khác).
  - Server xác thực cả hai nhân vật đều tồn tại trong trận, người gửi không tự ném mình, áp dụng hồi chiêu `4000ms` mỗi client, rồi phát `GAME_EVENT` dạng `BOARD_TAUNT`.

### 5.2. Ping chỉ điểm ô đất 3D công khai
- **Giao thức**:
  - Client gửi `{ type: 'SEND_TILE_PING'; tileIndex: number; intent: 'TARGET' | 'DANGER' | 'TROPHY' }` (hồi chiêu `2500ms`/người).
  - Server xác thực `isValidTileIndex(tileIndex)` và phát `GAME_EVENT` dạng `TILE_PING` **công khai cho tất cả thành viên trong phòng** (cả `FFA` lẫn `2v2`).
- **Kích hoạt & Hiển thị**:
  - **PC**: `Alt + Click` hoặc Chuột phải trực tiếp lên ô đất 3D trên `MonopolyCanvas.tsx` (gửi nhanh mặc định `TARGET` hoặc vòng chọn nhanh).
  - **Mobile & PC**: Cụm 3 nút Ping nhanh (`🎯 Nhắm ô này`, `⚠️ Coi chừng`, `🏆 Đặt Cúp đây`) đặt ngay trong hộp thoại xem chi tiết ô đất (`TileModalAndDialogs.tsx`).
  - **Hiệu ứng 3D**: Tái sử dụng vòng sáng Object Pool (tối đa `4` ping đồng thời, `3.5s`) mang màu nhân vật người Ping dưới mặt ô đất + nhãn chữ nổi ngắn phía trên thành phố.

### 5.3. Thống kê Ván đấu, Danh hiệu Hài hước, Bảng điểm Chuỗi trận & Xuất ảnh Card
- **Bộ đếm `MatchStats` trên Server (`roomManager.ts`)**:
  - Theo dõi cho mỗi `playerId` trong `MatchRecord`:
    ```ts
    export interface PlayerMatchStats {
      jailVisits: number;
      maxSingleRentCollected: number;
      totalRentCollected: number;
      totalRentPaid: number;
      sabotageCount: number; // Mua đứt + Động đất + Mất điện
      worldTourFlights: number;
    }
    ```
  - Khi ván kết thúc (`GAME_OVER`), snapshot đính kèm `postMatchAwards: PostMatchAward[]`.
- **Hàm tính Danh hiệu thuần (`src/game/postMatchAwards.ts`)**:
  - Nhận `players`, `statsByPlayerId` và trả về tối đa `4` danh hiệu có chỉ số `> 0`:
    1. 🏝️ **Chúa Đảo Hoang** — `jailVisits` cao nhất (`>= 1`).
    2. 💰 **Trùm Thu Họ** — `maxSingleRentCollected` cao nhất (`>= 100_000`).
    3. 💣 **Thánh Phá Hoại** — `sabotageCount` cao nhất (`>= 1`).
    4. 💸 **Nhà Tài Trợ Vàng** — `totalRentPaid` cao nhất (`>= 100_000`) *(ưu tiên nếu khác người nhận Trùm Thu Họ; nếu không có thì xét ✈️ **Phượt Thủ Xuyên Việt** theo `worldTourFlights >= 1`)*.
- **Bảng điểm Chuỗi trận của Phòng (`seriesStandings`)**:
  - Lưu trên `RoomRecord` theo `participantId`:
    ```ts
    export interface SeriesStandingEntry {
      participantId: string;
      playerName: string;
      tokenType: TokenArchetype | null;
      wins: number;
      matchesPlayed: number;
      seriesPoints: number;
    }
    ```
  - Công thức cộng điểm mỗi khi hoàn tất 1 ván:
    - `FFA`: Hạng 1..4 lần lượt nhận `4 / 3 / 2 / 1` điểm; hạng 1 được `+1` Cúp thắng (`wins`).
    - `TEAMS_2V2`: Thành viên phe thắng nhận `+3` điểm và `+1` Cúp thắng; phe thua nhận `+1` điểm.
  - Điểm được giữ nguyên khi bấm `RETURN_TO_LOBBY` để chơi ván tiếp theo; hiển thị gọn ở cả `OnlineLobbyPanel.tsx` lẫn `VictoryModal`. Chủ phòng có nút `{ type: 'RESET_SERIES_SCORE' }` để xóa bảng điểm khi bắt đầu chầu mới.
- **Xuất ảnh Card Tổng kết (`src/utils/victoryCardExport.ts`)**:
  - Hàm thuần vẽ lên `HTMLCanvasElement` kích thước `1200 × 675` (tỷ lệ `16:9` hiển thị sắc nét trên Zalo, Messenger, Discord) gồm: tiêu đề Cờ Tỷ Phú 3D Việt Nam + mã phòng, Nhà Vô Địch & bảng xếp hạng tài sản, cụm huy hiệu Danh hiệu hài hước, và Top Chuỗi trận phiên chơi.
  - Cung cấp 2 nút trên `VictoryModal`: **📋 Copy Ảnh** (dùng `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`, tự fallback sang tải file nếu trình duyệt không hỗ trợ Clipboard ảnh) và **⬇️ Tải Ảnh PNG**.

---

## 6. Chiến Lược Kiểm Thử & Đảm Bảo Chất Lượng

Mỗi đợt đều phải đi kèm bộ kiểm thử tự động và chạy qua `npm run lint`, `npm test`, `npm run build` trước khi khép lại:

1. **Đợt 1**:
   - `src/server/roomManager.test.ts`: kiểm tra cấp `participantId` ổn định qua `RECONNECT_ROOM`, định tuyến `RTC_SIGNAL` đúng đích và chặn gửi chéo phòng, lọc bảo mật tin nhắn kênh `TEAM` (đối thủ và khán giả không nhận được), giới hạn độ dài & rate-limit chat.
   - `src/utils/voiceMeshClient.test.ts`: kiểm tra phân vai `polite/impolite`, trạng thái Open Mic / Push-to-Talk, fallback khi không có `isSecureContext` hoặc bị từ chối quyền Micro.
   - `e2e/`: kịch bản 2 tab gửi nhận chat ở Sảnh chờ và Trong trận, kiểm tra bong bóng nổi trên `PlayerHUD`.
2. **Đợt 2**:
   - `src/server/roomManager.test.ts`: kiểm tra `MOVE_TO_SEAT`, `REQUEST_SEAT_SWAP` hết hạn `15s`, `HOST_SWAP_SEATS`, chặn `START_MATCH` khi khách chưa Ready, tự reset Ready khi Host đổi luật, giới hạn 4 Khán giả, và `REQUEST_BOT_TAKEOVER` (cho phép thế Bot bù/người đã rời hẳn, từ chối chiếm ghế người mất mạng tạm thời).
   - `src/game/rules.test.ts`: kiểm tra hành vi phân tầng của `botDifficulty` (`easy` / `normal` / `hard`).
3. **Đợt 3**:
   - `src/game/postMatchAwards.test.ts`: kiểm tra chọn đúng 3–4 danh hiệu, xử lý hòa điểm và bỏ qua danh hiệu có giá trị `0`.
   - `src/server/roomManager.test.ts`: kiểm tra cộng dồn `seriesStandings` qua nhiều ván + `RESET_SERIES_SCORE`, rate-limit `SEND_BOARD_TAUNT` (`4s`) và `SEND_TILE_PING` (`2.5s`).
   - `src/three/specialEventEffects.test.ts`: kiểm tra Object Pool 4 vật phẩm ném & 4 vòng Ping không rò rỉ bộ nhớ, chạy an toàn dưới `reducedMotion` và `low` quality tier.

---

## 7. Trình Tự Triển Khai Đề Xuất

Để mỗi bước đều gọn gàng, kiểm chứng được ngay và không làm gián đoạn nhánh chính, quá trình thực thi sẽ tách thành **3 Kế hoạch triển khai (Implementation Plans)** nối tiếp:
1. **Kế hoạch Đợt 1**: Định danh `participantId` + Text Chat đa màn hình + Voice Chat WebRTC Mesh.
2. **Kế hoạch Đợt 2**: Quản lý Sảnh chờ (Đổi ghế 2v2, Ready, Kick/Host, Độ khó Bot) + Khán giả & Xin thế chỗ Bot.
3. **Kế hoạch Đợt 3**: Vật phẩm ném 3D + Ping ô đất 3D + Bảng điểm Chuỗi trận, Danh hiệu cuối ván & Xuất ảnh Card PNG.
