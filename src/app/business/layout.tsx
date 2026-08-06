import type { Metadata } from "next";

// 이 폴더의 page.tsx 는 "use client" 라 metadata 를 직접 못 내보낸다(클라이언트 컴포넌트 제약).
// 그래서 layout 에서 대신 붙인다. 없으면 홈과 똑같은 제목이 붙어 검색결과에서 구분이 안 된다.
export const metadata: Metadata = {
  title: "방탈출 제작 · 제어기 · 매장 운영 프로그램 — 판타스트릭 비즈니스",
  description:
    "방을 통째로 만듭니다. 시나리오·문제 기획부터 인테리어, 전기 배선, 장치 제작, 마스터·슬레이브 제어기, 매장 운영 프로그램까지 한 팀이 합니다. 강남 직영 3곳 11년.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
