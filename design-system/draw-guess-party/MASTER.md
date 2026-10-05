# 畫圖猜謎派對 · 設計系統 MASTER

> 單一事實來源。任何頁面開工前先讀這份；頁面專屬的例外寫在 `pages/<page>.md`，優先於本檔。
> 實作位置：`app/design.css`（token、基礎、元件）、`app/pages.css`（各頁）、`app/globals.css`（畫布版面，勿隨意改）。

## 概念：素描本派對桌
整站是一張攤開的素描本：暖米紙、墨線、麥克筆色、膠帶與便利貼。三種玩法是「貼上去的卡片」，每個房間是一張「入場券」。

來源與取捨：以 ui-ux-pro-max 的 `Sketch Hand-Drawn` 風格為底。該 skill 的 `--design-system` 通用推薦（深色撲克綠＋金、3D）與產品氣質不合，未採用。

## 規則（不可違反）
1. 陰影一律實色偏移（`--shadow-sm/md/lg`），不用模糊陰影；按下時「壓進紙裡」。
2. 圓角略不對稱（`--r-card`、`--r-btn`）；容器內文字永遠水平，只有容器本身可微傾斜（±2° 內）。
3. 鮮豔色塊（珊瑚橘、琥珀、薄荷、粉）上一律墨色字；白字只用在 `--blue-ink` 底。
4. 狀態不只靠顏色：晶片用 `aria-pressed` 並顯示勾；選取卡片有右上角圓章。
5. 觸控目標最小 44×44px（`.dg-btn`、`.dg-btn-sm`、`.dg-chip` 皆為 44）。
6. 動畫只動 `transform`/`opacity`；裝飾性無限動畫禁用（唯一例外：跑馬燈，hover 暫停；與緊急倒數數字抖動）。
7. 所有動畫必須在「減少動態效果」與「無 JS」下仍呈現完整內容。

## Token
| 類別 | 名稱 | 值 |
|---|---|---|
| 底 | `--canvas` / `--paper` / `--paper-dim` / `--line` | `#f7f0e1` / `#fffdf8` / `#faf4e6` / `#e4d9c0` |
| 墨 | `--ink` / `--ink-soft` / `--ink-faint` | `#1b1a2e` / `#4c4a63`（對 canvas 約 7.5:1）/ `#8b879f`（僅裝飾） |
| 主色 | `--accent` / `-ink` / `-soft` | `#ff6b4a` / `#b5391d` / `#ffddd1` |
| 藍 | `--blue` / `-ink` / `-soft` | `#4c6fff` / `#2a45c7`（白字 7.5:1）/ `#dee5ff` |
| 綠 | `--green` / `-ink` / `-soft` | `#1fcb8f` / `#0b7552` / `#d4f6e8` |
| 黃 | `--amber` / `-ink` / `-soft` | `#ffc93c` / `#7a5200` / `#ffefc0` |
| 其他 | `--pink` `--grape` `--red` 及 `-soft` | 見 design.css |
| 字級 | `--fs-hero` / `--fs-h1` / `--fs-h2` | `clamp(4.2rem, 8vw+1.2rem, 8.75rem)` / `clamp(2rem,4.6vw,3.5rem)` / `clamp(1.6rem,3.4vw,2.5rem)` |
| 間距 | `--s-1..9` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 72 / 112 |
| 動效 | `--ease-out` `--ease-spring` / `--dur-1..4` | `cubic-bezier(.16,1,.3,1)` `(.34,1.56,.64,1)` / 120 220 420 700ms |

## 字型（全部自架，來自 npm `@fontsource*`）
- 標題與英數：`Fredoka Variable`（Latin）→ `Chiron GoRound TC Variable`（繁中圓體，字重 200–900）
- 手寫註記：`Iansui`，**字級一律 ≥ 14px**（更小不可讀）
- 內文行高 1.65、最小 16px；`text-wrap: balance/pretty`；專有詞用 `.nw`（nowrap）防止在詞中斷行

## 元件
`.dg-card`（`.dg-taped` 加膠帶）、`.dg-btn`（+`-primary/-blue/-mint/-sun/-ink/-sm/-lg/-block`）、`.dg-input`、`.dg-chip`、`.dg-tag`、`.dg-sticker`、`.dg-note`、`.dg-notice`（錯誤，含抖動）、`.dg-seg`（分段控制，滑動拇指）、`.dg-skip`、`.dg-sr-only`。
遊戲內：`.rm-ticket`（入場券）、`.rm-players`/`.rm-avatar`、`.rm-chat`/`.rm-msg`、`.rm-timer`（鉛筆寫完式倒數）、`.rm-sheet`（畫布紙張框）、`.rm-reveal-card`（拍立得）。
插圖：`components/art/Doodles.tsx`；描線動畫用 `.d` + `pathLength={1}`，由 `.art-on` 或祖先 `.is-in` 觸發。

## 版面
- 首頁容器 1320px；`/online` 1120px 雙欄（左玩法預覽、右表單，≤900px 單欄）；遊戲畫面 1080px（拼圖接畫 1200px）；大廳 940px。
- 斷點：960（首頁單欄）、900（/online 單欄）、860（卡片單欄）、640（遊戲畫面手機規則，見 globals.css）、560/520（細部）。
- `<body>` 是 flex 容器，`<main>` 的 `margin:auto` 會讓它退回 shrink-to-fit：需要滿版的頁面必須明確給 `width:100%`（見 `.rm-page`、`.hm-wrap`）。

## 畫布注意事項（踩過的雷）
- 在帶 `rotate()` 的容器內，**禁用 `getBoundingClientRect()` 量畫布尺寸與座標**（回傳放大的外接矩形）。用 `offsetWidth/Height` 與事件的 `offsetX/Y`（見 `HeroStage`、`StrokeReplay`）。
- 畫布尺寸要用 `ResizeObserver` 追父容器，不能只聽 `window.resize`（大廳→遊戲欄寬會變）。
- 筆刷粗細依畫布寬度縮放：`lib/shared/strokeWidthScale.ts`。

## 反模式（本專案明確避免）
emoji 當圖示、白字配珊瑚橘、模糊陰影、只靠顏色表達狀態、裝飾性無限動畫、`user-scalable=no`、placeholder 當 label、錯誤只放頁首。
