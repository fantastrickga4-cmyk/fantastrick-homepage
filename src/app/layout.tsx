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
  themeColor: "#090a15",
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
      </head>
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
