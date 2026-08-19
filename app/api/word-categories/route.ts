import { NextResponse } from 'next/server';
import { getCategories } from '../../../lib/server/wordManager';

/**
 * 公開唯讀端點，供建立房間頁面顯示可篩選的分類清單。
 * 與 /api/words 分開，因為 /api/words 的完整 CRUD 只給管理後台使用、受 Basic Auth 保護，
 * 這裡只回傳分類名稱字串陣列，不曝露題目內容本身。
 */
export async function GET() {
  return NextResponse.json({ categories: getCategories() });
}
