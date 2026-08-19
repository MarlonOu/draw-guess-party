# 技術架構

> 本文件依另一個 Claude 對話中產生的原始規劃內容整理重建，非逐字複製。

## 為什麼一開始就用 WebSocket（不是輪詢）

姊妹專案「音樂猜歌」的線上模式用輪詢（每 1~2 秒問一次房間狀態）就夠用，因為狀態變化是離散、低頻率的。但本專案的核心互動是「即時畫布同步」——筆畫要跟著畫圖者的手指即時出現，這種高頻率連續資料用輪詢會非常卡頓，因此架構上直接以 WebSocket 為基礎，不考慮輪詢。

## 分層原則

1. **UI 層**（React Component，Next.js App Router）
2. **即時同步層**（`lib/realtime/`，封裝 WebSocket 連線、事件收發、重連邏輯；UI 層透過 Hook 收送事件，不直接碰 socket 物件）
3. **遊戲邏輯層**（各模式的規則判斷，純函式為主）
4. **資料存取層**（Repository，HTTP API 存取靜態資料如題庫；即時狀態改用即時同步層）
5. **資料層**（PostgreSQL 存持久化資料；房間即時狀態存伺服器記憶體）

## Server 架構：Next.js + 自訂 Node Server

`next start` 不支援掛載 WebSocket handler，因此改用自訂 `server.ts`，把 HTTP server、Socket.io、Next.js request handler 掛在同一個 port。部署時 systemd 服務啟動 `node server.js`（或本專案採用的 `tsx server.ts`）取代 `next start`；Cloudflare Tunnel 設定不需改變，WebSocket 走同一個 port 用 Upgrade header 切換協定。

**本專案實作差異**：原規劃使用純 `server.js`（JavaScript），本次整合實作改用 `server.ts` + `tsx` 執行，避免另外維護一份編譯後的 JS 版本 socket handler；正式環境的 `package.json` scripts 已對應調整（`dev`/`start` 皆為 `tsx server.ts`）。

## 房間即時狀態：伺服器記憶體 + 定期落地

- 房間清單、連線中的 socket、進行中回合的完整筆畫資料存在伺服器記憶體（`Map<joinCode, RoomState>`），不是每個動作都寫資料庫
- 落地時機：房間建立/玩家異動/比分變化 → 寫資料庫（低頻率）；單一筆畫事件 → **不落地**，純粹透過 Socket.io 廣播；一輪畫完 → 該輪完整筆畫資料整理落地
- 伺服器重啟會遺失記憶體中「正在進行的房間」，可接受的取捨

**本次整合實作的重要修正**：`RoomState` 的記憶體 Map 若單純宣告為模組頂層變數，在 Next.js `next build` 產生的 API Route bundle 與 `server.ts` 直接以原始碼匯入的模組之間，會各自產生獨立的模組實例，造成兩份不同步的 Map（透過 HTTP API 建立的房間，socket 端完全查詢不到）。修正方式是把 Map 掛在 `globalThis` 上，確保跨模組圖只有單一實例。這是本次整合過程中新發現、原規劃文件未提及的問題，已記錄於 `lib/server/roomManager.ts` 的註解中。

## 畫布同步機制

### 資料模型：向量筆畫，不是點陣圖

同步的是「筆畫座標點的序列」，理由：頻寬成本低、之後可做回放/復原、不同螢幕尺寸用比例正規化不會有解析度落差。

```typescript
interface StrokePoint {
  x: number; // 0~1，相對畫布寬度的比例
  y: number; // 0~1，相對畫布高度的比例
  t: number; // 相對於這一筆畫開始的毫秒數
}

interface Stroke {
  id: string;
  playerId: string;
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  points: StrokePoint[];
}
```

### 事件節流

本機繪製（自己畫的當下）每個 pointermove 都即時畫，但送到網路上的事件節流為每個 `requestAnimationFrame` 批次送一次座標點，而不是每個 pointermove 都各自送一個 WebSocket 訊息。

### 事件設計

| 事件名稱 | 方向 | 內容 | 說明 |
|---|---|---|---|
| `stroke:start` | Client → Server → 其他 Client | `{ strokeId, playerId, color, width, tool, point }` | 開始一筆新的筆畫 |
| `stroke:points` | Client → Server → 其他 Client | `{ strokeId, points: StrokePoint[] }` | 節流後的批次座標點 |
| `stroke:end` | Client → Server → 其他 Client | `{ strokeId }` | 這筆筆畫畫完 |
| `canvas:clear` | Client → Server → 其他 Client | `{ playerId }` | 清空畫布重畫 |
| `canvas:undo` | Client → Server → 其他 Client | `{ playerId }` | 復原最後一筆 |

伺服器對 `stroke:*` 事件基本上是被動轉發（relay），不做內容驗證，確保延遲最低；「現在到底輪不輪得到這個人畫」的權限判斷屬於遊戲規則層（Phase 3 起實作），本次整合的 MVP 階段房間內所有人皆可畫，用於驗證同步機制本身。

## 即時同步層規範

- UI 元件一律透過 `useRoomSocket()` / `useDrawingSync()` 取得房間狀態與收送事件，不直接 import `socket.io-client` 在元件內操作
- 斷線重連邏輯集中在 `lib/realtime/socketClient.ts`
- 伺服器端 socket handler 依事件範疇拆檔（`socketHandlers/room.ts`、`stroke.ts`、`chat.ts`）

## 資料夾結構（本次整合實作實際結構）

```
draw-guess-party/
  server.ts
  proxy.ts
  app/
    online/
      page.tsx
      room/[joinCode]/page.tsx
    admin/
      page.tsx
    api/
      rooms/route.ts
      word-categories/route.ts
      words/
        route.ts
        [id]/route.ts
        import/route.ts
  components/
    canvas/
      DrawingCanvas.tsx
      Toolbar.tsx
    room/
      GuessChatBox.tsx
      PlayerList.tsx
      RoundTimer.tsx
  lib/
    realtime/
      socketClient.ts
      useRoomSocket.ts
      useDrawingSync.ts
    engine/
      drawGuessEngine.ts
    repository/
      wordRepository.ts
    server/
      roomManager.ts
      roundOrchestrator.ts
      wordManager.ts
      socketHandlers/
        room.ts
        stroke.ts
        chat.ts
    types/
      room.ts
      stroke.ts
      word.ts
      round.ts
      events.ts
    guessing-engine/
      answerUtils.ts
  data/
    words.json
  docs/
```

`proxy.ts` 是 Next.js 16 的新版檔案慣例（取代舊版 `middleware.ts`），保護 `/admin` 與 `/api/words` 完整 CRUD 需要 HTTP Basic Auth；`/api/word-categories` 是刻意獨立出來的公開唯讀端點，不受這層保護，供建立房間頁面使用。
