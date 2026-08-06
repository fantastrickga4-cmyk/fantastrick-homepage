// .env.local 의 값들을 Cloudflare Worker 시크릿으로 올리기 위한 JSON 을 만든다.
//
//   확인:  node scripts/cf-secrets.cjs            (이름만 출력, 값은 안 보여줌)
//   등록:  node scripts/cf-secrets.cjs --json | npx wrangler secret bulk
//
// 왜 파이프로 넘기나: 시크릿을 임시 파일로 디스크에 떨구지 않기 위해서다.
// (전에 vercel env 를 PowerShell 파이프로 넣었다가 빈 값으로 등록된 적이 있어, 등록 뒤에는
//  반드시 `npx wrangler secret list` 로 이름이 올라왔는지 확인할 것)

const fs = require("fs");
const path = require("path");

// 워커에 있어야 하는 것들. 여기 없는 값은 올리지 않는다(로컬 전용 값이 섞여 올라가지 않게).
const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_ID",
  "CRON_SECRET",
  "BANK_WEBHOOK_SECRET",
  "BANK_DRY_RUN",
  // 문자·알림톡 (NHN Cloud)
  "NHN_SMS_APPKEY",
  "NHN_SMS_SECRET",
  "NHN_SENDER",
  "NHN_ALIMTALK_APPKEY",
  "NHN_ALIMTALK_SECRET",
  "NHN_SENDER_KEY",
  "NHN_TPL_CONFIRM",
  "NHN_TPL_CANCEL",
  // 직원용 안내문자 앱(reservation-sms)이 오늘 예약을 읽을 때 쓰는 열쇠.
  // 관리자 비밀번호와 **별개** — 새면 이 값만 바꾸면 된다. (api/staff/today)
  "STAFF_TOKEN",
];

const p = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(p)) {
  console.error("✗ .env.local 이 없습니다.");
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const out = {};
const empty = [];
for (const k of KEYS) {
  const v = env[k];
  if (v) out[k] = v;
  else empty.push(k);
}

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(out));
} else {
  console.log("올라갈 값 :", Object.keys(out).join(", ") || "(없음)");
  console.log("비어 있음 :", empty.join(", ") || "(없음)");
  console.log("\n등록하려면:  node scripts/cf-secrets.cjs --json | npx wrangler secret bulk");
}
