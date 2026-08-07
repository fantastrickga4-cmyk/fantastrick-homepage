import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isTestPhone } from "@/lib/sms";

/**
 * 직원용 "오늘 예약" 읽기 전용 API — 안내문자 앱(reservation-sms)이 부른다.
 *
 * [왜 관리자 API 를 그냥 쓰지 않나]
 *  관리자 로그인은 ADMIN_PASSWORD 하나뿐이고, 그게 뚫리면 환불·설정·매출까지 전부 열린다.
 *  아침마다 문자를 돌리는 건 직원 일이라, 그 일 하나 때문에 사장님 비밀번호를 폰에 저장해
 *  두게 할 수는 없다. → **읽기 전용 + 오늘치 + 돈 정보 제외** 인 문을 따로 낸다.
 *
 * [무엇을 안 주나]
 *  예약금·환불계좌·메모·관리자메모는 **일부러 뺐다.** 문자 보내는 데 필요 없고,
 *  직원 폰이 분실되면 그대로 새는 정보다. 필요해지면 그때 명시적으로 추가할 것.
 *
 * [누구를 안 주나]
 *  **미입금(deposit_paid=false)은 뺀다** (2026-08-06). 예약금이 안 들어온 건 아직 확정이
 *  아니라, 안내문자를 받으면 손님은 확정된 줄 안다. 30분 미입금 자동취소(lib/expire.ts)가
 *  대부분 걸러주지만, 관리자가 손으로 넣은 예약이나 옛 사이트에서 가져온 건은 미입금인 채로
 *  당일까지 남는다. 대신 **몇 건 뺐는지는 알려준다**(excludedUnpaid) — 소리 없이 사라지면
 *  직원은 손님이 누락된 줄 모른다.
 *
 *  **연습용(010-0000-XXXX)도 뺀다** (2026-08-07). 옛 사이트에서 옮겨온 예약
 *  (scripts/import-from-wp.mts)과 테스트 시드(scripts/seed-test-reservations.mjs)는
 *  진짜 번호 대신 이 대역을 쓴다. 홈페이지가 직접 보내는 문자는 lib/sms.ts 의 isTestPhone
 *  가드가 막지만, **이 문으로 나간 번호는 직원 폰의 문자앱이 보내므로 그 가드를 못 거친다.**
 *  실제로 안내문자 앱에 010-0000-8522 같은 수신자가 그대로 올라왔다 — 발송 길목이 아니라
 *  여기서 막아야 하는 이유다. 여기 뺀 건수도 알려준다(excludedTest).
 *
 * [토큰이 새면]
 *  STAFF_TOKEN 값만 바꾸면 즉시 막힌다(관리자 비밀번호는 안 건드려도 된다). 그게 문을
 *  따로 낸 이유이기도 하다.
 */

// 안내문자 앱이 사는 곳. 다른 출처라 브라우저가 CORS 를 요구한다.
const ALLOWED_ORIGINS = new Set([
  "https://reservation-sms.pages.dev",
  "http://localhost:3000",
  "http://localhost:3001",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  // 목록에 없는 출처엔 CORS 를 열어주지 않는다(토큰이 있어도 브라우저가 응답을 막는다).
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// 타이밍 공격 방어: 길이 확인 후 상수시간 비교 (login/route.ts 와 같은 방식)
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** 오늘 날짜(KST) — 워커는 UTC 라 그냥 자르면 새벽 0~9시에 어제가 나온다. */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  const expected = process.env.STAFF_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "직원용 열쇠(STAFF_TOKEN)가 설정되지 않았습니다. 관리자에게 문의해 주세요." },
      { status: 503, headers: cors },
    );
  }

  // Authorization: Bearer <토큰>. 주소창(쿼리스트링)으로는 받지 않는다 — 로그·기록에 남는다.
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "열쇠가 올바르지 않습니다." }, { status: 401, headers: cors });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503, headers: cors });

  // 기본은 오늘(KST). ?date= 로 다른 날도 볼 수 있게 둔다(내일치 미리 확인·테스트용).
  const q = req.nextUrl.searchParams.get("date");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q || "") ? (q as string) : todayKst();

  // ?theme=ldc 처럼 테마 하나만 받을 수 있다. 문자는 어차피 테마별로 나눠 보내므로,
  // 그 테마만 볼 거면 **나머지 손님 번호는 폰에 안 내리는 게 맞다.**
  // 테마 목록을 여기 박아두지 않는다 — 새 테마가 생겨도 이 파일을 고칠 일이 없게.
  const themeRaw = req.nextUrl.searchParams.get("theme") || "";
  const theme = /^[a-z0-9-]{1,40}$/.test(themeRaw) ? themeRaw : "";

  // deposit_paid 는 거르려고 읽을 뿐, 응답에는 넣지 않는다(위 "무엇을 안 주나" 참고).
  let query = db
    .from("reservations")
    .select("id, store_id, theme_id, theme_name, date, time, people, name, phone, status, deposit_paid")
    .eq("date", date)
    .neq("status", "cancelled");
  if (theme) query = query.eq("theme_id", theme);

  const { data, error } = await query.order("time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500, headers: cors });
  }

  // 미입금·연습용은 여기서 잘라낸다. DB 쿼리로 안 자르고 받아서 세는 건
  // **뺀 건수를 이유별로 알려주려고**다(직원이 해야 할 일이 서로 다르다).
  const rows = data || [];
  const paid = rows.filter((r) => r.deposit_paid);
  const excludedUnpaid = rows.length - paid.length;

  const real = paid.filter((r) => !isTestPhone(r.phone || ""));
  const excludedTest = paid.length - real.length;

  const reservations = real.map(({ deposit_paid: _unused, ...rest }) => rest);

  return NextResponse.json(
    { ok: true, date, theme: theme || null, excludedUnpaid, excludedTest, reservations },
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}
