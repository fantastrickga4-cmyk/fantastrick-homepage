"use client";
import { useEffect } from "react";

// 스크롤 등장 연출용 — 화면에 들어온 .reveal 요소에 .in 을 붙인다.
// page.tsx / business/page.tsx 는 클라이언트 컴포넌트라 훅을 직접 썼지만,
// 서버 컴포넌트 페이지(about 등)에서는 이 작은 컴포넌트를 한 번만 심어 같은 효과를 낸다.
// (globals.css 의 `.js .reveal{opacity:0}` 는 .in 이 붙어야 보이므로, 이게 없으면 내용이 안 뜬다)
// 렌더 결과물이 없는 순수 사이드이펙트 컴포넌트.
export default function RevealOnScroll() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.14 }
    );
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
