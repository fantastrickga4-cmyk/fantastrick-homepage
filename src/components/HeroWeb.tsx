"use client";
import { useEffect, useRef } from "react";

// 히어로 배경 3D 성좌 단서망 — cantor8 네트워크 그래픽의 방탈출 번안.
// 연출: ① 마법진처럼 선이 천천히 그려지며 완성되고(draw-in) → ② 완성 후에는 지구 자전하듯
//       천천히 회전하는 3D 구(球). 마우스 반응 없음(요청). 장식이라 aria-hidden.
export default function HeroWeb() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 결정적 시드 난수(매번 같은 배치)
    let seed = 20260723;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    // 3D 구 표면에 점 배치(정돈: 26개)
    const N = 26;
    const pts = Array.from({ length: N }, () => {
      const u = rnd(), v = rnd();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 0.86 + rnd() * 0.16;
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        tw: rnd() * Math.PI * 2,
      };
    });
    // 가까운 점끼리 연결(3D 거리)
    const edges: [number, number][] = [];
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
        if (d < 0.62) edges.push([i, j]);
      }
    const E = edges.length;

    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const DRAW_DUR = 6.5;                    // 그려지는 시간(초) — 더 천천히
    const ROT_SPEED = (2 * Math.PI) / 55;    // 완성 후 회전(약 55초에 한 바퀴, 자전처럼)
    const BASE_Y = 0.2;                      // 초기 방향
    const TILT = 0.34;                       // 지구 축 기울기 느낌(고정)

    // dp: 그리기 진행률 0..1, rot: 완성 후 누적 회전각, t: 경과초(반짝임용)
    const render = (dp: number, rot: number, t: number) => {
      const ry = BASE_Y + rot;
      const rx = TILT;
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const scale = Math.min(W, H) * 0.46; // 살짝 크게
      const cx = W / 2, cy = H * 0.46;
      const f = 3.2;

      const proj = pts.map((p) => {
        const x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        const y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;
        const persp = f / (f - z);
        return { sx: cx + x * scale * persp, sy: cy + y * scale * persp, z };
      });

      ctx.clearRect(0, 0, W, H);

      // 선 — 마법진 그려지듯 순서대로(인덱스 스태거) 각 선이 a→b 로 자라난다
      for (let i = 0; i < E; i++) {
        const st = (i / E) * 0.82;
        const local = Math.min(1, Math.max(0, (dp - st) / 0.22));
        if (local <= 0) continue;
        const a = proj[edges[i][0]], b = proj[edges[i][1]];
        const x2 = a.sx + (b.sx - a.sx) * local;
        const y2 = a.sy + (b.sy - a.sy) * local;
        const k = ((a.z + b.z) / 2 + 1) / 2; // 뒤=0 앞=1
        ctx.strokeStyle = `rgba(200,222,255,${0.08 + k * 0.28})`;
        ctx.lineWidth = 1.1 + k * 1.6; // 더 굵게
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // 노드 — 그려질 때 하나씩 켜지고, 완성 후엔 아주 은은하게만 반짝
      for (let i = 0; i < N; i++) {
        const st = (i / N) * 0.82;
        const rev = Math.min(1, Math.max(0, (dp - st) / 0.12));
        if (rev <= 0) continue;
        const pr = proj[i];
        const k = (pr.z + 1) / 2;
        const tw = 0.9 + 0.1 * Math.sin(t * 1.6 + pts[i].tw);
        const r = 1.3 + k * 3.2;
        ctx.fillStyle = `rgba(210,226,255,${(0.3 + k * 0.62) * rev * tw})`;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let raf = 0;
    let startTime: number | null = null;
    if (reduce) {
      render(1, 0, 0); // 모션 최소화: 완성된 정적 1프레임
    } else {
      const loop = (now: number) => {
        if (startTime == null) startTime = now;
        const t = (now - startTime) / 1000;
        const dp = Math.min(1, t / DRAW_DUR);
        const rot = t > DRAW_DUR ? (t - DRAW_DUR) * ROT_SPEED : 0; // 완성 후부터 자전
        render(dp, rot, t);
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
