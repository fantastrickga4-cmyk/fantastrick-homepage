/**
 * 기존 사이트(fantastrick.co.kr) 확정 예약 → 우리 사이트로 맞추기 (손실행용)
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ **평소 동기화는 이 스크립트가 아니라 클라우드플레어 크론이 한다**(2026-08-07 이전).
 *    5분마다 `POST /api/cron/wp-sync` 가 돌아간다 — 사장님 PC 가 꺼져 있어도 멈추지 않는다.
 *    이 스크립트는 **사람이 눈으로 확인하거나 손으로 한 번 돌릴 때** 쓴다:
 *      · 미리보기(무엇이 들어갈지) · 시간표 점검 · 되돌리기(--reset)
 *
 * 🔑 규칙은 전부 `src/lib/wp-sync.ts` 에 있다. 여기엔 규칙을 다시 쓰지 않는다 —
 *    두 벌로 갈라지면 크론과 손실행이 서로 다르게 동작한다.
 *
 * ⚠️ 기존 사이트는 실제 영업 중이다. SELECT 만 한다. 데이터는 한 방향으로만 흐른다.
 * ⚠️ 이 스크립트가 다루는 번호는 진짜 손님 번호다. 로그·화면에 그대로 찍지 말 것.
 *
 * 쓰는 법:
 *   npx tsx scripts/import-from-wp.mts                  # 미리보기만 (아무것도 안 바꿈)
 *   npx tsx scripts/import-from-wp.mts --apply --sync   # 지금 한 번 맞추기 (크론과 같은 동작)
 *   npx tsx scripts/import-from-wp.mts --apply --reset  # 가져온 예약 전부 지우고 처음부터
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { THEME_SLOTS, TIME_SLOTS, slotsForThemeDate, IMPORTED_SOURCE } from "../src/lib/data.ts";
import {
  WP_QUERY, mapRows, mirror, makeSupabaseRest, type WpRow,
} from "../src/lib/wp-sync.ts";

const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");
const SYNC = process.argv.includes("--sync");

function loadEnvFile(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
}

// 워드프레스 DB 접속 정보는 bank-auto 프로젝트의 .env 를 그대로 쓴다.
// (이 저장소에 운영 DB 비밀번호를 복사해 두지 않기 위함)
const WP_ENV_FILE = process.env.WP_ENV_FILE || "D:/test3/bank-auto/.env";
const wpEnv = process.env.WP_DB_HOST ? process.env as Record<string, string> : loadEnvFile(WP_ENV_FILE);
const hp = loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const sb = makeSupabaseRest(hp.SUPABASE_URL, hp.SUPABASE_SERVICE_ROLE_KEY);
const P = wpEnv.WP_TABLE_PREFIX || "wp_";

const conn = await createConnection({
  host: wpEnv.WP_DB_HOST,
  port: +wpEnv.WP_DB_PORT,
  user: wpEnv.WP_DB_USER,
  password: wpEnv.WP_DB_PASSWORD,
  database: wpEnv.WP_DB_NAME,
  charset: "utf8mb4",
  multipleStatements: false,
  disableEval: true, // 크론(워커)과 같은 조건으로 돌려 차이가 안 생기게 한다
});

try {
  // ── 1) 기존 사이트에서 읽어 우리 모양으로 바꾸기 (규칙은 lib/wp-sync.ts) ──
  const [raw] = await conn.query(WP_QUERY(P));
  const rows = raw as WpRow[];
  console.log(`기존 사이트에서 읽음: 앞으로 남은 확정 예약 ${rows.length}건`);

  const { mapped, skipped } = mapRows(rows);

  // ── 2) 미리보기 ──────────────────────────────────────────────────────
  const byTheme: Record<string, number> = {};
  for (const m of mapped) byTheme[m.theme_name] = (byTheme[m.theme_name] || 0) + 1;
  console.log("\n테마별:");
  for (const [k, v] of Object.entries(byTheme)) console.log(`  ${k.padEnd(14)} ${v}건`);
  console.log(`기간   : ${mapped[0]?.date} ~ ${mapped[mapped.length - 1]?.date}`);
  const noPhone = mapped.filter((m) => !m.phone);
  if (noPhone.length) {
    console.log(`⚠️ 기존 사이트에 전화번호가 없는 예약 ${noPhone.length}건 — 안내문자를 못 보낸다:`);
    for (const m of noPhone.slice(0, 10)) console.log(`  · ${m.date} ${m.time} ${m.theme_name} ${m.name}`);
  }
  if (skipped.length) { console.log(`\n건너뜀 ${skipped.length}건:`); for (const s of skipped) console.log(`  · ${s}`); }

  // 우리가 아는 시간표(THEME_SLOTS)에 실제 예약 시각이 들어있나?
  //   THEME_SLOTS 는 사람이 손으로 옮긴 값이라, 실제 예약과 어긋나면 "손님이 예약할 수 없는
  //   시간에 예약이 잡혀 있는" 상태가 된다. 가져오기 겸 시간표 검사.
  const offSlot = mapped.filter((m) => {
    const slots = slotsForThemeDate(THEME_SLOTS, {}, TIME_SLOTS, m.theme_id, m.store_id, m.date);
    return !slots.includes(m.time);
  });
  if (offSlot.length) {
    console.log(`\n⚠️ 우리 시간표에 없는 시각의 예약 ${offSlot.length}건 — 시간표가 실제와 다를 수 있음:`);
    for (const m of offSlot.slice(0, 12)) {
      const dow = "일월화수목금토"[new Date(m.date + "T00:00:00Z").getUTCDay()];
      const slots = slotsForThemeDate(THEME_SLOTS, {}, TIME_SLOTS, m.theme_id, m.store_id, m.date);
      console.log(`  · ${m.date}(${dow}) ${m.time} ${m.theme_name} → 그날 아는 시간: ${slots.join(", ") || "(없음)"}`);
    }
    if (offSlot.length > 12) console.log(`  … 외 ${offSlot.length - 12}건`);
  } else {
    console.log("\n✅ 모든 예약 시각이 우리 시간표 안에 있음 (시간표가 실제와 일치)");
  }

  // ── 3) 실제로 맞추기 ─────────────────────────────────────────────────
  if (!APPLY) {
    console.log("\n※ 미리보기만 했습니다. 실제로 맞추려면 --apply --sync 를 붙이세요.");
  } else {
    if (RESET) {
      const del = await sb(`reservations?source=eq.${IMPORTED_SOURCE}`, { method: "DELETE" });
      console.log(`\n전에 가져온 예약 ${(del as unknown[]).length}건 지움`);
    }
    if (SYNC || RESET) {
      const r = await mirror(mapped, sb);
      for (const e of r.errors) console.log(`  ❌ ${e}`);
      console.log(`\n✅ 맞추기 완료 — 추가 ${r.added}건 · 수정 ${r.changed}건 · 사라져서 취소 ${r.cancelled}건 (기존 사이트 ${mapped.length}건 기준)`);
    } else {
      console.log("\n※ --apply 만으로는 아무것도 안 합니다. --sync 를 함께 주세요.");
    }
  }
} finally {
  await conn.end();
}
