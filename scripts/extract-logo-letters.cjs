// 로고 PNG → 글자별로 잘라 벡터(SVG path) 추출
const { Jimp } = require("jimp");
const potrace = require("potrace");
const fs = require("fs");

const SRC = "D:/test3/fantastrick-homepage/public/images/logo-black.png";

(async () => {
  const img = await Jimp.read(SRC);
  const { width: W, height: H } = img.bitmap;
  console.log("원본", W, "x", H);

  // 세로줄마다 잉크(검정 픽셀)가 있는지 → 글자 경계 찾기
  const inkCol = [];
  for (let x = 0; x < W; x++) {
    let ink = 0;
    for (let y = 0; y < H; y++) {
      const c = img.getPixelColor(x, y);
      const r = (c >> 24) & 255, a = c & 255;
      if (a > 128 && r < 128) ink++;
    }
    inkCol.push(ink);
  }
  // 잉크가 있는 구간 묶기
  const segs = [];
  let s = -1;
  for (let x = 0; x < W; x++) {
    if (inkCol[x] > 0 && s < 0) s = x;
    if ((inkCol[x] === 0 || x === W - 1) && s >= 0) { segs.push([s, x]); s = -1; }
  }
  console.log("구간", segs.length, "개:", segs.map(([a, b]) => `${a}-${b}`).join(" "));

  // 첫 구간 = 열쇠 아이콘(네모 박스), 나머지가 글자 F A N T A S T R I C K
  const NAMES = ["F", "A1", "N", "T1", "A2", "S", "T2", "R", "I", "C", "K"];
  const letters = segs.slice(1);
  console.log("글자 후보", letters.length, "개 (기대 11개)");

  // 글자 전체의 위/아래 경계 (cap height 기준을 하나로)
  let top = H, bot = 0;
  for (const [x0, x1] of letters) {
    for (let y = 0; y < H; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = img.getPixelColor(x, y);
        if ((c & 255) > 128 && ((c >> 24) & 255) < 128) { if (y < top) top = y; if (y > bot) bot = y; break; }
      }
    }
  }
  console.log("글자 상단", top, "하단", bot, "→ cap height", bot - top + 1);

  const out = {};
  for (let i = 0; i < letters.length; i++) {
    const [x0, x1] = letters[i];
    const name = NAMES[i] || `X${i}`;
    const w = x1 - x0 + 1, h = bot - top + 1;
    const crop = img.clone().crop({ x: x0, y: top, w, h });
    const file = `_ltr_${name}.png`;
    await crop.write(file);
    const svg = await new Promise((res, rej) =>
      potrace.trace(file, { threshold: 128, turdSize: 2, optCurve: false }, (e, s) => (e ? rej(e) : res(s))));
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" ");
    out[name] = { w, h, d };
    fs.unlinkSync(file);
    console.log(`${name}: 폭 ${w} · path ${d.length}자`);
  }
  fs.writeFileSync("letters.json", JSON.stringify({ capTop: top, capBot: bot, letters: out }, null, 1));
  console.log("\n→ letters.json 저장");
})();
