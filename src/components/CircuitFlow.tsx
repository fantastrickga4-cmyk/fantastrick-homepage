"use client";
import { useEffect, useRef } from "react";

// 섹션 전환부를 가로지르는 인페이지 회로 밴드 — cantor8.io 정밀 재현.
//  · 페이지에 박혀 콘텐츠와 함께 스크롤(in-page). fixed 아님.
//  · 은은한 회로 트레이스(base) + 밝은 dash(pulse)가 같은 경로에 겹침.
//  · pulse 의 stroke-dashoffset 이 "이 밴드가 화면을 지나는 진행률"에 스크럽 →
//    밴드가 아래에서 올라와 위로 지나가는 동안 빛이 경로를 따라 흐른다(스크롤로만, 자동 아님).

function toPath(wp: number[][], r = 24): string {
  let s = `M${wp[0][0]} ${wp[0][1]}`;
  for (let i = 1; i < wp.length - 1; i++) {
    const [x0, y0] = wp[i - 1], [x, y] = wp[i], [x1, y1] = wp[i + 1];
    const ix = Math.sign(x - x0), iy = Math.sign(y - y0), ox = Math.sign(x1 - x), oy = Math.sign(y1 - y);
    s += ` L${x - ix * r} ${y - iy * r} Q${x} ${y} ${x + ox * r} ${y + oy * r}`;
  }
  const last = wp[wp.length - 1];
  s += ` L${last[0]} ${last[1]}`;
  return s;
}
// 가로 풀폭(양끝 화면 밖으로) + 둥근 계단 꺾임. viewBox 1440×500.
// cantor8 처럼 "거의 겹치는 두 선(main+sub)"으로 한 줄기가 두툼하게 보이게 — 같은 경로를 살짝 평행 오프셋.
const BASE = [[-80, 388], [372, 388], [372, 262], [760, 262], [760, 140], [1140, 140], [1140, 44], [1520, 44]];
const ROUTES: number[][][] = [
  BASE,
  BASE.map(([x, y]) => [x + 18, y + 15]), // 평행 오프셋(main+sub 겹침)
];

export default function CircuitFlow({ flip = false }: { flip?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pulses = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const svg = svgRef.current;
    if (!svg) return;
    let ticking = false;
    const apply = () => {
      ticking = false;
      const r = svg.getBoundingClientRect();
      const vh = window.innerHeight;
      // 밴드가 아래에서 올라와(0) 위로 완전히 지나갈(1) 때까지의 진행률
      const prog = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      pulses.current.forEach((pa, i) => {
        if (pa) pa.style.strokeDashoffset = String(-(1000 * (1 - prog)) - i * 120); // 두 선 살짝 desync
      });
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const routes = flip ? ROUTES.map((r) => r.map(([x, y]) => [1440 - x, y])) : ROUTES;
  const gid = flip ? "cfR" : "cfL";
  return (
    <svg className="cflow" viewBox="0 0 1440 500" preserveAspectRatio="none" aria-hidden="true" ref={svgRef}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8fb6ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#8fb6ff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#8fb6ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {routes.map((wp, i) => {
        const d = toPath(wp);
        return (
          <g key={i}>
            <path d={d} className="cf-rail" stroke={`url(#${gid})`} />
            <path d={d} ref={(el) => { pulses.current[i] = el; }} className="cf-pulse" pathLength={1000} strokeDasharray="130 870" />
          </g>
        );
      })}
    </svg>
  );
}
