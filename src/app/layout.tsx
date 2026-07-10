import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
  themeColor: "#f4f1ea",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="js">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
        {/* 제목 전용 디스플레이 폰트: 나눔명조 ExtraBold(세리프) — 큰 제목만. 한글 글리프는 unicode-range split 서빙(CWV 안전). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@800&display=swap"
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
