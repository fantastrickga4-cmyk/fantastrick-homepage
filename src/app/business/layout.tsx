import type { Metadata } from "next";

// 이 폴더의 page.tsx 는 "use client" 라 metadata 를 직접 못 내보낸다(클라이언트 컴포넌트 제약).
// 그래서 layout 에서 대신 붙인다. 없으면 홈과 똑같은 제목이 붙어 검색결과에서 구분이 안 된다.
export const metadata: Metadata = {
  title: "테마 제어기 · 매장 운영 프로그램 — 판타스트릭 비즈니스",
  description:
    "강남 3곳에서 11년째 직접 쓰는 방탈출 제어기와 매장 운영 프로그램을 그대로 납품합니다. 장치 32개부터 128개까지 모듈로 확장, 고장 자동 감시, 출퇴근·급여·예약·쿠폰 포함.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
