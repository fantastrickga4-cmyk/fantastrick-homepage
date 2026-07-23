import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NoticeModal from "@/components/NoticeModal";
import ThemeShell from "@/components/ThemeShell";

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
  themeColor: "#062a80",
  // 우리가 직접 칠하는 다크(파란) 테마. colorScheme:light 는 모바일 브라우저의 "자동 다크 반전"을 막기 위한 것.
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="js">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        {/* 라틴 본문/제목 그로테스크 — cantor8 의 "PP Neue Montreal"(상업용 유료)을 무료로 대체한
            General Sans(Fontshare, 상업용 무료). 한글은 라틴 글리프가 없으니 자동으로 Pretendard 로 폴백된다. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" />
        {/* 본문 폰트 — variable + dynamic-subset.
            전에는 static/pretendard.css 를 썼는데, 굵기 4종을 각각 750KB 통짜로 받아
            **홈 전송량 3.6MB 중 3.3MB(92%)가 글꼴**이었다(3G 로딩 19초 실측, 2026-07-17).
            이 버전은 글자 대역별로 92조각으로 쪼개져 있어 **화면에 실제로 쓰는 글자만** 받고,
            굵기도 한 파일(45~920)로 다 해결한다.
            ⚠️ 글꼴 이름이 'Pretendard Variable' 이라 globals.css 의 font-family 도 같이 바꿔야 한다
               (이름만 두면 폰트가 통째로 안 먹고 시스템 글꼴로 떨어진다). */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
        {/* 제목 전용 디스플레이 폰트: 나눔명조 ExtraBold(세리프) — 큰 제목만. 한글 글리프는 unicode-range split 서빙(CWV 안전).

            ⚠️ display=swap 은 일부러 유지한다. 2026-07-17에 화면 튐(/business 폰 CLS 0.24) 때문에
               block·optional 로 바꿔봤지만 **둘 다 답이 아니었다**. 다시 건드리기 전에 아래를 읽을 것:
                 - block   : 글자만 숨기고 **자리는 기본 글꼴 크기로 그대로 잡아둔다** → 튐 그대로(실측 0.2357).
                 - optional: 튐은 없어지지만 글꼴이 0.1초 안에 준비된 경우만 쓰므로, **처음 온 손님은
                             제목이 세리프로 안 보인다**(실측: 나눔명조가 아예 안 쓰이고 Pretendard로 렌더).
                             게다가 이 경우에도 Pretendard 가 늦게 뜨며 여전히 튀었다 → 문제 해결도 안 됨.
               진짜 원인은 "글꼴이 바뀌며 제목 줄 수가 3줄↔2줄로 달라지는 것" 이라, globals.css 의
               `.biz-hero h1` 에 **자리를 미리 잡아두는 것**으로 해결했다. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..900&family=Nanum+Myeongjo:wght@800&display=swap"
        />
      </head>
      <body>
        <Header />
        <ThemeShell>{children}</ThemeShell>
        <Footer />
        {/* 팝업 공지 — 기존 사이트처럼 모든 페이지에서 뜸(관리자에서 켤 때만) */}
        <NoticeModal />
        {/* 전역 필름 그레인 오버레이(1장) — 다크 크래프트 질감 */}
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
