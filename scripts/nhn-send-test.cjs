// NHN Cloud 문자 발송 실테스트 (키를 받은 직후 "진짜 나가는지" 5초 만에 확인용)
//
//   사용법:  node scripts/nhn-send-test.cjs 01012345678 ["보낼 문구"]
//
// 왜 필요한가: 홈페이지를 통해 확인하려면 예약을 하나 만들고 관리자에서 입금확인을 눌러야 한다.
//   실패해도 원인이 키 문제인지 코드 문제인지 안 보인다. 이 스크립트는 NHN 응답을 **그대로** 찍어서
//   "발신번호 미등록"인지 "시크릿키 오류"인지 바로 알려준다.
//
// ⚠️ 실제 문자가 발송된다(요금 발생). 테스트 번호(010-0000-xxxx)로는 NHN 이 안 받으므로 본인 번호로 할 것.

const fs = require("fs");
const path = require("path");

// .env.local 읽기 (dotenv 없이도 돌게 — 이 스크립트는 배포에 안 들어간다)
function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// 통신사 기준 바이트(한글 2바이트). src/lib/sms.ts 의 smsByteLength 와 같은 규칙이어야 한다.
function byteLen(s) {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) < 128 ? 1 : 2;
  return n;
}

(async () => {
  const env = { ...loadEnv(), ...process.env };
  const appKey = env.NHN_SMS_APPKEY;
  const secret = env.NHN_SMS_SECRET;
  const from = (env.NHN_SENDER || "").replace(/[^0-9]/g, "");
  const to = (process.argv[2] || "").replace(/[^0-9]/g, "");
  const body = process.argv[3] || "[판타스트릭] 문자 발송 테스트입니다. 이 문자가 보이면 연동이 끝난 것입니다.";

  if (!appKey || !secret || !from) {
    console.error("✗ .env.local 에 NHN_SMS_APPKEY / NHN_SMS_SECRET / NHN_SENDER 를 먼저 채워주세요.");
    process.exit(1);
  }
  if (!to) {
    console.error("✗ 받을 번호를 넣어주세요.  예)  node scripts/nhn-send-test.cjs 01012345678");
    process.exit(1);
  }

  const long = byteLen(body) > 90;
  const url = `https://sms.api.nhncloudservice.com/sms/v3.0/appKeys/${appKey}/sender/${long ? "mms" : "sms"}`;
  const payload = { body, sendNo: from, recipientList: [{ recipientNo: to }] };
  if (long) payload.title = "판타스트릭 예약 안내";

  console.log(`→ ${long ? "LMS(장문)" : "SMS(단문)"} / ${byteLen(body)}바이트 / ${from} → ${to}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8", "X-Secret-Key": secret },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  console.log(`← HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));

  if (json?.header?.isSuccessful) {
    console.log("\n✔ 접수 성공. 잠시 뒤 문자가 도착하면 끝입니다.");
  } else {
    console.log("\n✗ 실패. header.resultMessage 를 보세요.");
    console.log("   자주 나오는 것: 발신번호 미등록 / 시크릿키 불일치 / 서비스 미활성화");
  }
})();
