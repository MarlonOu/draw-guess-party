import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 關掉開發模式左下角的浮標，避免它蓋住畫面（只影響 dev，正式環境本來就沒有）
  devIndicators: false,
};

export default nextConfig;
