import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '投稿題目',
  description: '想到好畫、好猜的題目？投稿給畫圖猜謎派對，管理員審核通過後就會加進題庫。',
};

export default function SubmitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
