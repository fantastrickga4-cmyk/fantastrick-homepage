import type { Metadata } from "next";

// 소개 페이지 전용 메타데이터 — 검색결과·공유 시 홈과 구분되게 별도 제목/설명을 붙인다.
export const metadata: Metadata = {
  title: "회사 소개 — 판타스트릭",
  description:
    "Fantasy와 Trick 사이. 판타스트릭은 이야기를 공간과 장치로 지어 올려, 문을 여는 순간 당신을 다른 세계에 세우는 강남 이머시브 방탈출 브랜드입니다. 콘텐츠·공간·장치를 한 팀에서 직접 만드는 인하우스 제작.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
