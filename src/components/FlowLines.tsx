// 섹션 경계를 가로지르는 "흐르는 빛줄기" — cantor8.io 참고.
// 둥근 모서리 회로 트레이스(circuit trace) 라인 위로 밝은 빛 펄스가 흘러간다.
//  · base 라인: 은은한 파랑 그라디언트(양끝 페이드)
//  · pulse 라인: 같은 경로에 짧은 dash + stroke-dashoffset 애니메이션(globals.css) → 빛이 흐름
// 라인마다 속도·지연이 달라 불규칙하게 흐른다. 장식이라 aria-hidden.

// 맨해튼(수평·수직) 경유점을 둥근 모서리로 이어 d 문자열 생성
function toPath(wp: number[][], r = 18): string {
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

const ROUTES: number[][][] = [
  [[-40, 58], [360, 58], [360, 150], [720, 150], [720, 86], [1480, 86]],
  [[-40, 172], [520, 172], [520, 66], [980, 66], [980, 152], [1480, 152]],
  [[-40, 112], [240, 112], [240, 40], [640, 40], [640, 188], [1080, 188], [1080, 116], [1480, 116]],
];

export default function FlowLines({ flip = false }: { flip?: boolean }) {
  const routes = flip ? ROUTES.map((r) => r.map(([x, y]) => [1440 - x, y])) : ROUTES;
  return (
    <svg className="flowlines" viewBox="0 0 1440 220" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="flGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8fb6ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#8fb6ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#8fb6ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {routes.map((wp, i) => {
        const d = toPath(wp);
        return (
          <g key={i}>
            <path d={d} className="fl-base" stroke="url(#flGrad)" />
            <path d={d} className="fl-pulse" pathLength={1000}
              style={{ animationDuration: `${5.2 + i * 1.7}s`, animationDelay: `${-i * 2.3}s` }} />
          </g>
        );
      })}
    </svg>
  );
}
