# 程式碼規範

> 本文件依另一個 Claude 對話中產生的原始規劃內容整理重建，非逐字複製。

## 命名規則

- 型別、介面：PascalCase，例如 `RoomState`、`StrokePoint`
- 變數、函式：camelCase，例如 `computeGuessScore`
- 常數：UPPER_SNAKE_CASE
- 檔案名稱：與匯出的主要元件或模組同名，元件檔為 PascalCase，其餘為 camelCase
- 列舉值統一使用 UPPER_SNAKE_CASE 字串：模式列舉固定為 `DRAW_GUESS` / `FRAGMENT_DRAW` / `DRAW_TELEPHONE`，難度列舉固定為 `EASY` / `MEDIUM` / `HARD`

## WebSocket 事件命名規則

固定格式 `名詞:動詞`，例如 `room:join`、`stroke:start`、`canvas:clear`、`chat:message`。新增事件時遵循同一格式，不使用其他命名風格（例如不用 `joinRoom` 這種駝峰式事件名稱）。

## 遊戲模式抽象介面

三種模式共用同一套即時繪圖引擎與房間系統，模式專屬規則（抽題、指定畫圖者、猜題判定、計分）各自獨立檔案（例如 `drawGuessEngine.ts`、`fragmentDrawEngine.ts`），新增模式時新增一個檔案並在房間狀態機裡註冊，不修改既有模式的檔案——與音樂猜歌專案的 `GameModeStrategy` 擴充原則一致。

## 畫布元件規範

- 座標一律使用 0~1 的正規化比例（`StrokePoint.x`/`y`），不直接存/傳原始像素座標
- 本機繪製與接收其他玩家的筆畫事件畫在同一個 canvas，用 `strokeId`／`playerId` 區分不同來源的筆畫狀態，但渲染邏輯共用同一組畫圖函式，避免兩套繪製邏輯不同步

## 即時同步層規範

- UI 元件一律透過 `useRoomSocket()` / `useDrawingSync()` 取得房間狀態與收送事件方法，不直接在元件內 import `socket.io-client` 操作
- 斷線重連邏輯集中在 `lib/realtime/socketClient.ts`
- 伺服器端 socket handler 依事件範疇拆檔（`socketHandlers/room.ts`、`stroke.ts`、`chat.ts`），不把所有 `io.on('connection', ...)` 邏輯塞在同一個檔案

## 錯誤處理

- HTTP API（題庫管理等非即時操作）延續音樂猜歌專案慣例：明確回傳成功或錯誤結果，不用裸露的 `throw` 讓 UI 層直接接框架例外
- WebSocket 事件處理失敗時，伺服器端透過統一的 `room:error` 事件回報給觸發的那個 client（不廣播給全房間），前端顯示簡短提示，不中斷連線本身

## 註解與文件

- 複雜邏輯（座標正規化換算、猜題比對容錯規則、分數計算公式）需於函式上方以區塊註解說明輸入輸出與邊界條件
- 每個新增模組於完成後同步檢查是否需要更新 `02-architecture.md` 的資料夾結構與 `03-data-model.md` 的 `RoundData` 型別定義
