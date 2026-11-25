# Đợt 1 — Định Danh `participantId`, Text Chat Đa Màn Hình & Voice Chat WebRTC Mesh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm định danh `participantId` bền vững trong phòng Online, hệ thống Text Chat xuyên suốt Lobby / Trong trận / Màn kết thúc (hỗ trợ kênh riêng `TEAM` cho 2v2), và Voice Chat P2P Mesh WebRTC mặc định tắt mic (hỗ trợ Open Mic & Push-to-Talk).

**Architecture:** `OnlineRoomManager` cấp `participantId` công khai tách rời `sessionToken` bí mật, định tuyến `RTC_SIGNAL` nội phòng và lọc bảo mật kênh `TEAM` theo `teamId` khi phát event và khi dựng `OnlineRoomSnapshot`. Trình duyệt chạy `VoiceMeshClient` theo mẫu Perfect Negotiation (so sánh từ điển `participantId`) kết hợp `GET /api/rtc-config` (STUN mặc định + TURN tùy chọn) và tách gọn UI vào `VoiceControlBar` + `OnlineChatDrawer`.

**Tech Stack:** TypeScript, Node `node:test` + `tsx`, Express (`appServer.ts`), `ws` (`wsServer.ts`), WebRTC (`RTCPeerConnection` + Web Audio `AnalyserNode`), React 19 + Tailwind CSS v4, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-24-online-friends-social-lobby-design.md` (Mục 2, Mục 3, Mục 6.1)

## Global Constraints

- Không cài thêm thư viện ngoài cho Voice Chat hay Chat (thuần WebRTC API + Web Audio API + WebSocket `/ws` sẵn có).
- `participantId` phải tách biệt hoàn toàn khỏi `sessionToken`; không bao giờ gửi `sessionToken` của người chơi khác qua snapshot hoặc event.
- Voice Chat mặc định `micEnabled = false` khi vào phòng và **không** gọi `getUserMedia` tự động lúc join; người không có mic vẫn nghe được cả phòng ở chế độ `recvonly`.
- Text Chat tối đa `160` ký tự/tin, hồi chiêu `800ms`/client, giữ tối đa `60` tin `ALL` và `30` tin `TEAM`/đội trong phòng; tin kênh `TEAM` tuyệt đối không lọt sang phe đối thủ hoặc Khán giả.
- Mọi thay đổi phải vượt qua `npm run lint`, `npm test`, và `npm run build` trước khi hoàn tất đợt.

## Review Focus

- `Permissions-Policy` tại `src/server/appServer.ts:340` hiện đang đặt `microphone=()` — phải đổi thành `microphone=(self)` nếu không mọi trình duyệt sẽ chặn `getUserMedia` kể cả trên HTTPS/localhost.
- `wsServer.ts:10` giới hạn `40` message / `5s` — khi 8 người kết nối WebRTC mesh đồng thời, burst ICE candidate trickle có thể vượt `40` msg và làm server đá socket (`1008`); phải tách hạn mức riêng cho `RTC_SIGNAL` (`120` / `5s`) và nâng `MAX_WS_PAYLOAD_BYTES` lên `32 * 1024`.
- Mở game qua IP LAN `http://192.168.x.x` (`window.isSecureContext === false`) không được ném exception khi khởi tạo `VoiceMeshClient`; nút Mic phải hiển thị cảnh báo *"Cần HTTPS hoặc localhost để bật Micro"* và Chat chữ vẫn hoạt động bình thường.
- Push-to-Talk phím `V` không được kích hoạt khi con trỏ đang gõ trong `<input>`, `<textarea>`, hoặc `[contenteditable="true"]` (ví dụ khi đang gõ Chat hoặc đổi tên ở Lobby).
- Khi khách `RECONNECT_ROOM` trong trận `2v2`, `snapshot.chatHistory` chỉ được chứa tin `ALL` và tin `TEAM` của đúng đội mình (không chứa tin `TEAM` của đội địch).

---

## File Structure

- Modify: `src/game/onlineTypes.ts` — thêm `ParticipantRole`, `RoomParticipantSummary`, `RoomChatMessage`, `RtcSignalPayload`, các message `SEND_CHAT_MESSAGE`, `RTC_SIGNAL`, `UPDATE_VOICE_STATE`, và mở rộng `ROOM_JOINED` / `ROOM_SNAPSHOT` / `OnlineRoomSnapshot` / `OnlineVisualEvent`.
- Modify: `src/server/roomManager.ts` — cấp `participantId` ổn định, lưu bộ đệm chat `ALL`/`TEAM`, xử lý `SEND_CHAT_MESSAGE`, `RTC_SIGNAL`, `UPDATE_VOICE_STATE`, cá nhân hóa `buildRoomSnapshot` theo người nhận.
- Modify: `src/server/wsServer.ts` — nâng `MAX_WS_PAYLOAD_BYTES` lên `32 * 1024` và cấp hạn mức rate-limit riêng `120 / 5s` cho `RTC_SIGNAL`.
- Modify: `src/server/appServer.ts` — đổi `Permissions-Policy` thành `microphone=(self)` và thêm `GET /api/rtc-config`.
- Create: `src/utils/voiceMeshClient.ts` — quản lý WebRTC P2P Mesh, Perfect Negotiation, lazy `getUserMedia`, Open Mic / PTT, RMS speaking detector, local per-peer mute/volume, ICE restart `4s`.
- Create: `src/utils/voiceMeshClient.test.ts` — unit test cho `VoiceMeshClient` với mock `RTCPeerConnection`.
- Modify: `src/utils/onlineClient.ts` — lưu `yourParticipantId`, `chatMessages`, `unreadChatCount`, thêm `sendChatMessage`, `sendRtcSignal`, `updateVoiceState`, và subscriber cho `RTC_SIGNAL` + `CHAT_MESSAGE`.
- Create: `src/components/VoiceControlBar.tsx` — nút Mic (Open Mic / PTT + phím `V`), popover danh sách thành viên kèm mute cục bộ & thanh trượt âm lượng `0%–100%`.
- Create: `src/components/OnlineChatDrawer.tsx` — UI Chat dùng chung ở 2 chế độ (`variant: 'drawer' | 'embedded'`), tab `ALL` / `TEAM`, chip câu thoại nhanh tiếng Việt, đếm `160` ký tự.
- Modify: `src/components/ActionDock.tsx` — nút Chat có badge đỏ chưa đọc trên `bt-right-utility-rail` + nhúng `VoiceControlBar`.
- Modify: `src/components/PlayerHUD.tsx` — vòng sáng xanh lá quanh Avatar khi đang nói + bong bóng chữ chat nổi `4s` khi ngăn kéo Chat đang đóng.
- Modify: `src/components/OnlineLobbyPanel.tsx` — nhúng `VoiceControlBar` + `OnlineChatDrawer` (`embedded`) và vòng sáng nói chuyện trên danh sách ghế.
- Modify: `src/components/TileModalAndDialogs.tsx` — nhúng khung `OnlineChatDrawer` (`embedded`) gọn trong `VictoryModal` khi `isOnlineMatch`.
- Modify: `src/App.tsx` — nối `VoiceMeshClient`, trạng thái `chatDrawerOpen`, bong bóng chat `4s`, và props mới tới các component.
- Modify: `src/server/roomManager.test.ts`, `src/utils/onlineClient.test.ts`, Create: `e2e/online-chat-voice.spec.ts`.

---

### Task 1: Unified `RoomParticipant` Identity & Phase 1 Protocol Types

**Files:**
- Modify: `src/game/onlineTypes.ts:18-223`
- Modify: `src/server/roomManager.ts:147-226, 390-487, 540-775`
- Test: `src/server/roomManager.test.ts`

**Interfaces:**
- Produces in `src/game/onlineTypes.ts`:
  - `export type ParticipantRole = 'player' | 'spectator';`
  - `export interface RoomParticipantSummary { participantId: string; playerName: string; role: ParticipantRole; seatIndex: number | null; playerId: number | null; tokenType: TokenArchetype | null; connected: boolean; isHost: boolean; ready: boolean; micEnabled: boolean; }`
  - `export type ChatChannel = 'ALL' | 'TEAM';`
  - `export interface RoomChatMessage { id: number; participantId: string; playerId: number | null; senderName: string; senderColor: string; role: ParticipantRole; channel: ChatChannel; teamId?: TeamId; text: string; createdAt: number; }`
  - `export type RtcSignalPayload = { kind: 'offer' | 'answer'; sdp: string } | { kind: 'ice'; candidate: RTCIceCandidateInit };`
  - `OnlineRoomSnapshot` bổ sung `participants: RoomParticipantSummary[]` và `chatHistory: RoomChatMessage[]`.
  - `ROOM_JOINED` & `ROOM_SNAPSHOT` bổ sung `yourParticipantId: string` và đổi `yourSeatIndex: number | null`.
  - `ClientToServerMessage` bổ sung `SEND_CHAT_MESSAGE`, `RTC_SIGNAL`, `UPDATE_VOICE_STATE`.
  - `ServerToClientMessage` bổ sung `{ type: 'RTC_SIGNAL'; fromParticipantId: string; signal: RtcSignalPayload }` và `OnlineVisualEvent` bổ sung `{ eventSeq: number; kind: 'CHAT_MESSAGE'; message: RoomChatMessage }`.

- [ ] **Step 1: Write failing test for stable `participantId` across join and reconnect**

Thêm test vào `src/server/roomManager.test.ts`:
```ts
test('Participant identity: stable participantId across CREATE_ROOM, JOIN_ROOM, and RECONNECT_ROOM without leaking sessionToken', () => {
  // Tạo phòng c1, c2 join -> kiểm tra created.yourParticipantId khớp /^p_[0-9a-f]{8}$/
  // Kiểm tra created.snapshot.participants có 2 mục, không chứa chuỗi sessionToken của c1 hay c2
  // Ngắt kết nối c2 rồi RECONNECT_ROOM bằng sessionToken -> yourParticipantId giữ nguyên tuyệt đối
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: FAIL vì `yourParticipantId` và `snapshot.participants` chưa tồn tại.

- [ ] **Step 3: Extend `src/game/onlineTypes.ts` and `src/server/roomManager.ts`**

- Cập nhật `src/game/onlineTypes.ts` với đầy đủ các type/interface ở mục Produces.
- Trong `src/server/roomManager.ts`:
  - Thêm `participantId: string`, `ready: boolean`, `micEnabled: boolean` vào `HumanSeatRecord` (giá trị tạo mới `p_${crypto.randomBytes(4).toString('hex')}`, mặc định `micEnabled: false`, `ready: true` cho host và `ready: false` cho khách để sẵn sàng cho Đợt 2).
  - Bổ sung `buildParticipantsList(room: RoomRecord): RoomParticipantSummary[]` và đính kèm `participants` + `chatHistory` vào `buildRoomSnapshot(room, recipientParticipantId?)`.
  - Trả `yourParticipantId` trong mọi lệnh gửi `ROOM_JOINED` và `ROOM_SNAPSHOT` (`broadcastSnapshot` gửi riêng từng thành viên với `yourParticipantId` của họ).

- [ ] **Step 4: Run test and typecheck to verify pass**

Run: `npx tsx --test src/server/roomManager.test.ts && npm run lint`
Expected: PASS (cập nhật các chỗ destructuring `yourSeatIndex` trong `src/utils/onlineClient.ts` nếu TypeScript báo `number | null`).

- [ ] **Step 5: Commit**

```bash
git add src/game/onlineTypes.ts src/server/roomManager.ts src/server/roomManager.test.ts src/utils/onlineClient.ts
git commit -m "feat(online): add unified participantId and phase 1 chat/rtc protocol types"
```

---

### Task 2: Server Text Chat (`ALL`/`TEAM`), `RTC_SIGNAL` Routing & WS Rate-Limit Budget

**Files:**
- Modify: `src/server/roomManager.ts:100-110, 203-244, 390-510, 955-998`
- Modify: `src/server/wsServer.ts:8-15, 99-167`
- Test: `src/server/roomManager.test.ts`

**Interfaces:**
- Consumes: `RoomChatMessage`, `RtcSignalPayload`, `participantId` từ Task 1.
- Produces:
  - `OnlineRoomManager.handleClientMessage` xử lý `SEND_CHAT_MESSAGE` (`800ms` cooldown, max `160` chars, `60` ALL / `30` TEAM per team history, lọc bảo mật kênh `TEAM`), `RTC_SIGNAL` (chỉ chuyển tiếp tới `targetParticipantId` cùng phòng), `UPDATE_VOICE_STATE` (cập nhật `micEnabled` và broadcast snapshot).
  - `attachMultiplayerWebSocketServer` hỗ trợ `maxPayload: 32 * 1024` và hạn mức riêng `RTC_SIGNAL` (`120` msg / `5000ms`).

- [ ] **Step 1: Write failing tests for chat isolation, rate-limit, history cap, and RTC signaling**

Thêm 3 test vào `src/server/roomManager.test.ts`:
- `Chat channel security`: trong phòng `TEAMS_2V2` (4 người ngồi ghế 0, 1, 2, 3), ghế 0 (`teamId=0`) gửi `SEND_CHAT_MESSAGE` với `channel: 'TEAM'` → chỉ ghế 0 và ghế 2 nhận `GAME_EVENT(CHAT_MESSAGE)`; ghế 1 và ghế 3 **không** nhận event và khi gọi `RECONNECT_ROOM` trên ghế 1 thì `snapshot.chatHistory` cũng **không** chứa tin đội 0.
- `Chat validation & rate limit`: tin rỗng bị bỏ qua, tin dài 220 ký tự bị cắt còn đúng `160` ký tự, gửi 2 tin liên tiếp trong `< 800ms` trả lỗi `RATE_LIMITED`, gửi 65 tin `ALL` thì `chatHistory` chỉ giữ đúng `60` tin mới nhất.
- `RTC_SIGNAL routing & cross-room protection`: c1 gửi `RTC_SIGNAL` tới `participantId` của c2 cùng phòng → chỉ c2 nhận `{ type: 'RTC_SIGNAL', fromParticipantId: c1Id, signal }`; c1 gửi tới `participantId` thuộc phòng khác → bị từ chối bằng `ERROR(TARGET_NOT_FOUND)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: FAIL vì chưa xử lý `SEND_CHAT_MESSAGE`, `RTC_SIGNAL`, `UPDATE_VOICE_STATE`.

- [ ] **Step 3: Implement chat, RTC signaling, and WS rate-limit separation**

- Trong `src/server/roomManager.ts`:
  - Khai báo hằng số `CHAT_COOLDOWN_MS = 800`, `MAX_CHAT_LENGTH = 160`, `MAX_ALL_CHAT_HISTORY = 60`, `MAX_TEAM_CHAT_HISTORY = 30`.
  - Thêm `allChatHistory: RoomChatMessage[]`, `teamChatHistory: Record<TeamId, RoomChatMessage[]>`, `nextChatId: number` vào `RoomRecord` và `lastChatAtByClient = new Map<string, number>()` (nhớ dọn trong `handleDisconnect` & `dispose`).
  - Trong `SEND_CHAT_MESSAGE`: hoạt động ở mọi `room.status` (`lobby`, `playing`, `gameover`). Nếu `room.matchMode !== 'TEAMS_2V2'` hoặc người gửi không có `teamId`, ép `channel = 'ALL'`. Với `channel === 'TEAM'`, đẩy vào `teamChatHistory[senderTeamId]` và chỉ gửi `GAME_EVENT` tới các thành viên có cùng `teamId`.
  - Trong `buildRoomSnapshot(room, recipientTeamId?)`: gộp `allChatHistory` + (nếu có `recipientTeamId` và `room.matchMode === 'TEAMS_2V2'` thì thêm `teamChatHistory[recipientTeamId]`), sắp xếp theo `id` tăng dần.
  - Trong `RTC_SIGNAL`: xác thực `targetParticipantId !== sender.participantId`, tìm mục tiêu trong cùng phòng có `connected && clientId`, gửi `{ type: 'RTC_SIGNAL', fromParticipantId: sender.participantId, signal: msg.signal }`.
  - Trong `UPDATE_VOICE_STATE`: cập nhật `seat.micEnabled = Boolean(msg.micEnabled)` và `this.broadcastSnapshot(room)`.
- Trong `src/server/wsServer.ts`:
  - Tăng `MAX_WS_PAYLOAD_BYTES = 32 * 1024`.
  - Parse JSON trước khi tính bucket rate limit: nếu `parsed.type === 'RTC_SIGNAL'`, áp dụng cửa sổ riêng `DEFAULT_RTC_RATE_LIMIT_MAX_MESSAGES = 120` / `5000ms` thay vì bucket `40` của gameplay.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test src/server/roomManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/roomManager.ts src/server/wsServer.ts src/server/roomManager.test.ts
git commit -m "feat(server): add room text chat with team isolation, RTC signaling relay, and RTC rate budget"
```

---

### Task 3: `GET /api/rtc-config` Endpoint & `Permissions-Policy` Header Fix

**Files:**
- Modify: `src/server/appServer.ts:336-377`
- Create: `src/server/appServer.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/rtc-config` trả JSON `{ iceServers: RTCIceServer[] }` (mặc định 2 STUN Google & Cloudflare; tự gộp thêm TURN nếu `process.env.TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` được cấu hình).
  - HTTP header `Permissions-Policy: camera=(), microphone=(self), geolocation=()`.

- [ ] **Step 1: Write failing test in `src/server/appServer.test.ts`**

Kiểm tra qua `createAppServer({ enableVite: false })`:
- `GET /api/rtc-config` trả `200`, header `permissions-policy` chứa `microphone=(self)` (không còn `microphone=()`), và `iceServers` chứa `stun:stun.l.google.com:19302` & `stun:stun.cloudflare.com:3478`.
- Khi set `TURN_URLS="turn:turn.example.com:3478"`, `TURN_USERNAME="u"`, `TURN_CREDENTIAL="p"`, `GET /api/rtc-config` trả thêm object TURN kèm `username` và `credential`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/appServer.test.ts`
Expected: FAIL với `404 Not found` cho `/api/rtc-config` và header cũ `microphone=()`.

- [ ] **Step 3: Update `src/server/appServer.ts`**

- Đổi dòng 340 thành `res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');`.
- Thêm helper `buildRtcIceServers()` và route `app.get('/api/rtc-config', ...)` ngay sau `/api/health`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx tsx --test src/server/appServer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/appServer.ts src/server/appServer.test.ts
git commit -m "feat(server): expose /api/rtc-config and allow self microphone in Permissions-Policy"
```

---

### Task 4: WebRTC P2P Mesh Client (`voiceMeshClient.ts`)

**Files:**
- Create: `src/utils/voiceMeshClient.ts`
- Create: `src/utils/voiceMeshClient.test.ts`

**Interfaces:**
- Consumes: `RtcSignalPayload` từ `src/game/onlineTypes.ts`.
- Produces in `src/utils/voiceMeshClient.ts`:
  - `export type VoiceInputMode = 'open_mic' | 'push_to_talk';`
  - `export type VoicePermissionStatus = 'idle' | 'granted' | 'denied' | 'insecure_context' | 'unsupported';`
  - `export interface VoicePeerState { participantId: string; connectionState: RTCPeerConnectionState | 'new'; mutedLocally: boolean; volume: number; isSpeaking: boolean; }`
  - `export interface VoiceMeshSnapshot { micEnabled: boolean; inputMode: VoiceInputMode; pttPressed: boolean; permissionStatus: VoicePermissionStatus; localSpeaking: boolean; peers: Record<string, VoicePeerState>; }`
  - `export function isPolitePeer(myParticipantId: string, remoteParticipantId: string): boolean`
  - `export class VoiceMeshClient` với các method: `syncPeers(remoteParticipantIds: string[])`, `handleSignal(fromParticipantId: string, signal: RtcSignalPayload)`, `toggleMic()`, `setInputMode(mode: VoiceInputMode)`, `setPushToTalkPressed(pressed: boolean)`, `setPeerMuted(participantId: string, muted: boolean)`, `setPeerVolume(participantId: string, volume: number)`, `subscribe(listener: (snap: VoiceMeshSnapshot) => void): () => void`, `dispose()`.

- [ ] **Step 1: Write failing unit tests in `src/utils/voiceMeshClient.test.ts`**

Kiểm tra các kịch bản:
- `isPolitePeer('p_0001', 'p_0002') === true` và chiều ngược lại `false`.
- Khởi tạo mặc định `micEnabled === false` và `syncPeers(['p_remote'])` **không** gọi `getUserMedia`, nhưng vẫn tạo `RTCPeerConnection` (với `addTransceiver('audio', { direction: 'recvonly' })`) để nghe được người khác.
- Khi `isSecureContext === false`, gọi `toggleMic()` đặt `permissionStatus === 'insecure_context'` và không ném lỗi.
- Khi `getUserMedia` bị từ chối (`NotAllowedError`), đặt `permissionStatus === 'denied'` và giữ `micEnabled === false`.
- Chế độ `push_to_talk`: `setInputMode('push_to_talk')` tắt `audioTrack.enabled`; `setPushToTalkPressed(true)` bật track, `setPushToTalkPressed(false)` tắt lại.
- Perfect Negotiation glare: `polite` peer nhận `offer` khi đang ở trạng thái `makingOffer` sẽ rollback/nhận offer; `impolite` peer bỏ qua offer xung đột.
- Auto ICE restart: khi peer chuyển sang `failed` quá `4000ms`, `polite` peer gọi `restartIce()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/utils/voiceMeshClient.test.ts`
Expected: FAIL (`Cannot find module './voiceMeshClient'`).

- [ ] **Step 3: Implement `src/utils/voiceMeshClient.ts`**

Thiết kế hỗ trợ dependency injection (`createPeerConnection`, `getUserMedia`, `isSecureContext`, `fetchIceServers`) để unit test chạy sạch trong Node mà không cần DOM thật, đồng thời tự dùng WebRTC & Web Audio API mặc định trên trình duyệt (đo RMS `AnalyserNode` mỗi `120ms`, ngưỡng lọc nhiễu `0.025`, gắn `<audio autoplay playsInline>` ẩn cho từng remote stream để chỉnh `volume` & `muted`).

- [ ] **Step 4: Run test to verify pass**

Run: `npx tsx --test src/utils/voiceMeshClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/voiceMeshClient.ts src/utils/voiceMeshClient.test.ts
git commit -m "feat(voice): implement WebRTC P2P Mesh client with Perfect Negotiation and PTT"
```

---

### Task 5: Wire Chat & RTC Signaling into `useOnlineMultiplayer`

**Files:**
- Modify: `src/utils/onlineClient.ts:80-526`
- Modify: `src/utils/onlineClient.test.ts`

**Interfaces:**
- Consumes: `RoomChatMessage`, `RtcSignalPayload`, `ChatChannel` từ `src/game/onlineTypes.ts`.
- Produces từ `useOnlineMultiplayer`:
  - State: `yourParticipantId: string | null`, `chatMessages: RoomChatMessage[]`.
  - Methods: `sendChatMessage(channel: ChatChannel, text: string): boolean`, `sendRtcSignal(targetParticipantId: string, signal: RtcSignalPayload): boolean`, `updateVoiceState(micEnabled: boolean): boolean`.
  - Option mới trong `UseOnlineMultiplayerOptions`: `onRtcSignal?: (fromParticipantId: string, signal: RtcSignalPayload) => void`, `onChatMessage?: (message: RoomChatMessage) => void`.

- [ ] **Step 1: Write failing test in `src/utils/onlineClient.test.ts`**

Kiểm tra: nhận `ROOM_JOINED` cập nhật `yourParticipantId` và đồng bộ `chatHistory`; nhận `GAME_EVENT(CHAT_MESSAGE)` nối thêm tin nhắn không trùng `id` và gọi `onChatMessage`; nhận `RTC_SIGNAL` chuyển tiếp vào `onRtcSignal`; `sendRtcSignal` gửi đúng JSON `{ type: 'RTC_SIGNAL', targetParticipantId, signal }` mà không hiện toast lỗi mạng khi socket tạm mất sync.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/utils/onlineClient.test.ts`
Expected: FAIL vì `onlineClient.ts` chưa có các trường/hàm mới.

- [ ] **Step 3: Implement updates in `src/utils/onlineClient.ts`**

- Thêm `yourParticipantId`, `chatMessages` (hydrate từ `snapshot.chatHistory` khi `ROOM_JOINED`/`ROOM_SNAPSHOT` và append khi nhận `GAME_EVENT(CHAT_MESSAGE)` với dedup theo `msg.id`).
- Xử lý `msg.type === 'RTC_SIGNAL'` gọi `onRtcSignalRef.current?.(msg.fromParticipantId, msg.signal)`.
- Trong `sendMessage`: bỏ qua toast lỗi cho `RTC_SIGNAL` và `UPDATE_VOICE_STATE` (tương tự `SEND_EMOTE`).
- Reset `yourParticipantId` và `chatMessages` khi `LEFT_ROOM` hoặc `leaveRoom()`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx tsx --test src/utils/onlineClient.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/onlineClient.ts src/utils/onlineClient.test.ts
git commit -m "feat(online): expose participantId, chat messages, and RTC signaling in useOnlineMultiplayer"
```

---

### Task 6: Build `VoiceControlBar` & `OnlineChatDrawer` Components

**Files:**
- Create: `src/components/VoiceControlBar.tsx`
- Create: `src/components/OnlineChatDrawer.tsx`

**Interfaces:**
- Produces `VoiceControlBar`:
  ```ts
  export interface VoiceControlBarProps {
    voiceState: VoiceMeshSnapshot;
    participants: RoomParticipantSummary[];
    myParticipantId: string | null;
    compact?: boolean;
    onToggleMic: () => void;
    onSetInputMode: (mode: VoiceInputMode) => void;
    onSetPushToTalkPressed: (pressed: boolean) => void;
    onSetPeerMuted: (participantId: string, muted: boolean) => void;
    onSetPeerVolume: (participantId: string, volume: number) => void;
  }
  ```
- Produces `OnlineChatDrawer`:
  ```ts
  export interface OnlineChatDrawerProps {
    variant: 'drawer' | 'embedded';
    open?: boolean;
    onClose?: () => void;
    messages: RoomChatMessage[];
    myParticipantId: string | null;
    canUseTeamChannel: boolean;
    onSendMessage: (channel: ChatChannel, text: string) => void;
  }
  ```

- [ ] **Step 1: Implement `src/components/VoiceControlBar.tsx`**

- Nút chính Mic (`data-testid="bt-voice-mic-btn"`):
  - Ở `open_mic`: 1 click gọi `onToggleMic()`.
  - Ở `push_to_talk`: `onPointerDown` gọi `onSetPushToTalkPressed(true)`, `onPointerUp`/`onPointerCancel`/`onPointerLeave` gọi `onSetPushToTalkPressed(false)`.
  - `useEffect` lắng nghe `keydown`/`keyup` phím `KeyV` khi `inputMode === 'push_to_talk'`, bỏ qua nếu `document.activeElement` là `INPUT`, `TEXTAREA`, hoặc `isContentEditable`.
- Nút mũi tên mở Popover Voice (`data-testid="bt-voice-popover-btn"`): chuyển chế độ Open Mic / Push-to-Talk, hiện cảnh báo nếu `permissionStatus === 'insecure_context'` (*"Cần HTTPS hoặc localhost để bật Micro"*) hoặc `'denied'`, và danh sách các thành viên khác kèm nút Mute cục bộ + `<input type="range" min={0} max={100} />`.

- [ ] **Step 2: Implement `src/components/OnlineChatDrawer.tsx`**

- Hỗ trợ 2 tab `Cả phòng` (`ALL`) và `Đội` (`TEAM`, chỉ bật khi `canUseTeamChannel === true`).
- Danh sách chip câu thoại nhanh tiếng Việt (`"Đổ lớn đi bạn ơi!"`, `"Đừng vào đất mình nha 😅"`, `"Thương lượng đi!"`, `"Chúc mừng đại gia!"`, `"Cứu bồ đồng đội ơi!"`).
- Ô nhập `maxLength={160}` (`data-testid="bt-chat-input"`), nút gửi (`data-testid="bt-chat-send-btn"`), nhãn phân biệt tin `[Đội]` màu xanh riêng, tự cuộn xuống tin mới nhất.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run lint`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/VoiceControlBar.tsx src/components/OnlineChatDrawer.tsx
git commit -m "feat(ui): add VoiceControlBar and OnlineChatDrawer components"
```

---

### Task 7: Integrate Chat & Voice Across App, Lobby, HUD, VictoryModal & E2E Tests

**Files:**
- Modify: `src/components/ActionDock.tsx:16-95, 500-716`
- Modify: `src/components/PlayerHUD.tsx:24-38, 200-520`
- Modify: `src/components/OnlineLobbyPanel.tsx:18-60, 420-650`
- Modify: `src/components/TileModalAndDialogs.tsx:1405-1655`
- Modify: `src/App.tsx`
- Create: `e2e/online-chat-voice.spec.ts`

**Interfaces:**
- `ActionDockProps` bổ sung `unreadChatCount?: number`, `chatOpen?: boolean`, `onToggleChat?: () => void`, `voiceBarNode?: React.ReactNode`.
- `PlayerHUDProps` bổ sung `speakingPlayerIds?: Record<number, boolean>` và `playerChatBubbles?: Record<number, { id: number; text: string; isTeam?: boolean }>`.
- `VictoryModal` bổ sung `onlineChatNode?: React.ReactNode`.

- [ ] **Step 1: Wire `ActionDock`, `PlayerHUD`, `OnlineLobbyPanel`, `VictoryModal`, and `App.tsx`**

- Trong `src/App.tsx`:
  - Khởi tạo/hủy `VoiceMeshClient` theo vòng đời `online.roomSnapshot?.roomCode` và `online.yourParticipantId`; gọi `syncPeers` mỗi khi `participants` thay đổi; gọi `online.updateVoiceState(snap.micEnabled)` khi trạng thái mic thay đổi.
  - Quản lý `chatDrawerOpen` và `unreadChatCount` (tăng khi nhận `CHAT_MESSAGE` từ người khác lúc ngăn kéo đang đóng, reset về `0` khi mở ngăn kéo).
  - Khi nhận `CHAT_MESSAGE` trong trận lúc ngăn kéo đóng, đặt bong bóng chữ nổi `4000ms` cho `msg.playerId` truyền xuống `PlayerHUD`.
  - Ánh xạ `speakingParticipantIds` từ `VoiceMeshSnapshot` sang `speakingPlayerIds` cho `PlayerHUD` để vẽ vòng sáng xanh lá quanh Avatar đang nói.
- Nhúng `VoiceControlBar` và `OnlineChatDrawer` (`embedded`) vào `OnlineLobbyPanel.tsx` và `VictoryModal`.

- [ ] **Step 2: Write Playwright E2E test `e2e/online-chat-voice.spec.ts`**

Kịch bản 2 browser contexts (Host + Guest):
- Host tạo phòng `TEAMS_2V2`, Guest tham gia bằng mã phòng → cả 2 gửi tin nhắn ở Sảnh chờ và thấy tin nhau ngay lập tức.
- Host bắt đầu trận → Host gửi tin nhắn khi ngăn kéo Chat của Guest đang đóng → Guest thấy badge đỏ số chưa đọc trên nút Chat và thấy bong bóng chữ nổi cạnh Avatar Host trên `PlayerHUD`.
- Guest mở ngăn kéo Chat → badge đỏ biến mất, lịch sử tin nhắn hiển thị đầy đủ; gửi tin trên tab `Đội` xác nhận tag `[Đội]` hiển thị đúng.

- [ ] **Step 3: Run full verification suite**

Run:
```bash
npm run lint
npm test
npm run build
npx playwright test e2e/online-chat-voice.spec.ts --headed
```
Expected: Tất cả lint, unit tests, production build và E2E test đều PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ActionDock.tsx src/components/PlayerHUD.tsx src/components/OnlineLobbyPanel.tsx src/components/TileModalAndDialogs.tsx src/App.tsx e2e/online-chat-voice.spec.ts
git commit -m "feat(online): integrate Phase 1 text chat and WebRTC voice across lobby, match, and victory"
```
