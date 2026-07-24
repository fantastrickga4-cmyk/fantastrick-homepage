import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이벤트 — 판타스트릭 FANTASTRICK",
  description: "지금 판타스트릭에서 진행 중인 이벤트 — 옵저버 제도, 리뷰 이벤트 소식.",
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
