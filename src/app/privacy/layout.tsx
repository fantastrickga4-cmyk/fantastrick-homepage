import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 판타스트릭",
  description: "판타스트릭 홈페이지 개인정보처리방침 — 수집 항목·이용 목적·보유 기간·문의처.",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
