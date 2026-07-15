// potrace 가 뽑아준 path 를 폰트가 쓰는 규칙(nonzero: 바깥과 구멍이 반대 방향)으로 고친다.
// potrace 는 구멍(카운터)을 바깥과 같은 방향으로 내보내서, 그대로 폰트에 넣으면 구멍이 메워진다.

// path 문자열 → 서브패스 배열 [{start:[x,y], segs:[{t:'L'|'C', pts:[[x,y],...]}]}]
function parse(d) {
  const toks = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/gi) || [];
  const subs = [];
  let i = 0, cur = null, cmd = null;
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    const t = toks[i];
    if (/^[MLCZ]$/i.test(t)) { cmd = t.toUpperCase(); i++; if (cmd === "Z") continue; }
    if (cmd === "M") {
      const p = [num(), num()];
      cur = { start: p, segs: [] }; subs.push(cur);
      cmd = "L"; // M 뒤에 좌표가 이어지면 암묵적 L
    } else if (cmd === "L") {
      cur.segs.push({ t: "L", pts: [[num(), num()]] });
    } else if (cmd === "C") {
      cur.segs.push({ t: "C", pts: [[num(), num()], [num(), num()], [num(), num()]] });
    } else { i++; }
  }
  return subs;
}

const endOf = (sub, k) => (k === 0 ? sub.start : sub.segs[k - 1].pts.at(-1));

// 부호 있는 넓이 (양수=반시계) — 곡선은 끝점만으로 근사해도 방향 판단엔 충분
function area(sub) {
  const pts = [sub.start, ...sub.segs.map((s) => s.pts.at(-1))];
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function inside(pt, sub) {
  const pts = [sub.start, ...sub.segs.map((s) => s.pts.at(-1))];
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function reverse(sub) {
  const pts = [sub.start, ...sub.segs.map((s) => s.pts.at(-1))];
  const out = { start: pts.at(-1), segs: [] };
  for (let k = sub.segs.length - 1; k >= 0; k--) {
    const s = sub.segs[k], from = endOf(sub, k);
    if (s.t === "L") out.segs.push({ t: "L", pts: [from] });
    else out.segs.push({ t: "C", pts: [s.pts[1], s.pts[0], from] });
  }
  return out;
}

function toD(subs) {
  return subs.map((s) =>
    `M ${s.start.map(n => n.toFixed(1)).join(" ")} ` +
    s.segs.map((g) => `${g.t} ${g.pts.map((p) => p.map(n => n.toFixed(1)).join(" ")).join(" ")}`).join(" ") + " Z"
  ).join(" ");
}

// 바깥은 반시계, 구멍(다른 것 안에 든 것)은 시계 방향이 되게 맞춘다
function fixWinding(d) {
  const subs = parse(d);
  const fixed = subs.map((s, i) => {
    const depth = subs.filter((o, j) => j !== i && inside(s.start, o)).length;
    const wantCCW = depth % 2 === 0;      // 0겹=바깥, 1겹=구멍
    const isCCW = area(s) > 0;
    return isCCW === wantCCW ? s : reverse(s);
  });
  return { d: toD(fixed), subs: subs.length };
}

module.exports = { fixWinding };
