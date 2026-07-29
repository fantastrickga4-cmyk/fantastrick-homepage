// 테스트용 예약 넣기 / 지우기 (사장님이 관리자 화면을 둘러보기 위한 가짜 예약)
//
//   넣기 : node scripts/seed-test-reservations.mjs
//   지우기: node scripts/seed-test-reservations.mjs --clean
//
// ⚠️ 테스트 예약은 전부 전화번호가 010-0000-**** 이고 메모에 [테스트] 가 붙습니다.
//    --clean 은 그 조건에 맞는 것만 지우므로 진짜 손님 예약은 절대 지워지지 않습니다.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ⚠️ 홈페이지가 저장하는 것과 **같은 모양**(하이픈 없는 숫자만)으로 넣는다.
//    전엔 "010-0000-0001" 처럼 하이픈을 넣어서, 관리자 화면엔 보이는데
//    손님 조회 화면(예약 조회·취소)에서는 같은 번호로 안 잡혔다 — 조회는 글자를 그대로 비교하는데
//    홈페이지는 숫자만("01000000001") 저장하기 때문. 손님 화면까지 테스트하려면 모양이 같아야 한다.
const TEST_PHONE = "0100000";
const OLD_TEST_PHONE = "010-0000-"; // 옛 버전이 넣어둔 것도 --clean 으로 같이 지워주기 위해
const TAG = "[테스트]";
const KST = 9 * 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();
// KST 기준 날짜 문자열 (오늘=0, 내일=1 …)
const day = (offset) => new Date(now + KST + offset * 86400000).toISOString().slice(0, 10);
// 오늘 KST 특정 시각 → UTC ISO
const todayAt = (h, m) => {
  const d = new Date(now + KST);
  d.setUTCHours(h, m, 0, 0);
  return iso(d.getTime() - KST);
};
const minsAgo = (n) => iso(now - n * 60000);

// theme_id → store_id / theme_name
const T = {
  firstfoundbride: ["s1", "태초의 신부", 30000],
  bookofduat: ["s2", "사자의 서", 25000],
  ldc: ["s3", "락다운시티", 120000],
  time: ["s3", "시간의 영속성", 63000],
};

// 사장님이 관리자 화면에서 볼 상황들을 골고루
const CASES = [
  { 설명: "오늘 · 입금완료 확정 (다음 손님으로 크게 뜸)",
    theme: "firstfoundbride", date: day(0), time: "19:20", people: 4, name: "김서연", phone: "0001",
    status: "confirmed", paid: true, payer: null, created: minsAgo(2880), paid_at: minsAgo(2820) },

  { 설명: "오늘 · 미입금 대기 (30분 카운트다운 도는 중)",
    theme: "bookofduat", date: day(0), time: "20:40", people: 3, name: "박지훈", phone: "0002",
    status: "pending", paid: false, created: minsAgo(11) },

  { 설명: "오늘 · 새벽 2시 접수 미입금 (오전 10시까지 유예 — '새벽 예약' 표시)",
    theme: "ldc", date: day(0), time: "21:00", people: 3, name: "이하늘", phone: "0003",
    status: "pending", paid: false, created: todayAt(2, 10) },

  { 설명: "오늘 · 입금자명이 예약자와 다름 (통장엔 엄마 이름)",
    theme: "time", date: day(0), time: "22:00", people: 3, name: "정민재", phone: "0004",
    status: "confirmed", paid: true, payer: "정영숙", created: minsAgo(1500), paid_at: minsAgo(1440), src: "manual" },

  { 설명: "내일 · 자동매칭이 입금을 잡아준 건 (🤖 자동 배지)",
    theme: "firstfoundbride", date: day(1), time: "18:00", people: 5, name: "최유진", phone: "0005",
    status: "confirmed", paid: true, created: minsAgo(700), paid_at: minsAgo(660), src: "auto" },

  { 설명: "모레 · 접수만 됨 (아직 입금 확인 전, 시간 넉넉)",
    theme: "bookofduat", date: day(2), time: "17:10", people: 2, name: "한도윤", phone: "0006",
    status: "pending", paid: false, created: minsAgo(20) },

  { 설명: "취소 · 환불해줘야 함 (24시간 이전 취소 → 100%)",
    theme: "ldc", date: day(3), time: "19:00", people: 4, name: "송하람", phone: "0007",
    status: "cancelled", paid: true, created: minsAgo(4300), paid_at: minsAgo(4200),
    cancelled_at: minsAgo(120), refund: { rate: 100, bank: "카카오뱅크", acct: "3333-01-1234567", holder: "송하람" } },

  { 설명: "취소 · 사장님이 취소함 → 손님 계좌 몰라 계좌 입력 필요 (24시간 전 → 100%)",
    theme: "time", date: day(5), time: "20:00", people: 3, name: "강해린", phone: "0012",
    status: "cancelled", paid: true, created: minsAgo(6000), paid_at: minsAgo(5900),
    cancelled_at: minsAgo(90), refund: { rate: 100, bank: null, acct: null, holder: null } },

  { 설명: "취소 · 환불 이미 보냄 (하루 전 자정까지 취소 → 80%)",
    theme: "firstfoundbride", date: day(4), time: "16:40", people: 3, name: "오세훈", phone: "0008",
    status: "cancelled", paid: true, created: minsAgo(7000), paid_at: minsAgo(6900),
    cancelled_at: minsAgo(3000), refunded_at: minsAgo(2800),
    refund: { rate: 80, bank: "국민은행", acct: "123456-01-234567", holder: "오세훈" } },

  { 설명: "취소 · 당일 취소라 환불 없음 (0%)",
    theme: "bookofduat", date: day(-1), time: "19:30", people: 2, name: "임채원", phone: "0009",
    status: "cancelled", paid: true, created: minsAgo(5000), paid_at: minsAgo(4900),
    cancelled_at: minsAgo(1500), refund: { rate: 0, bank: null, acct: null, holder: null } },

  { 설명: "취소 · 미입금이라 자동으로 취소됨 (30분 지남)",
    theme: "time", date: day(2), time: "18:00", people: 3, name: "배시우", phone: "0010",
    status: "cancelled", paid: false, created: minsAgo(90), cancelled_at: minsAgo(55), auto: true },

  { 설명: "지난 예약 · 정상 이용 완료",
    theme: "ldc", date: day(-2), time: "17:00", people: 3, name: "윤가온", phone: "0011",
    status: "confirmed", paid: true, created: minsAgo(9000), paid_at: minsAgo(8900) },
];

// 이 스크립트가 만든 예약만 지운다.
//   ⚠️ 앞자리로 뭉뚱그려 지우면 안 된다(like "0100000%").
//      기존 사이트에서 옮겨온 **진짜 예약**들도 번호가 010-0000-**** 로 가려져 있어
//      앞자리가 똑같다(01000007941 등). 통째로 지워진다.
//   ⚠️ 메모의 [테스트] 표시로 고르는 것도 안 된다 — 미입금 자동취소가 메모를 덮어쓴다.
//   → 그래서 아래 CASES 가 만드는 번호만 **정확히 그 목록으로** 지운다.
//   ⚠️ 번호만 맞으면 지우는 것도 위험하다 — 예전에 딴 데서 만든 테스트 예약이 같은 번호를
//      쓰고 있으면 그것까지 쓸어간다(실제로 010-0000-0002 짜리 한 건이 그렇게 지워졌다).
//      그래서 **번호 + 이름**이 둘 다 맞는 것만 지운다.
if (process.argv.includes("--clean")) {
  const phones = [
    ...CASES.map((c) => TEST_PHONE + c.phone),
    ...CASES.map((c) => OLD_TEST_PHONE + c.phone), // 하이픈 넣던 옛 버전이 남긴 것까지
  ];
  const names = CASES.map((c) => c.name);
  const { data } = await db.from("reservations").select("id,name").in("phone", phones).in("name", names);
  if (!data?.length) { console.log("지울 테스트 예약이 없어요."); process.exit(0); }
  await db.from("reservation_logs").delete().in("reservation_id", data.map((r) => r.id));
  await db.from("reservations").delete().in("id", data.map((r) => r.id));
  console.log(`테스트 예약 ${data.length}건 삭제 완료`);
  process.exit(0);
}

let ok = 0;
for (const c of CASES) {
  const [store, themeName, deposit] = T[c.theme];
  const row = {
    store_id: store, theme_id: c.theme, theme_name: themeName,
    date: c.date, time: c.time, people: c.people,
    name: c.name, phone: TEST_PHONE + c.phone, pin: "1234",
    deposit, deposit_paid: c.paid, status: c.status,
    deposit_payer: c.payer ?? null,
    paid_at: c.paid_at ?? null,
    // 입금을 누가 확인했나: manual(사장님 버튼) / auto(자동매칭) — 안 정한 건은 비워둠(이 기능 전 기록처럼 보임)
    paid_source: c.src ?? (c.paid ? "manual" : null),
    created_at: c.created,
    cancelled_at: c.cancelled_at ?? null,
    refunded_at: c.refunded_at ?? null,
    refund_rate: c.refund?.rate ?? null,
    refund_bank: c.refund?.bank ?? null,
    refund_account: c.refund?.acct ?? null,
    refund_holder: c.refund?.holder ?? null,
    memo: c.auto ? `미입금으로 자동 취소 ${TAG}` : `${TAG} ${c.설명}`,
  };
  const { data, error } = await db.from("reservations").insert(row).select("id").single();
  if (error) { console.log(`✗ ${c.name} ${c.date} ${c.time} — ${error.message}`); continue; }

  // 변경 이력도 같이 (관리자 화면의 '이력' 보기용)
  const logs = [{ action: "접수", detail: `${c.people}명 · ${themeName}`, created_at: c.created }];
  if (c.paid_at) logs.push({ action: "입금확인", detail: c.payer ? `입금자명 ${c.payer}` : null, created_at: c.paid_at });
  if (c.cancelled_at) logs.push({ action: "취소", detail: c.auto ? "미입금 30분 경과 자동취소" : `환불율 ${c.refund?.rate ?? 0}%`, created_at: c.cancelled_at });
  if (c.refunded_at) logs.push({ action: "환불완료", detail: `${c.refund.bank} ${c.refund.holder}`, created_at: c.refunded_at });
  await db.from("reservation_logs").insert(logs.map((l) => ({ ...l, reservation_id: data.id })));

  ok++;
  console.log(`✓ ${c.date} ${c.time} ${c.name} — ${c.설명}`);
}
console.log(`\n${ok}/${CASES.length}건 넣음. 지울 때: node scripts/seed-test-reservations.mjs --clean`);
