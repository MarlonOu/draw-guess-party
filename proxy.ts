import { NextRequest, NextResponse } from 'next/server';

/**
 * 保護 /admin 頁面與 /api/words 完整 CRUD（管理後台專用）。
 * 公開的 /api/word-categories（唯讀分類清單，供建房頁面使用）不受這層保護。
 *
 * 帳號密碼來自環境變數 ADMIN_USER / ADMIN_PASSWORD；未設定時使用開發用預設值
 * admin/admin，正式環境部署前務必在 .env 設定這兩個變數，否則等同沒有保護。
 *
 * 檔名為 proxy.ts（而非舊版 Next.js 慣用的 middleware.ts）：Next.js 16 將
 * middleware 慣例改名為 proxy，僅為命名慣例調整，行為不變。
 */
export function proxy(request: NextRequest) {
  const expectedUser = process.env.ADMIN_USER ?? 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD ?? 'admin';

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf-8');
    const separatorIndex = decoded.indexOf(':');
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (user === expectedUser && password === expectedPassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse('需要管理員登入', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="draw-guess-party admin"' },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/words/:path*'],
};
