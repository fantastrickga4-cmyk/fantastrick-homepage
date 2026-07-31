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
 *   npx tsx scripts/import-from-wp.mts --apply --sync    # 실시간 동기화 1회(추가+변경+삭제)
 *
 * --sync (2026-07-30, 운영 병행 테스트용):
 *   --apply 는 "새로 생긴 예약 추가"만 한다(기존 건은 memo 로 건너뜀). 그래서 기존
 *   사이트에서 취소·시간변경·승인이 일어나도 새 사이트에 반영이 안 된다.
 *   --sync 는 memo 속 예약 번호(#ID)를 열쇠로 세 방향을 다 맞춘다:
 *     · 기존 사이트에서 사라진 예약(취소) → 여기서도 삭제
 *     · 날짜·시간·상태가 달라진 예약(변경·승인) → 여기서도 수정
 *     · 새로 생긴 예약 → 추가
 *   5분마다 작업 스케줄러로 돌리면 준-실시간이 된다. 워드프레스에는 여전히 SELECT 만 한다.
 *
 * 넣은 데이터는 전부 source='wp-import' 로 표시된다. 나중에 실제 오픈 전에
 * 이 표시로 한 번에 지울 수 있다(--reset).
 */
import { createPool } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { THEMES, THEME_SLOTS, TIME_SLOTS, slotsForThemeDate } from "../src/lib/data.ts";

const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");
const SYNC = process.argv.includes("--sync");

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
       AND CAST(ts.meta_value AS UNSIGNED) >= UNIX_TIMESTAMP(CURDATE())
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
  } else if (SYNC) {
    // ── 4-b) 실시간 동기화: 삭제 → 수정 → 추가 순 ─────────────────────
    //   순서가 중요하다. 옮겨진 예약이 들어갈 칸(uq_res_slot)을 먼저 비워야 하므로
    //   삭제·수정을 추가보다 앞에 둔다. 실패한 건은 다음 회차(5분 뒤)가 다시 맞춘다.
    type Ex = { id: string; memo: string; date: string; time: string; status: string; deposit_paid: boolean; name: string };
    const existing = (await sb(
      `reservations?source=eq.${SOURCE_TAG}&select=id,memo,date,time,status,deposit_paid,name`
    )) as Ex[];
    const want = new Map(rowsToInsert.map((m) => [m.memo, m]));
    const have = new Map(existing.map((e) => [e.memo, e]));

    // 기존 사이트에서 사라진 예약(취소·삭제) → 여기서도 삭제
    //   ⚠️ 단 **입금이 확인된 예약은 지우지 않는다.** 돈이 들어온 기록이 조용히 사라지면
    //      환불해야 할 건이 장부에서 증발한다. 대신 '취소'로 남겨 사람이 보게 한다.
    //      (2026-07-31 "입금확인은 홈페이지가 주인" 규칙과 짝을 이룬다)
    let delOk = 0, keptPaid = 0;
    for (const e of existing.filter((x) => !want.has(x.memo))) {
      if (e.deposit_paid) {
        if (e.status !== "cancelled") {
          try { await sb(`reservations?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString() }) }); } catch { /* 다음 회차가 다시 맞춘다 */ }
        }
        keptPaid++;
        continue;
      }
      try { await sb(`reservations?id=eq.${e.id}`, { method: "DELETE" }); delOk++; }
      catch (err) { console.log(`  ❌ 삭제 실패 ${e.name} ${e.date} ${e.time}: ${(err as Error).message.slice(0, 120)}`); }
    }

    // 날짜·시간·상태가 달라진 예약(변경·승인) → 수정.
    //
    // 🔑 2026-07-31 규칙 변경 — **입금·확정은 올라가기만 하고 내려오지 않는다.**
    //   전에는 워드프레스가 모든 칸의 기준이라, 태블릿 자동입금확인이 눌러놓은 예약도
    //   기존 사이트가 아직 '대기'면 5분 뒤 대기로 되돌려 버렸다(= 자동확인이 무의미).
    //   이제 역할을 나눈다:
    //     · 기존 사이트가 기준 — 예약의 존재·날짜·시간·이름 (그쪽에서 손님을 받으니까)
    //     · 홈페이지가 기준 — **입금확인**(태블릿이 통장을 보고 처리하니까)
    //   그래서 "여기는 입금완료인데 저기는 아직 대기"인 경우엔 그 두 칸만 손대지 않는다.
    //   반대 방향(저기서 먼저 승인 → 여기 반영)은 그대로 따라간다.
    let upd = 0, kept = 0;
    for (const [memo, m] of want) {
      const e = have.get(memo);
      if (!e) continue;
      const holdPaid = e.deposit_paid && !m.deposit_paid; // 홈페이지가 앞서 있음 → 지킨다
      if (holdPaid) kept++;
      const sameOtherwise = e.date === m.date && e.time === m.time && e.name === m.name;
      if (sameOtherwise && (holdPaid || (e.status === m.status && e.deposit_paid === m.deposit_paid))) continue;

      const patch: Record<string, unknown> = { date: m.date, time: m.time, name: m.name };
      if (!holdPaid) {
        patch.status = m.status;
        patch.deposit_paid = m.deposit_paid;
        if (m.deposit_paid && !e.deposit_paid) { patch.confirmed_at = new Date().toISOString(); patch.paid_at = patch.confirmed_at; }
      }
      try { await sb(`reservations?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify(patch) }); upd++; }
      catch (err) { console.log(`  ❌ 수정 실패 ${m.name} ${m.date} ${m.time}: ${(err as Error).message.slice(0, 120)}`); }
    }
    if (kept || keptPaid) console.log(`  🔒 입금확인 지킴: 수정보류 ${kept}건 · 삭제보류(취소로 남김) ${keptPaid}건`);

    // 새로 생긴 예약 → 추가
    let ok = 0;
    for (const m of rowsToInsert.filter((x) => !have.has(x.memo))) {
      try { await sb("reservations", { method: "POST", body: JSON.stringify(m) }); ok++; }
      catch (e) { console.log(`  ❌ 추가 실패 ${m.name} ${m.date} ${m.time}: ${(e as Error).message.slice(0, 120)}`); }
    }
    console.log(`\n✅ 동기화: 추가 ${ok} · 수정 ${upd} · 삭제 ${delOk} (기존 사이트 기준 ${rowsToInsert.length}건)`);
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
