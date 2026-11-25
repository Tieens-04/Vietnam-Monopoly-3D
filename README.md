# Cờ Tỷ Phú Việt Nam 3D (Luật Business Tour · Offline & Multiplayer Online)

Game Cờ Tỷ Phú 3D phong cách Low-Poly Isometric (Three.js + React + Tailwind + Express + WebSocket) hỗ trợ chơi **Offline (Solo với Bot AI / Pass & Play)** và **Multiplayer Online theo Phòng Riêng (2–4 người + tùy chọn bù Bot AI)**.

## 1. Chạy phát triển trên máy (Local Dev)

**Yêu cầu:** Node.js >= 20

```bash
npm install --legacy-peer-deps
npm run dev
```

Mở trình duyệt tại `http://localhost:3000`.

- *(Tùy chọn)* Tạo file `.env` và điền `GEMINI_API_KEY=...` nếu muốn Bot AI bình luận hài hước bằng Gemini. Nếu không có key, game và chế độ Online vẫn hoạt động bình thường.

## 2. Chơi thử Online nhanh qua LAN hoặc Tunnel

1. Build và chạy production server:
   ```bash
   npm run build
   npm start
   ```
2. **Chơi cùng Wi-Fi (LAN):** Chia sẻ `http://<IP-máy-của-bạn>:3000`.
3. **Chơi từ xa qua Internet (không cần deploy):** Mở tunnel tới cổng `3000` (ví dụ `cloudflared tunnel --url http://localhost:3000` hoặc `ngrok http 3000`) rồi gửi link cho bạn bè.

## 3. Deploy lên Cloud PaaS (Render / Railway / Fly.io)

Server sử dụng chung **1 cổng duy nhất (`PORT`)** cho cả giao diện tĩnh (`dist/`), API (`/api/health`, `/api/bot-quip`) và WebSocket (`/ws`), nên tương thích trực tiếp với các nền tảng Cloud PaaS hỗ trợ WebSocket:

### Render (Khuyên dùng — có sẵn `render.yaml`)
1. Đẩy mã nguồn lên GitHub.
2. Vào Render Dashboard → **New +** → **Blueprint** (hoặc **Web Service**) và trỏ tới repository này.
3. Render tự đọc [render.yaml](render.yaml):
   - **Build Command:** `npm install --legacy-peer-deps && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
4. *(Tùy chọn)* Thêm biến môi trường `GEMINI_API_KEY` trong mục **Environment**.
5. **Bắt buộc nếu dùng Voice Chat qua mạng khác nhau / 4G (NAT đối xứng):** Render không cung cấp sẵn TURN server; nếu hai người chơi khác Wi-Fi hoặc dùng 4G không nghe thấy nhau, hãy thêm một trong các bộ biến môi trường TURN sau vào **Render → Environment**:
   - **Metered TURN (khuyên dùng, có gói miễn phí):** `METERED_TURN_DOMAIN` + `METERED_API_KEY`
   - **Cloudflare Calls TURN:** `CF_TURN_KEY_ID` + `CF_TURN_API_TOKEN`
   - **Static TURN (Coturn / bất kỳ nhà cung cấp nào):** `TURN_URLS` (cách nhau dấu phẩy), `TURN_USERNAME`, `TURN_CREDENTIAL`

### Railway hoặc Fly.io (dùng `Dockerfile` có sẵn)
- **Railway:** Tạo project mới từ GitHub repo, Railway sẽ tự nhận [Dockerfile](Dockerfile) (hoặc chạy build/start commands trên).
- **Fly.io:** Chạy `fly launch` tại thư mục gốc để dùng trực tiếp [Dockerfile](Dockerfile) trên cổng `3000`.

## 4. Kiểm tra & Build

```bash
npm run lint   # TypeScript typecheck
npm test       # Unit tests luật chơi & tích hợp WebSocket phòng chơi
npm run build  # Build frontend (dist/) + server bundle (server.js)
```
