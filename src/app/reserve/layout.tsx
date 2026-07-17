import type { Metadata } from "next";

// 이 폴더의 page.tsx 는 "use client" 라 metadata 를 직접 못 내보낸다(클라이언트 컴포넌트 제약).
// 그래서 layout 에서 대신 붙인다. 없으면 홈과 똑같은 제목이 붙어 검색결과에서 구분이 안 된다.
export const metadata: Metadata = {
  title: "테마 예약 — 판타스트릭",
  description: "강남 판타스트릭 방탈출·머더룸 온라인 예약. 테마·날짜·시간을 골라 예약하세요.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
