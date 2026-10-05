'use client';

import type { ReactNode } from 'react';
import { StatusIcon, type StatusIconKind } from './StatusIcon';

interface StatusOverlayProps {
  icon: StatusIconKind;
  iconColor: string;
  title: string;
  children?: ReactNode;
  /**
   * 獨立卡片模式：不是蓋在畫布上面的疊層（position:absolute，受畫布的
   * aspect-ratio 尺寸限制），而是自己獨立佔一塊「內容需要多高就多高」的區塊。
   * 用在內容本來就比較多、不適合硬塞進畫布長寬比容器的狀態——目前只有 lobby
   * （房間代碼、邀請連結、分類/難度篩選、開始按鈕，內容量遠比其他疊層狀態多）。
   * 視覺上維持同樣的圖示+標題+內容排版跟外框樣式（邊框、陰影、圓角都比照
   * 畫布容器本身），只是不再受畫布尺寸限制、也不需要自己的 overflow-y:auto——
   * 內容多高就是多高，讓整個頁面自然往下延伸、由瀏覽器捲動，而不是在畫布這一小塊
   * 範圍裡硬擠出一個內部捲軸。這個做法沿用接龍模式「公布結果畫廊」已經驗證過
   * 可行的同一套模式（那個畫廊本來就沒有塞進畫布的 aspect-ratio 容器裡）。
   */
  standalone?: boolean;
}

/**
 * 畫布疊層通知的統一外殼：圖示 + 標題 + 內容，所有「遊戲關鍵通知」
 * （尚未開始、選題中、等待選題、公布答案、比賽結束）都套用同一套版型，
 * 只是圖示種類、圖示底色、標題文字、內容不同，確保視覺語言一致。
 *
 * `overflowY: 'auto'` 是最後一道防線：畫布在窄螢幕下可能只有一兩百 px 高，
 * 如果內容（例如房主的房間設定面板）真的多到連疊層本身都放不下，寧可讓疊層
 * 自己出現捲軸，也不要讓內容整個溢出畫布邊界、蓋到畫布外的其他元件。
 * 這道防線只在非 standalone（蓋在畫布上）模式才需要——standalone 模式沒有
 * 「固定容器高度」這個前提，不會有這個問題。
 *
 * `justifyContent` 刻意用 `flex-start` 而不是 `center`——內容置中搭配
 * overflow-y:auto 是個經典陷阱：內容比容器高、需要捲動時，「置中」會讓內容
 * 向上下兩側對稱溢出，預設捲動位置（scrollTop=0）看到的不是內容最前面，
 * 而是被置中邏輯往下推過的一段，導致最上面的圖示跟標題被捲到看不見的地方
 * （螢幕越窄、內容溢出越嚴重，這個問題就越明顯）。改成 `flex-start` 後，
 * 內容一律從最前面開始排列，捲動位置預設在最上面看到的就是圖示跟標題，
 * 需要往下捲才會看到後面的內容，符合直覺。
 */
export function StatusOverlay({ icon, iconColor, title, children, standalone = false }: StatusOverlayProps) {
  return (
    <div
      className={standalone ? 'dg-card dg-taped' : 'rm-overlay'}
      style={
        standalone
          ? {
              position: 'relative',
              width: '100%',
              // 這個 div 是真正「看得見邊框」的那張卡片，外層 wrapper
              // （.dg-canvas-frame）在 globals.css 裡用 align-items:stretch 被拉伸到
              // 跟同一列的工具列一樣高，但拉伸只會讓外層 wrapper 本身變高，不會自動
              // 讓這裡的卡片跟著撐滿——這個 div 沒有另外設定 height，預設就是
              // height:auto（只跟著自己的內容決定高度），視覺上會變成「外層框其實
              // 已經跟工具列一樣高，但看得見邊框的卡片本身還是只有內容那麼高」，
              // 卡片下方多出來的空間變成看不見的空白，使用者感受到的就是「lobby
              // 畫面高度還是不夠」。加上 height:'100%' 讓這張卡片確實撐滿外層
              // wrapper 被拉伸出來的高度，`boxSizing:'border-box'` 確保 padding／
              // border 算進這個 100% 裡面，不會因為 padding 疊加而溢出。
              height: '100%',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 14,
              padding: 24,
              textAlign: 'center',
            }
          : {
              position: 'absolute',
              inset: 0,
              background: 'rgba(255,253,248,0.96)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 14,
              padding: 24,
              textAlign: 'center',
              overflowY: 'auto',
            }
      }
    >
      <StatusIcon kind={icon} color={iconColor} />
      <h2 style={{ fontSize: 'clamp(1.3rem, 3.4vw, 1.7rem)', fontWeight: 900 }}>{title}</h2>
      {children}
    </div>
  );
}
