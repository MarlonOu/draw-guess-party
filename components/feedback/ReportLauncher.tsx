'use client';

import { usePathname } from 'next/navigation';
import { ReportButton } from './ReportButton';

/**
 * 全站浮動的「回報問題」入口，掛在根 layout。
 * 房間頁不顯示浮動按鈕（會蓋到畫布與工具列），改由房間標題列的小圖示按鈕提供；
 * 管理後台是管理員自己在用，也不需要。
 */
export function ReportLauncher() {
  const pathname = usePathname();
  if (pathname.startsWith('/online/room/') || pathname.startsWith('/admin')) return null;
  return <ReportButton variant="fab" />;
}
