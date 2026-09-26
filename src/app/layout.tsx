import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
import { StoreProvider } from "@/components/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "OshiReady — 推しに会う日を、いちばん気持ちよく迎える。",
  description: "カレンダーの空き時間から、推し活の遠征・美容スケジュールを逆算して提案する AI エージェント。予約はあなたの承認後のみ。",
};

export const viewport: Viewport = {
  themeColor: "#1b1935",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
