import type { Metadata } from "next";
import "./globals.css";
import ContractBadge from "./contract-badge";
import Sidebar from "./components/sidebar";
import { Backdrop } from "./components/ui";

export const metadata: Metadata = {
  title: "DELPHi Console",
  description: "Growth Intelligence for XCOPRI — 검토·가설·심의 대시보드",
};

/**
 * 셸 — Assets/ui-mockups 의 콘솔 형태를 그대로 옮겼다 (08/26).
 * 사이드바는 본문과 같은 바탕에 앉고, 카드만 떠오른다 (08/30 · docs/05 §0.5).
 */

/** 바탕 안 — 여기 한 곳만 바꾸면 화면 전체가 갈아탄다 (08/30, 팀장 비교용).
 *    "warm" 웜 크림 그라운드 + 앰비언트 블롭 · 흰 카드가 그림자로 떠오른다
 *    "flat" 흰 바탕 · 블롭 없음 · 카드는 **경계선**으로 선다 (globals.css 의
 *           `:root[data-ground="flat"]` 가 토큰을 갈아 끼운다)
 *  둘 다 실물로 보고 고른다 — 색만 지우면 카드가 바탕에 녹아 벤토가 표가 된다. */
const GROUND: "warm" | "flat" = "flat";   // 08/30 팀장 확정
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased" data-ground={GROUND}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&family=Noto+Sans+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-full">
        <Backdrop />
        <div className="flex min-h-dvh">
          {/* 08/30: 사이드바가 접이식이 되며 client 컴포넌트로 나갔다 — 고정(sticky)·유리
              재질·메뉴 구성은 그대로고, 접으면 아이콘 레일(64px)만 남는다. */}
          <Sidebar />
          <main className="min-w-0 flex-1 px-6 py-7 md:px-8">{children}</main>
          <ContractBadge />
        </div>
      </body>
    </html>
  );
}
