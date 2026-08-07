/**
 * 기존 사이트(fantastrick.co.kr) 확정 예약 → 우리 사이트 거울 맞추기 (공용 코드)
 * ────────────────────────────────────────────────────────────────────────────
 * 같은 로직을 두 곳에서 쓴다:
 *   · 크론  — src/app/api/cron/wp-sync (클라우드플레어가 5분마다 부른다)
 *   · 손실행 — scripts/import-from-wp.mts (미리보기·시간표 점검·되돌리기용)
 * **두 벌로 갈라지면 언젠가 어긋난다.** 규칙은 전부 여기 한 곳에만 둔다.
 *
 * ⚠️ 워드프레스에는 SELECT 만 한다. 저쪽은 실제 영업 중이고, 데이터는 한 방향으로만 흐른다.
 *
 * 🔑 무엇을 가져오나 — **확정(publish) 예약만**. 입금대기(draft)는 안 가져온다.
 *    그 입금 확인이 저쪽에서 일어나므로, 우리는 확정된 것만 받아 안내문자 대상으로 삼는다.
 *
 * 🔑 무엇을 맞추나 — 거울이다. 저쪽이 주인.
 *      · 새로 생긴 예약 → 추가
 *      · 시간·상태·이름·번호가 달라졌으면 → 저쪽 값으로 수정 (취소됐던 것도 되살린다)
 *      · 저쪽에서 사라진 예약 → 취소 처리 (그 자리를 비워 다른 예약이 들어올 수 있게)
 *    ⚠️ 그래서 wp-import 예약을 우리 관리자 화면에서 고쳐도 5분 뒤 되돌아온다.
 *       확정·취소는 기존 사이트에서 해야 한다.
 */
import { THEMES, IMPORTED_SOURCE } from "./data";

/** 워드프레스 캘린더(term_id) → 우리 테마 id. 나머지(매장·이름·예약금)는 data.ts 가 주인이다. */
export const CALENDAR_TO_THEME: Record<number, string> = {
  17: "firstfoundbride", // 태초의 신부 (1호점)
  23: "bookofduat",      // 사자의 서 (2호점)
  24: "ldc",             // 락다운시티 (3호점)
  25: "time",            // 시간의 영속성 (3호점)
};

export type WpDbConfig = {
  host: string; port: number; user: string; password: string; database: string; prefix?: string;
};

export type WpRow = {
  ID: number; post_status: string; post_date: string | Date;
  name: string; phone: string | null; epoch: number; cal: number | null;
};

/** 우리 reservations 표에 넣을 모양 */
export type MappedRow = {
  store_id: string; theme_id: string; theme_name: string;
  date: string; time: string; people: number;
  name: string; phone: string; deposit: number; deposit_paid: boolean;
  status: string; source: string; memo: string; created_at: string;
  confirmed_at?: string; paid_at?: string;
};

export type SyncResult = {
  read: number;          // 기존 사이트에서 읽은 확정 예약 수
  added: number;         // 새로 넣은 것
  changed: number;       // 저쪽에 맞춰 고친 것
  cancelled: number;     // 저쪽에서 사라져 취소한 것
  skipped: string[];     // 못 가져온 것(캘린더 매칭 실패·같은 칸 중복)
  errors: string[];      // 쓰기 실패
};

/** epoch → 한국 시각. Booked 는 한국 시각을 UTC 인 척 저장한다(2026-07-16 실측). */
export function toKstParts(epoch: number): { date: string; time: string } {
  const iso = new Date(epoch * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * 워드프레스가 준 전화번호를 숫자만 남긴다(우리는 숫자만 저장한다 — lib/util.ts).
 *
 * ⚠️ Booked 는 전화번호를 **usermeta 의 last_name 에** 넣는다(성씨 칸이 아니다).
 *    관리자 화면에 "김노현 01052556546" 으로 보이는 게 first_name+last_name 이다.
 *
 * 번호로 안 보이면 빈 문자열을 준다 — 아무 번호나 넣어 **엉뚱한 사람에게 문자가 가는 것**이
 * 최악이다. 빈 채로 두면 안내문자 앱에서 눈에 띄고, 직원이 손으로 채운다.
 */
export function realPhone(raw: string | null): string {
  const p = (raw || "").replace(/[^0-9]/g, "");
  return /^01[016789][0-9]{7,8}$/.test(p) ? p : "";
}

/**
 * memo 에서 기존사이트 예약번호를 뽑는다 = **이미 가져왔는지 판별하는 열쇠.**
 *
 * 전에는 memo 문자열 전체가 열쇠였다. 그래서 문구를 한 글자만 고쳐도 이미 가져온 수백 건이
 * "처음 보는 예약"이 되어 통째로 다시 들어갔다. 열쇠를 예약번호로 좁혀 문구와 분리한다.
 * 옛 형식 `[연습용] 기존사이트 예약 #38522` 도 같은 열쇠(38522)가 나온다.
 */
export function apptIdOf(memo: string | null | undefined): string | null {
  return memo?.match(/#(\d+)/)?.[1] ?? null;
}

/** 오늘(KST). 워커는 UTC 라 그냥 자르면 새벽 0~9시에 어제가 나온다. */
export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 기존 사이트에서 앞으로 남은 **확정** 예약을 읽는다 (SELECT 전용) */
export const WP_QUERY = (prefix: string) => `
  SELECT p.ID, p.post_status, p.post_date,
         u.display_name AS name,
         ln.meta_value AS phone,
         CAST(ts.meta_value AS UNSIGNED) AS epoch,
         tt.term_id AS cal
    FROM ${prefix}posts p
    JOIN ${prefix}postmeta pm_user ON pm_user.post_id=p.ID AND pm_user.meta_key='_appointment_user'
    JOIN ${prefix}users u ON u.ID=pm_user.meta_value
    -- ⚠️ 이름은 display_name 이지만 **전화번호는 usermeta.last_name** 이다.
    --    LEFT JOIN 인 이유: 번호가 없는 회원이 있어도 그 예약을 통째로 잃지 않기 위해서다.
    LEFT JOIN ${prefix}usermeta ln ON ln.user_id=pm_user.meta_value AND ln.meta_key='last_name'
    JOIN ${prefix}postmeta ts ON ts.post_id=p.ID AND ts.meta_key='_appointment_timestamp'
    LEFT JOIN ${prefix}term_relationships tr ON tr.object_id=p.ID
    LEFT JOIN ${prefix}term_taxonomy tt ON tt.term_taxonomy_id=tr.term_taxonomy_id
      AND tt.taxonomy='booked_custom_calendars'
   WHERE p.post_type='booked_appointments'
     AND p.post_status='publish'
     AND CAST(ts.meta_value AS UNSIGNED) >= UNIX_TIMESTAMP(CURDATE())
   ORDER BY epoch ASC`;

/** 워드프레스 줄 → 우리 표 모양. 못 알아본 것과 같은 칸 중복은 skipped 로 알려준다. */
export function mapRows(rows: WpRow[]): { mapped: MappedRow[]; skipped: string[] } {
  const skipped: string[] = [];
  const all = rows.flatMap<MappedRow>((r) => {
    const themeId = r.cal != null ? CALENDAR_TO_THEME[r.cal] : undefined;
    const theme = themeId ? THEMES.find((t) => t.id === themeId) : undefined;
    if (!theme) { skipped.push(`#${r.ID} 캘린더(${r.cal}) 를 우리 테마로 못 알아봄`); return []; }

    const { date, time } = toKstParts(r.epoch);
    // 위 WHERE 가 publish 만 읽으므로 지금은 항상 true 다. 조건을 남겨두는 건, 나중에 draft 를
    // 다시 읽게 되더라도 상태 매핑이 여기 한 곳에 남아 있게 하기 위해서다.
    const confirmed = r.post_status === "publish";
    // 🔴 워드프레스의 post_date 는 **접수 시각으로 믿을 수 없다**(2026-08-02 실측).
    //    DB NOW() 가 06:51 인데 post_date 가 12:07 인 미래 값이 여럿이었다. 그대로 쓰면
    //    30분 카운트다운이 "5시간 남음"이 된다. → 미래면 지금(가져온 시각)으로 잡는다.
    const rawCreated = new Date(r.post_date).getTime();
    const createdAt = new Date(Math.min(rawCreated, Date.now())).toISOString();

    return [{
      store_id: theme.store,
      theme_id: theme.id,
      theme_name: theme.name,
      date, time,
      people: 2,                       // 기존 사이트에 인원 정보가 없음 → 2명으로 표시
      name: r.name,
      phone: realPhone(r.phone),
      deposit: theme.deposit,          // 금액은 우리 기준이 맞다
      deposit_paid: confirmed,
      status: confirmed ? "confirmed" : "pending",
      source: IMPORTED_SOURCE,
      // ⚠️ `#${r.ID}` 는 이미 가져왔는지 판별하는 열쇠다(apptIdOf). 형식을 깨지 말 것.
      memo: `[기존사이트] 예약 #${r.ID} · 인원 미상(2명 표시)`,
      created_at: createdAt,
      ...(confirmed ? { confirmed_at: createdAt, paid_at: createdAt } : {}),
    }];
  });

  // 같은 매장·테마·날짜·시간에 두 건이면 우리 쪽 유니크 인덱스(uq_res_slot)가 막는다 → 먼저 걸러 알려준다
  const seen = new Set<string>();
  const mapped = all.filter((m) => {
    const k = `${m.store_id}|${m.theme_id}|${m.date}|${m.time}`;
    if (seen.has(k)) { skipped.push(`${m.name} ${m.date} ${m.time} ${m.theme_name} — 같은 칸에 이미 다른 예약`); return false; }
    seen.add(k); return true;
  });
  return { mapped, skipped };
}

type ExistingRow = {
  id: string; memo: string; phone: string; date: string; time: string;
  store_id: string; theme_id: string; theme_name: string; name: string;
  status: string; deposit_paid: boolean; confirmed_at: string | null; paid_at: string | null;
};

const EXISTING_COLS =
  "id,memo,phone,date,time,store_id,theme_id,theme_name,name,status,deposit_paid,confirmed_at,paid_at";

/** 우리 쪽을 mapped 와 똑같이 맞춘다. 순서(취소 → 수정 → 추가)에 이유가 있다 — 아래 주석 참고. */
export async function mirror(
  mapped: MappedRow[],
  sb: (path: string, init?: RequestInit) => Promise<unknown>,
): Promise<Omit<SyncResult, "read" | "skipped">> {
  const existing = (await sb(
    `reservations?source=eq.${IMPORTED_SOURCE}&select=${EXISTING_COLS}`,
  )) as ExistingRow[];

  const byId = new Map<string, ExistingRow>();
  for (const e of existing) { const k = apptIdOf(e.memo); if (k) byId.set(k, e); }
  const wanted = new Map(mapped.map((m) => [apptIdOf(m.memo)!, m]));
  const now = new Date().toISOString();
  const errors: string[] = [];

  // ── ① 저쪽에서 사라진 예약 → 취소 ──────────────────────────────────────
  //
  // 먼저 하는 이유: 취소해야 그 칸이 빈다(uq_res_slot 은 취소건을 세지 않는다). 자리를 안 비우면
  // 저쪽에서 그 칸으로 옮겨온 **진짜 예약이 409 로 계속 튕긴다**(실제로 며칠간 그랬다).
  //
  // ⚠️ **오늘 이후만** 본다. 기존 사이트는 지난 예약을 읽어오지 않으므로(WHERE epoch >= 오늘),
  //    과거 행까지 넣으면 "저쪽에 없다"며 지난 예약 전부를 취소해 버린다.
  const today = todayKst();
  let cancelled = 0;
  for (const [apptId, e] of byId) {
    if (wanted.has(apptId)) continue;
    if (e.date < today || e.status === "cancelled") continue;
    try {
      await sb(`reservations?id=eq.${e.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled", cancelled_at: now, auto_cancelled: false }),
      });
      cancelled++;
    } catch (err) { errors.push(`취소 실패 #${apptId}: ${(err as Error).message.slice(0, 100)}`); }
  }

  // ── ② 달라진 예약 → 저쪽 값으로 맞추기 ─────────────────────────────────
  let changed = 0;
  for (const [apptId, m] of wanted) {
    const e = byId.get(apptId);
    if (!e) continue;
    const patch: Record<string, unknown> = {};
    if (e.date !== m.date) patch.date = m.date;
    if (e.time !== m.time) patch.time = m.time;
    if (e.store_id !== m.store_id) patch.store_id = m.store_id;
    if (e.theme_id !== m.theme_id) { patch.theme_id = m.theme_id; patch.theme_name = m.theme_name; }
    if (e.name !== m.name) patch.name = m.name;
    // 저쪽에 번호가 없으면 우리 쪽 번호를 지우지 않는다 — 직원이 손으로 채운 번호가 사라지면 안 된다.
    if (m.phone && e.phone !== m.phone) patch.phone = m.phone;
    if (e.status !== m.status) patch.status = m.status;
    if (e.deposit_paid !== m.deposit_paid) patch.deposit_paid = m.deposit_paid;
    // 취소됐던 것이 저쪽에 살아있으면 되살린다.
    if (e.status === "cancelled" && m.status !== "cancelled") {
      patch.cancelled_at = null; patch.auto_cancelled = false;
    }
    // 확정으로 바뀌는데 시각 기록이 비어 있으면 채운다(관리자 화면·통계가 이 값을 쓴다).
    if (m.status === "confirmed" && e.status !== "confirmed") {
      if (!e.confirmed_at) patch.confirmed_at = now;
      if (m.deposit_paid && !e.paid_at) patch.paid_at = now;
    }
    if (Object.keys(patch).length === 0) continue;
    try {
      await sb(`reservations?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      changed++;
    } catch (err) { errors.push(`수정 실패 ${m.name} ${m.date} ${m.time}: ${(err as Error).message.slice(0, 100)}`); }
  }

  // ── ③ 새로 생긴 예약 → 추가 ────────────────────────────────────────────
  let added = 0;
  for (const [apptId, m] of wanted) {
    if (byId.has(apptId)) continue;
    try { await sb("reservations", { method: "POST", body: JSON.stringify(m) }); added++; }
    catch (err) { errors.push(`추가 실패 ${m.name} ${m.date} ${m.time}: ${(err as Error).message.slice(0, 100)}`); }
  }

  return { added, changed, cancelled, errors };
}

/** Supabase REST 호출기 (서비스 키 — 서버에서만 쓴다) */
export function makeSupabaseRest(url: string, serviceKey: string) {
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

/**
 * 읽기 → 맞추기 한 번에. 크론이 부르는 입구.
 *
 * ⚠️ 클라우드플레어 워커에서 돌리려면 두 가지가 필요하다(2026-08-07 실측으로 확인):
 *   · `disableEval: true` — mysql2 가 행 파서를 코드 생성으로 만드는데 워커는 그걸 금지한다.
 *   · host 는 **호스트명**(db.fantastrick.co.kr). 워커는 원시 IP 로의 연결을 막는다(error 1104).
 */
export async function syncFromWordpress(cfg: {
  db: WpDbConfig;
  supabaseUrl: string;
  supabaseServiceKey: string;
}): Promise<SyncResult> {
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, database: cfg.db.database,
    charset: "utf8mb4", multipleStatements: false,
    disableEval: true,
  });
  try {
    const [rows] = await conn.query(WP_QUERY(cfg.db.prefix || "wp_"));
    const { mapped, skipped } = mapRows(rows as WpRow[]);
    const sb = makeSupabaseRest(cfg.supabaseUrl, cfg.supabaseServiceKey);
    const res = await mirror(mapped, sb);
    return { read: mapped.length, skipped, ...res };
  } finally {
    try { await conn.end(); } catch {}
  }
}
