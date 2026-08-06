import type { Metadata } from "next";

// page.tsx 가 "use client" 라 metadata 를 직접 못 내보낸다 → layout 에서 붙인다(/business 와 같은 방식).
export const metadata: Metadata = {
  title: "협업 · 브랜드 팝업 · 기업 교육 — 판타스트릭 비즈니스",
  description:
    "방탈출 방식으로 브랜드 팝업, 기업 교육, 전시 콘텐츠를 만듭니다. 기획·시나리오부터 인테리어·전기 배선·장치 제작·시공까지 한 팀이 합니다. 강남 직영 3곳 11년.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
