import type { Metadata } from "next";

// 이 폴더의 page.tsx 는 "use client" 라 metadata 를 직접 못 내보낸다(클라이언트 컴포넌트 제약).
// 그래서 layout 에서 대신 붙인다. 없으면 홈과 똑같은 제목이 붙어 검색결과에서 구분이 안 된다.
export const metadata: Metadata = {
  title: "비즈니스 · B2B — 판타스트릭",
  description: "이야기와 게임 설계. 방탈출·머더미스터리·브랜드 체험 콘텐츠 기획·제작 문의.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
