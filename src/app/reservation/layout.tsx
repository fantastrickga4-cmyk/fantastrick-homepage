import type { Metadata } from "next";

// 이 폴더의 page.tsx 는 "use client" 라 metadata 를 직접 못 내보낸다(클라이언트 컴포넌트 제약).
// 그래서 layout 에서 대신 붙인다. 없으면 홈과 똑같은 제목이 붙어 검색결과에서 구분이 안 된다.
export const metadata: Metadata = {
  title: "예약 조회·취소 — 판타스트릭",
  description: "예약자 이름·전화번호·비밀번호로 예약을 조회하고 취소·환불 신청을 할 수 있습니다.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
