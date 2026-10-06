import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '畫圖猜謎派對',
    short_name: '畫圖猜謎',
    description: '一人畫、大家猜。你畫我猜、畫圖接龍、拼圖接畫三種玩法，分享房間代碼就能開一桌。',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f0e1',
    theme_color: '#ff6b4a',
    lang: 'zh-TW',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
