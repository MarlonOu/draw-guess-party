import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "畫圖猜謎派對",
  description: "線上多人即時畫圖猜謎",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
