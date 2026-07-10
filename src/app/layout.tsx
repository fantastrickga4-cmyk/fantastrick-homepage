import type { Metadata, Viewport } from "next";
import { Gothic_A1 } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// 제목/eyebrow 전용 디스플레이 폰트(한글 지원·무료) — self-host(next/font). 본문은 Pretendard 유지.
// next/font/google 의 Gothic A1 타입은 한글 subset 을 노출하지 않음(라틴 계열만).
// → 디스플레이 폰트는 라틴/eyebrow 에 적용, 한글 제목은 이미 로드된 Pretendard 로 렌더(추가 웹폰트 수 MB 회피, CWV 보호).
const display = Gothic_A1({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "판타스트릭 FANTASTRICK — 강남 이머시브 방탈출 & 머더룸",
  description:
    "일상이 멈추고, 이야기가 시작된다. 강남 11년차 이머시브 방탈출·머더룸 브랜드 판타스트릭. 테마 예약·후기.",
  icons: { icon: "/images/favicon.png" },
  openGraph: {
    title: "판타스트릭 FANTASTRICK",
    description: "일상이 멈추고, 이야기가 시작된다 — 강남 이머시브 방탈출 & 머더룸",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090a15",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`js ${display.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body>
        <Header />
        {children}
        <Footer />
        {/* 전역 필름 그레인 오버레이(1장) — 다크 크래프트 질감 */}
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
