"use client";
import { useEffect, useRef } from "react";

// 스크롤 반응형 세로 빛줄기 2개 (cantor8 참고).
// 화면 양쪽 세로 라인 위로, 손님이 스크롤하면 빛이 그 방향(위/아래)으로 흐른다.
//  · 자동으로 움직이지 않음 — 스크롤할 때만 나타남(멈추면 서서히 사라짐)
//  · 스크롤이 빠를수록 빛이 더 길고 밝게 쭉 늘어남(streak)
//  · 두 줄은 이동 속도가 달라 서로 다르게 흐름
export default function ScrollBeams() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let last = window.scrollY;
    let pos1 = window.innerHeight * 0.25;
    let pos2 = window.innerHeight * 0.6;
    let speed = 0, op = 0, raf = 0;

    const onScroll = () => {
      const s = window.scrollY;
      const d = s - last;
      last = s;
      pos1 += d * 0.9;   // 빛이 스크롤 방향으로 이동(두 줄 속도 다름)
      pos2 += d * 1.28;
      speed = Math.max(speed, Math.min(260, Math.abs(d))); // 스크롤 속도(감쇠는 loop에서)
    };

    const loop = () => {
      const vh = window.innerHeight;
      const len = 150 + Math.min(560, speed * 6);         // 빠를수록 길게
      const y1 = (((pos1 % vh) + vh) % vh) - len / 2;
      const y2 = (((pos2 % vh) + vh) % vh) - len / 2;
      op += (Math.min(1, speed / 20) - op) * 0.16;         // 빠를수록 밝게
      speed *= 0.86;                                        // 멈추면 서서히 사라짐
      el.style.setProperty("--by1", `${y1.toFixed(1)}px`);
      el.style.setProperty("--by2", `${y2.toFixed(1)}px`);
      el.style.setProperty("--len", `${len.toFixed(0)}px`);
      el.style.setProperty("--op", op.toFixed(3));
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="scrollbeams" ref={ref} aria-hidden="true">
      <div className="sb sb-1"><i style={{ transform: "translateY(var(--by1,-300px))" }} /></div>
      <div className="sb sb-2"><i style={{ transform: "translateY(var(--by2,-300px))" }} /></div>
    </div>
  );
}
