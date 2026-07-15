// 로고에서 뽑은 글자 → 진짜 웹폰트(.woff2) 만들기
// 로고 규칙: 375×375 상자 · 10×10 격자(37.5) · 획 두께 75 · 자간 advance 398
const fs = require("fs");
const svg2ttf = require("svg2ttf");
const ttf2woff2 = require("ttf2woff2").default;
const { fixWinding } = require("./pathutil.cjs");

const J = JSON.parse(fs.readFileSync("letters.json", "utf8"));
const BOX = 375, ADV = 398, SB = (ADV - BOX) / 2; // side bearing 11.5
const UPM = 1000, CAP = 700;
const S = CAP / BOX; // 1.8667

// 좌표 변환: 크롭좌표(y 아래로) → 폰트좌표(y 위로, 베이스라인 0)
function transform(d, boxOffset) {
  return d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, xs, ys) => {
    const x = (parseFloat(xs) + boxOffset + SB) * S;
    const y = (BOX - parseFloat(ys)) * S;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
}

// 로고에 없는 Y — 같은 격자로 새로 그림 (팔 45°, 획 75, 기둥은 I와 동일 폭)
//  격자: 0 37.5 75 112.5 150 187.5 225 262.5 300 337.5 375
const G = (n) => n * 37.5;
const Y_PATH = [
  `M 0 0`,                      // 왼쪽 팔 바깥 위
  `L ${G(2)} 0`,
  `L ${G(5)} ${G(3)}`,          // 45°로 내려와 중앙
  `L ${G(8)} 0`,
  `L ${G(10)} 0`,
  `L ${G(6)} ${G(4)}`,          // 오른팔 안쪽 → 기둥 오른쪽
  `L ${G(6)} ${G(10)}`,
  `L ${G(4)} ${G(10)}`,
  `L ${G(4)} ${G(4)}`,          // 기둥 왼쪽
  `Z`,
].join(" ");

const GLYPHS = { F: "F", A: "A1", N: "N", T: "T1", S: "S", R: "R", I: "I", C: "C", K: "K" };
const out = [];
for (const [ch, key] of Object.entries(GLYPHS)) {
  const L = J.letters[key];
  const off = (BOX - L.w) / 2; // I 처럼 좁은 글자는 상자 가운데
  out.push(`<glyph unicode="${ch}" horiz-adv-x="${Math.round(ADV * S)}" d="${fixWinding(transform(L.d, off)).d}"/>`);
}
out.push(`<glyph unicode="Y" horiz-adv-x="${Math.round(ADV * S)}" d="${fixWinding(transform(Y_PATH, 0)).d}"/>`);
// 공백 (d 가 없으면 svg2ttf 가 죽으므로 빈 path 를 준다)
out.push(`<glyph unicode=" " horiz-adv-x="${Math.round(ADV * S * 0.5)}" d=""/>`);

const svgFont = `<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg">
<defs><font id="FantastrickLogo" horiz-adv-x="${Math.round(ADV * S)}">
<font-face font-family="Fantastrick Logo" units-per-em="${UPM}" ascent="${CAP}" descent="0" cap-height="${CAP}"/>
<missing-glyph horiz-adv-x="0"/>
${out.join("\n")}
</font></defs></svg>`;
fs.writeFileSync("fantastrick-logo.svg", svgFont);

const ttf = Buffer.from(svg2ttf(svgFont, { copyright: "FANTASTRICK" }).buffer);
fs.writeFileSync("fantastrick-logo.ttf", ttf);
fs.writeFileSync("fantastrick-logo.woff2", ttf2woff2(ttf));
console.log("woff2 크기:", fs.statSync("fantastrick-logo.woff2").size, "바이트");
