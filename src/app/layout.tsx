import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NoticeModal from "@/components/NoticeModal";

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
  themeColor: "#f4f6f9",
  // 이 사이트는 밝은 테마 전용 — 모바일 브라우저(삼성 인터넷 등)의 "다크 강제 반전" 방지
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="js">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
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

            display=swap → optional 로 바꿈 (2026-07-17). ⚠️ 이 한 단어가 화면 튐을 좌우한다.

            문제: swap 은 "글꼴 오기 전엔 기본 글꼴로 보여주고, 오면 바꿔치기" 다. 나눔명조는 기본 글꼴보다
                  가로가 좁아서, 바꿔치는 순간 제목이 3줄 → 2줄로 줄고 그 아래 내용 전체가 38px 위로
                  확 올라간다 (2차 점검 실측: 폰 /business 화면 튐 0.2362 — 기준 0.1).
                  손님이 버튼을 누르려는 순간 화면이 움직이면 엉뚱한 걸 누른다.

            block 은 왜 안 됐나: "글꼴 올 때까지 글자를 안 보여준다" 지만 **자리는 여전히 기본 글꼴 크기로
                  잡아둔다**. 그래서 안 보이는 채로 3줄을 차지하다가 글꼴이 오면 똑같이 튄다.
                  실제로 block 으로 바꿔봤더니 0.2357 로 그대로였다(글꼴 도착 6.2초 — 3초 제한도 초과).

            optional 은: 글꼴이 아주 빨리(0.1초 안에) 준비돼 있으면 쓰고, 아니면 **그 방문에선 아예 안 쓴다**.
                  바꿔치기 자체가 없으니 튀지 않는다. 글꼴은 뒤에서 받아 저장해 두므로 **다음 방문부터는
                  나눔명조로 보인다**.
                  ⇒ 대가: 처음 방문한 손님, 특히 인터넷이 느린 곳에서는 제목이 세리프가 아니라
                     본문 글꼴(Pretendard)로 보인다. "제목 글꼴이 항상 세리프로 나와야 한다" 면
                     이 값을 swap 으로 되돌리면 되는데, 그러면 화면 튐이 같이 돌아온다. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..900&family=Nanum+Myeongjo:wght@800&display=optional"
        />
      </head>
      <body>
        <Header />
        {children}
        <Footer />
        {/* 팝업 공지 — 기존 사이트처럼 모든 페이지에서 뜸(관리자에서 켤 때만) */}
        <NoticeModal />
        {/* 전역 필름 그레인 오버레이(1장) — 다크 크래프트 질감 */}
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
