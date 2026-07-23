"use client";
import { useEffect, useRef } from "react";

// 히어로 배경 3D 성좌 단서망 — cantor8 네트워크 그래픽의 방탈출 번안.
// 점들을 3D 구(球) 위에 뿌리고 원근투영으로 그린다: 앞쪽 별은 크고 밝게, 뒤쪽은 작고 흐리게(입체감).
// 자동으로 천천히 회전 + 마우스 위치에 따라 시점(요/피치)이 부드럽게 따라온다. 장식이라 aria-hidden.
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

    // 3D 구 표면에 점 배치(개수 줄여 정돈: 26개)
    const N = 26;
    const pts = Array.from({ length: N }, () => {
      const u = rnd(), v = rnd();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 0.86 + rnd() * 0.16; // 살짝 두께감
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        tw: rnd() * Math.PI * 2, // 반짝임 위상
      };
    });
    // 가까운 점끼리 연결(3D 거리) — 임계값 작게 잡아 선을 적게(깔끔)
    const edges: [number, number][] = [];
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
        if (d < 0.62) edges.push([i, j]);
      }

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

    // 마우스 → 목표 회전(부드럽게 lerp)
    let targetRX = 0, targetRY = 0, curRX = 0, curRY = 0;
    const onMove = (e: MouseEvent) => {
      targetRY = (e.clientX / window.innerWidth - 0.5) * 0.9;  // 좌우 → yaw
      targetRX = (e.clientY / window.innerHeight - 0.5) * 0.7; // 상하 → pitch
    };
    if (!reduce) window.addEventListener("mousemove", onMove, { passive: true });

    let t = reduce ? 0.6 : 0;
    let raf = 0;

    const render = () => {
      curRX += (targetRX - curRX) * 0.05;
      curRY += (targetRY - curRY) * 0.05;
      const ry = t + curRY;                        // 자동 회전 + 마우스
      const rx = 0.14 * Math.sin(t * 0.7) + curRX; // 살짝 끄덕이며 + 마우스
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const scale = Math.min(W, H) * 0.4;
      const cx = W / 2, cy = H * 0.46;
      const f = 3.2; // 원근 강도

      const proj = pts.map((p) => {
        // Y축 회전
        const x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        // X축 회전
        const y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;
        const persp = f / (f - z); // z 클수록(앞) 커짐
        return { sx: cx + x * scale * persp, sy: cy + y * scale * persp, z };
      });

      ctx.clearRect(0, 0, W, H);

      // 선(뒤는 흐리게, 앞은 진하게)
      for (const [i, j] of edges) {
        const a = proj[i], b = proj[j];
        const depth = (a.z + b.z) / 2;            // -1..1
        const k = (depth + 1) / 2;                // 0..1
        ctx.strokeStyle = `rgba(200,222,255,${0.07 + k * 0.26})`;
        ctx.lineWidth = 0.5 + k * 0.9;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
      // 노드(앞은 크고 밝게 + 반짝임)
      for (let i = 0; i < N; i++) {
        const pr = proj[i];
        const k = (pr.z + 1) / 2; // 0..1 (앞=1)
        const tw = reduce ? 1 : 0.62 + 0.38 * Math.sin(t * 3 + pts[i].tw);
        const r = (1.0 + k * 2.8) * tw;
        ctx.fillStyle = `rgba(210,226,255,${(0.3 + k * 0.62) * tw})`;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reduce) {
      render(); // 모션 줄이기: 한 프레임만 정적으로
    } else {
      const loop = () => {
        t += 0.0022;
        render();
        raf = requestAnimationFrame(loop);
      };
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="ht-web-canvas" aria-hidden="true" />;
}
