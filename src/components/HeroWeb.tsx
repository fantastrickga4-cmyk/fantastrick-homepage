"use client";
import { useEffect, useRef } from "react";

// 히어로 배경 — 플로우 필드(Flow Field) 파티클.
// 수백 개 미세 입자가 '보이지 않는 흐름장(노이즈 벡터필드)'을 따라 흐르며 옅은 궤적을 남긴다.
// 생성예술(generative) 감성의 지적인 움직임. 도형이 튀지 않게 아주 옅게 깔아 워드마크를 방해하지 않음.
// (마우스 반응 없음 · reduced-motion 시 정적 프레임 · 장식이라 aria-hidden)

// 값 노이즈(Perlin 유사) — 흐름 방향을 부드럽게 만든다
function makeNoise(seed: number) {
  const perm = [...Array(256).keys()];
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const grad = (h: number, x: number, y: number) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u), lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v);
  };
}

export default function HeroWeb() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const noise = makeNoise(20260724);

    let W = 0, H = 0, dpr = 1;
    let pts: { x: number; y: number }[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 입자 수 = 화면 넓이에 비례(모바일은 자동으로 적게), 상한 900
      const N = Math.min(900, Math.max(120, Math.round((W * H) / 2400)));
      pts = Array.from({ length: N }, () => ({ x: Math.random() * W, y: Math.random() * H }));
      ctx.clearRect(0, 0, W, H);
    };
    resize();
    window.addEventListener("resize", resize);

    // 한 프레임: 옛 궤적을 조금 지우고(페이드) → 새 궤적 한 겹 그리기
    const step = (t: number) => {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.055)"; // 서서히 사라지는 잔상
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(140,190,255,0.17)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const q of pts) {
        const a = noise(q.x * 0.0017, q.y * 0.0017 + t * 0.03) * Math.PI * 3; // 흐름 각도
        const nx = q.x + Math.cos(a) * 1.6, ny = q.y + Math.sin(a) * 1.6;
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(nx, ny);
        q.x = nx; q.y = ny;
        // 화면 밖으로 나가거나 가끔 랜덤으로 다시 태어남(뭉침 방지)
        if (q.x < 0 || q.x > W || q.y < 0 || q.y > H || Math.random() < 0.0022) {
          q.x = Math.random() * W; q.y = Math.random() * H;
        }
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    if (reduce) {
      // 모션 최소화: 잔상 없이 정적 흐름 무늬 한 장만 만들어 둔다
      for (let k = 0; k < 90; k++) step(k * 0.04);
    } else {
      let start: number | null = null;
      const loop = (now: number) => {
        if (start == null) start = now;
        step((now - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="ht-web-canvas" aria-hidden="true" />;
}
