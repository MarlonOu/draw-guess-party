import type { Metadata, Viewport } from 'next';
// 字型全部自架（fontsource 隨 npm 安裝、由 Next 打包成靜態資源）：不依賴第三方字型服務，
// 沒有額外的 DNS/TLS 往返，也不會因為字型 CDN 被擋而整站退回系統字。
// Fredoka 負責英數與標題的圓潤感，Chiron GoRound TC 負責繁中字形（圓角黑體，可變字重），
// Iansui（芫荽）只用在手寫註記，字級一律 ≥ 14px 以維持可讀性。
import '@fontsource-variable/fredoka';
import '@fontsource-variable/chiron-goround-tc';
import '@fontsource/iansui';
import './design.css';
import './pages.css';
import './globals.css';

export const metadata: Metadata = {
  // OG／Twitter 圖片需要絕對網址；正式站網域可用 NEXT_PUBLIC_SITE_URL 覆寫
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://play-q4x9.marlonou.com'),
  title: {
    default: '畫圖猜謎派對｜一人畫、大家猜的線上派對遊戲',
    template: '%s｜畫圖猜謎派對',
  },
  description:
    '免註冊、手機也能玩的線上多人畫圖猜謎。你畫我猜、畫圖接龍、拼圖接畫三種玩法，分享房間代碼或 QR code 就能開一桌。',
  openGraph: {
    title: '畫圖猜謎派對',
    description: '一人畫、大家猜。三種玩法，分享房間代碼就能開一桌。',
    locale: 'zh_TW',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f0e1',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-TW" data-scroll-behavior="smooth">
      <body>
        <a className="dg-skip" href="#main">
          跳到主要內容
        </a>
        {children}
      </body>
    </html>
  );
}
