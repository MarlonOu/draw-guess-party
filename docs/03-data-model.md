# 資料模型設計

> 本文件依另一個 Claude 對話中產生的原始規劃內容整理重建，非逐字複製。

## 設計原則

用名稱而非強耦合的 id 關聯降低匯入/管理門檻；模式相關欄位收斂在單一 `Round` 表用 `mode` 欄位 + JSON 欄位區分，而不是每個模式都開一張完全獨立的表——新增模式不需修改資料庫 schema，只需在應用層新增對應的 TypeScript 型別。

**本次整合實作狀態**：以下資料模型為原始規劃設計，尚未建立 Prisma schema、尚未接 PostgreSQL；目前僅有對應的 TypeScript 型別定義於 `lib/types/`，房間狀態全部存於伺服器記憶體（見 `02-architecture.md`）。

## 核心實體

### Room

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | UUID | 主鍵 |
| joinCode | string | 6 碼加入代碼，唯一 |
| mode | enum | `DRAW_GUESS` / `FRAGMENT_DRAW` / `DRAW_TELEPHONE` |
| status | enum | `lobby` / `playing` / `finished` |
| hostPlayerId | UUID | 房主 |
| roundCount | integer | 這場比賽的輪數 |
| currentRoundIndex | integer | 目前第幾輪 |
| roundDurationSec | integer | 每輪限時秒數 |
| categoryFilter | string[] | 題庫分類篩選（`DRAW_GUESS` 用） |
| difficultyFilter | string[] | 題庫難度篩選（`DRAW_GUESS` 用） |
| createdAt | timestamp | 建立時間 |

### RoomPlayer

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | UUID | 主鍵 |
| roomId | UUID | 外鍵 |
| displayName | string | 顯示名稱 |
| score | integer | 累積分數 |
| joinedAt | timestamp | 加入時間 |

連線狀態（socketId、是否在線）屬於即時狀態，存伺服器記憶體，不進資料庫。

### WordBankEntry（DRAW_GUESS 用）

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | UUID | 主鍵 |
| text | string | 題目詞語 |
| category | string | 分類 |
| difficulty | enum | `EASY` / `MEDIUM` / `HARD` |
| createdAt | timestamp | 建立時間 |

### Round

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | UUID | 主鍵 |
| roomId | UUID | 外鍵 |
| order | integer | 這一輪的順序 |
| mode | enum | 冗餘存一份模式代號 |
| data | JSON | 模式專屬資料（見下方 `RoundData`） |
| strokes | JSON | 這一輪完整筆畫資料，輪次結束時落地 |
| startedAt | timestamp | 開始時間 |
| endedAt | timestamp | 結束時間 |

`data` 欄位依 `mode` 對應（TypeScript discriminated union）：

```typescript
type RoundData =
  | {
      mode: 'DRAW_GUESS';
      drawerPlayerId: string;
      word: string;
      guessedByPlayerId: string | null;
      guessedAtMs: number | null; // 猜中所花毫秒數，供計分用
    }
  | {
      mode: 'FRAGMENT_DRAW';
      prompt: string;
      gridSize: number;
      tiles: { tileIndex: number; playerId: string; prompt: string | null }[];
      compositeImageUrl: string | null;
    }
  | {
      mode: 'DRAW_TELEPHONE';
      /** 原始題目：只有接龍第一棒的人看得到，其他人要等 revealed 才看得到 */
      originalWord: string;
      /** 依隨機順序排列的整條接龍玩家 id，比賽開始時決定，中途不變動 */
      chainOrder: string[];
      /** 已經完成的每一棒：所有人（含最後一棒）都要畫，只有接龍第一棒沒有
       *  guessText（沒有前一棒可以猜）。最後一棒的 guessText 就是整條接龍的
       *  最終答案，不另外用獨立欄位存一份 */
      entries: { playerId: string; displayName: string; strokes: Stroke[]; guessText?: string }[];
      revealed: boolean;
    };
```

實際實作跟上面這份草稿有出入：不是交替「文字/圖片」單一動作類型的鏈，而是「每一位（除了第一棒）都要先猜再畫」的合併動作——包含接龍最後一棒也要畫，不是猜完就結束；猜測文字本身不會被下一位看到（下一位只看得到「上一位畫的圖」跟自己的回合），只有最後 `revealed` 之後才會整條攤開給所有人看，這是這個玩法「傳話會走鐘」的核心機制。詳見 `05-roadmap.md` Phase 6 的完整設計說明。

### GuessMessage（DRAW_GUESS 用，猜題聊天室訊息）

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | UUID | 主鍵 |
| roundId | UUID | 外鍵 |
| playerId | UUID | 誰傳的 |
| text | string | 訊息內容 |
| isCorrectGuess | boolean | 是否為正確答案 |
| createdAt | timestamp | 時間 |

**本次整合實作簡化**：目前 `GuessMessage` 未落地資料庫、未關聯 `roundId`，僅作為即時訊息透過 `chat:message` 事件廣播；型別定義於 `lib/types/round.ts`。

## 關聯總覽

```
Room 1---N RoomPlayer
Room 1---N Round
Round 1---N GuessMessage（僅 DRAW_GUESS 模式）
WordBankEntry（獨立於 Room 之外）
```

## 猜題比對規則（DRAW_GUESS）

- 完全比對：去除頭尾空白、忽略大小寫後完全相等，視為正確
- 中文題目不做模糊比對，先求正確不求寬鬆
- 猜中之後：該輪立刻標記 `guessedByPlayerId` 與 `guessedAtMs`，公布正確答案，短暫停留後自動進下一輪

**本次整合實作**：比對邏輯已用 `lib/guessing-engine/answerUtils.ts` 的 `isAnswerMatch`（正規化去空白/轉小寫後完全比對）實作於 `lib/server/socketHandlers/chat.ts`，符合上述規則；但「猜中後公布答案、自動進下一輪」的房間狀態機轉換尚未實作（屬於 Phase 3 `drawGuessEngine.ts` 範圍）。
