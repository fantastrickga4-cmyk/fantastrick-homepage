/**
 * 기존 사이트(fantastrick.co.kr) → 새 사이트로 "앞으로 남은 예약" 복사하기
 * ─────────────────────────────────────────────────────────────────────
 * 새 사이트를 실제 운영처럼 굴려보려면 진짜 예약표가 있어야 한다. 그래서 기존
 * 워드프레스에서 앞으로 남은 예약만 읽어와 이 사이트에 채워 넣는다.
 *
 * ⚠️ 기존 사이트는 실제 영업 중이다. 이 스크립트는 SELECT 만 한다.
 *    INSERT/UPDATE/DELETE 를 워드프레스에 절대 보내지 않는다. 데이터는 한 방향으로만 흐른다.
 *
 * ⚠️ 전화번호는 진짜를 쓰지 않는다. 010-0000-XXXX(연습용)로 바꿔 넣는다.
 *    이 사이트는 매일 아침 "내일 예약"에 리마인더 문자를 자동 발송하고 관리자가 버튼을
 *    눌러도 문자가 나가므로, 진짜 번호가 섞이면 아무 잘못 없는 손님에게 문자가 간다.
 *    (lib/sms.ts 의 isTestPhone 가드가 한 겹 더 막지만, 애초에 넣지 않는 게 먼저다)
 *
 * 쓰는 법:
 *   npx tsx scripts/import-from-wp.mts            # 미리보기만 (아무것도 안 바꿈)
 *   npx tsx scripts/import-from-wp.mts --apply    # 실제로 넣기
 *   npx tsx scripts/import-from-wp.mts --apply --reset   # 전에 넣은 연습 데이터 지우고 새로
 *
 * 넣은 데이터는 전부 source='wp-import' 로 표시된다. 나중에 실제 오픈 전에
 * 이 표시로 한 번에 지울 수 있다(--reset).
 */
import { createPool } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { THEMES, THEME_SLOTS, TIME_SLOTS, slotsForThemeDate } from "../src/lib/data.ts";

const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");

// 이 표시가 붙은 예약 = 연습용으로 가져온 것
const SOURCE_TAG = "wp-import";
// 연습용 전화번호 대역 (lib/sms.ts 의 TEST_PHONE_PREFIX 와 반드시 같아야 함)
const TEST_PHONE_PREFIX = "0100000";

// 워드프레스 캘린더(term_id) → 새 사이트 테마 id.
// 나머지(매장·이름·예약금)는 src/lib/data.ts 에서 가져온다 — 값을 두 곳에 적어두면 언젠가 어긋난다.
// 특히 예약금: 시간의 영속성은 기존 사이트 60,000 / 새 사이트 63,000 이라 새 사이트 값이 맞다.
const CALENDAR_TO_THEME: Record<number, string> = {
  17: "firstfoundbride", // 태초의 신부 (1호점)
  23: "bookofduat",      // 사자의 서 (2호점)
  24: "ldc",             // 락다운시티 (3호점)
  25: "time",            // 시간의 영속성 (3호점)
};

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

/** epoch → 한국 시각. Booked 는 한국 시각을 UTC 인 척 저장한다(2026-07-16 실측 8/8 확인). */
function toKstParts(epoch: number): { date: string; time: string } {
  const iso = new Date(epoch * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** 예약 번호에서 만드는 연습용 가짜 번호. 다시 돌려도 같은 값이 나온다. */
function fakePhone(apptId: number): string {
  return TEST_PHONE_PREFIX + String(apptId % 10000).padStart(4, "0");
}

const sb = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${hp.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: hp.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${hp.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const pool = createPool({
  host: wpEnv.WP_DB_HOST,
  port: +wpEnv.WP_DB_PORT,
  user: wpEnv.WP_DB_USER,
  password: wpEnv.WP_DB_PASSWORD,
  database: wpEnv.WP_DB_NAME,
  charset: "utf8mb4",
  multipleStatements: false,
  connectionLimit: 2,
});
const P = wpEnv.WP_TABLE_PREFIX || "wp_";

type Row = {
  ID: number; post_status: string; post_date: Date;
  name: string; epoch: number; cal: number | null;
};

try {
  // ── 1) 기존 사이트에서 읽기 (SELECT 만) ─────────────────────────────
  const [rows] = await pool.query<Row[] & import("mysql2").RowDataPacket[]>(
    `SELECT p.ID, p.post_status, p.post_date,
            u.display_name AS name,
            CAST(ts.meta_value AS UNSIGNED) AS epoch,
            tt.term_id AS cal
     FROM ${P}posts p
     JOIN ${P}postmeta pm_user ON pm_user.post_id=p.ID AND pm_user.meta_key='_appointment_user'
     JOIN ${P}users u ON u.ID=pm_user.meta_value
     JOIN ${P}postmeta ts ON ts.post_id=p.ID AND ts.meta_key='_appointment_timestamp'
     LEFT JOIN ${P}term_relationships tr ON tr.object_id=p.ID
     LEFT JOIN ${P}term_taxonomy tt ON tt.term_taxonomy_id=tr.term_taxonomy_id
       AND tt.taxonomy='booked_custom_calendars'
     WHERE p.post_type='booked_appointments'
       AND p.post_status IN ('publish','draft')
       AND CAST(ts.meta_value AS UNSIGNED) >= UNIX_TIMESTAMP(NOW())
     ORDER BY epoch ASC`
  );
  console.log(`기존 사이트에서 읽음: 앞으로 남은 예약 ${rows.length}건`);

  // ── 2) 새 사이트 모양으로 바꾸기 ────────────────────────────────────
  const skipped: string[] = [];
  const mapped = rows.flatMap((r) => {
    const themeId = r.cal != null ? CALENDAR_TO_THEME[r.cal] : undefined;
    const theme = themeId ? THEMES.find((t) => t.id === themeId) : undefined;
    if (!theme) { skipped.push(`#${r.ID} 캘린더(${r.cal}) 를 새 사이트 테마로 못 알아봄`); return []; }

    const { date, time } = toKstParts(r.epoch);
    const confirmed = r.post_status === "publish";
    const createdAt = new Date(r.post_date).toISOString();

    return [{
      store_id: theme.store,
      theme_id: theme.id,
      theme_name: theme.name,
      date, time,
      people: 2,                        // 기존 사이트에 인원 정보가 없음 → 2명으로 표시
      name: r.name,
      phone: fakePhone(r.ID),           // ⚠️ 진짜 번호 아님 (연습용)
      deposit: theme.deposit,           // 새 사이트 기준 금액
      deposit_paid: confirmed,          // 승인된 예약 = 입금된 것
      status: confirmed ? "confirmed" : "pending",
      source: SOURCE_TAG,
      memo: `[연습용] 기존사이트 예약 #${r.ID} · 인원 미상(2명 표시) · 전화 가짜`,
      created_at: createdAt,
      ...(confirmed ? { confirmed_at: createdAt, paid_at: createdAt } : {}),
    }];
  });

  // 같은 매장·테마·날짜·시간에 두 건이면 새 사이트가 막는다(uq_res_slot) → 먼저 걸러서 알려준다
  const seen = new Set<string>();
  const rowsToInsert = mapped.filter((m) => {
    const k = `${m.store_id}|${m.theme_id}|${m.date}|${m.time}`;
    if (seen.has(k)) { skipped.push(`${m.name} ${m.date} ${m.time} ${m.theme_name} — 같은 칸에 이미 다른 예약`); return false; }
    seen.add(k); return true;
  });

  // ── 3) 미리보기 ────────────────────────────────────────────────────
  const byTheme: Record<string, number> = {};
  for (const m of rowsToInsert) byTheme[m.theme_name] = (byTheme[m.theme_name] || 0) + 1;
  console.log("\n테마별:");
  for (const [k, v] of Object.entries(byTheme)) console.log(`  ${k.padEnd(14)} ${v}건`);
  const st = rowsToInsert.reduce((a, m) => { a[m.status] = (a[m.status] || 0) + 1; return a; }, {} as Record<string, number>);
  console.log(`상태별: ${Object.entries(st).map(([k, v]) => `${k} ${v}건`).join(" / ")}`);
  console.log(`기간   : ${rowsToInsert[0]?.date} ~ ${rowsToInsert[rowsToInsert.length - 1]?.date}`);
  if (skipped.length) { console.log(`\n건너뜀 ${skipped.length}건:`); for (const s of skipped) console.log(`  · ${s}`); }

  // 새 사이트가 아는 시간표(THEME_SLOTS)에 실제 예약 시각이 들어있나?
  //   THEME_SLOTS 는 사람이 손으로 옮긴 값이라, 실제 예약과 어긋나면 "손님이 예약할 수 없는
  //   시간에 예약이 잡혀 있는" 상태가 된다. 가져오기 겸 시간표 검사.
  const offSlot = rowsToInsert.filter((m) => {
    const slots = slotsForThemeDate(THEME_SLOTS, {}, TIME_SLOTS, m.theme_id, m.store_id, m.date);
    return !slots.includes(m.time);
  });
  if (offSlot.length) {
    console.log(`\n⚠️ 새 사이트 시간표에 없는 시각의 예약 ${offSlot.length}건 — 시간표가 실제와 다를 수 있음:`);
    for (const m of offSlot.slice(0, 12)) {
      const dow = "일월화수목금토"[new Date(m.date + "T00:00:00Z").getUTCDay()];
      const slots = slotsForThemeDate(THEME_SLOTS, {}, TIME_SLOTS, m.theme_id, m.store_id, m.date);
      console.log(`  · ${m.date}(${dow}) ${m.time} ${m.theme_name} → 그날 아는 시간: ${slots.join(", ") || "(없음)"}`);
    }
    if (offSlot.length > 12) console.log(`  … 외 ${offSlot.length - 12}건`);
  } else {
    console.log("\n✅ 모든 예약 시각이 새 사이트 시간표 안에 있음 (시간표가 실제와 일치)");
  }

  console.log("\n샘플 3건 (실제로 들어갈 모양):");
  for (const m of rowsToInsert.slice(0, 3)) {
    console.log(`  ${m.date} ${m.time} ${m.theme_name} / ${m.name} / ${m.people}명 / ${m.deposit.toLocaleString()}원 / ${m.status} / ${m.phone}`);
  }

  if (!APPLY) {
    console.log("\n※ 미리보기만 했습니다. 실제로 넣으려면 --apply 를 붙이세요.");
  } else {
    // ── 4) 넣기 ──────────────────────────────────────────────────────
    if (RESET) {
      const del = await sb(`reservations?source=eq.${SOURCE_TAG}`, { method: "DELETE" });
      console.log(`\n전에 넣은 연습 데이터 ${(del as unknown[]).length}건 지움`);
    }
    const existing = (await sb(`reservations?source=eq.${SOURCE_TAG}&select=memo`)) as { memo: string }[];
    const have = new Set(existing.map((e) => e.memo));
    const fresh = rowsToInsert.filter((m) => !have.has(m.memo));
    console.log(`이미 있는 것 ${have.size}건 → 새로 넣을 것 ${fresh.length}건`);

    let ok = 0;
    for (const m of fresh) {
      try { await sb("reservations", { method: "POST", body: JSON.stringify(m) }); ok++; }
      catch (e) { console.log(`  ❌ ${m.name} ${m.date} ${m.time}: ${(e as Error).message.slice(0, 120)}`); }
    }
    console.log(`\n✅ ${ok}건 넣음`);
  }
} finally {
  await pool.end();
}
