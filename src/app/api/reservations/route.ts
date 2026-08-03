import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone, reservationDateState, sanitizeText } from "@/lib/util";
import { themeById, slotsForThemeDate, isTooSoon } from "@/lib/data";
import { getConfig, depositOf } from "@/lib/settings";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { isLookupLocked, noteLookupFail, clearLookupFails, LOCKED_MESSAGE } from "@/lib/pin-guard";
import { sweepExpiredReservations, maybePurgeOldReservations, isHiddenFromLookup } from "@/lib/expire";
import { sendReservationSms } from "@/lib/sms";

const TOO_MANY = { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };

// 예약 생성
export async function POST(req: NextRequest) {
  // 레이트 리밋: IP당 8회/분 (DB 접근 전에 차단)
  if (!rateLimit(`res-post:${getClientIp(req)}`, 8, 60_000)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const themeId = String(body.themeId || "");
  const date = String(body.date || "");
  const time = String(body.time || "");
  const people = Number(body.people || 0);
  const name = sanitizeText(String(body.name || ""));
  const phone = normalizePhone(String(body.phone || ""));
  const pin = String(body.pin || "").trim();

  const theme = themeById(themeId);
  if (!theme || theme.soon) return NextResponse.json({ error: "예약할 수 없는 테마입니다." }, { status: 400 });
  if (!date || !time) return NextResponse.json({ error: "날짜와 시간을 선택해 주세요." }, { status: 400 });

  // 예약 오픈 규칙(서버 검증): 이용일 1주일 전 저녁 9시(KST) 이후에만 예약 가능
  const dateState = reservationDateState(date);
  if (dateState === "invalid") return NextResponse.json({ error: "날짜 형식을 확인해 주세요." }, { status: 400 });
  if (dateState === "past") return NextResponse.json({ error: "지난 날짜는 예약할 수 없습니다." }, { status: 400 });
  if (dateState === "not_open") {
    return NextResponse.json({ error: "아직 예약이 오픈되지 않은 날짜입니다. 예약은 이용일 1주일 전 저녁 9시에 열립니다." }, { status: 409 });
  }

  if (!(people >= 1 && people <= 8)) return NextResponse.json({ error: "인원을 확인해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "예약자 이름을 입력해 주세요." }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "이름이 너무 깁니다." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해 주세요." }, { status: 400 });

  const config = await getConfig();

  // 요청한 시간이 (그 테마·그 요일의) 허용 시간대에 있는지 검사
  const allowedSlots = slotsForThemeDate(config.themeSlots, config.storeSlots, config.timeSlots, theme.id, theme.store, date);
  if (!allowedSlots.includes(time)) {
    return NextResponse.json({ error: "유효하지 않은 시간입니다." }, { status: 400 });
  }

  // 예약 임박 차단 — 시작 직전(기본 10분 전)이나 이미 지난 시간은 손님이 예약할 수 없음
  // (전화로 받는 예약은 관리자 화면에서 등록하므로 이 제한을 받지 않는다)
  if (isTooSoon(date, time, config.minLeadMinutes)) {
    const msg = config.minLeadMinutes > 0
      ? `시작 ${config.minLeadMinutes}분 전부터는 예약할 수 없습니다. 매장으로 전화 주세요.`
      : "이미 지난 시간입니다.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 예약 스팸 상한: 같은 전화번호로 대기(pending) 예약이 6건 이상이면 차단
  const { count: pendingCount } = await db
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .eq("status", "pending");
  if ((pendingCount || 0) >= 6) {
    return NextResponse.json(
      { error: "대기 중인 예약이 너무 많습니다. 기존 예약 확인 후 이용해 주세요." },
      { status: 429 }
    );
  }

  // 관리자가 닫은(차단) 시간인지 확인
  const { data: blocks } = await db
    .from("blocked_slots")
    .select("theme_id, time")
    .eq("date", date);
  const relevant = (blocks || []).filter((b: { theme_id: string | null }) => !b.theme_id || b.theme_id === theme.id);
  if (relevant.some((b: { time: string | null }) => !b.time)) {
    return NextResponse.json({ error: "해당 날짜는 예약을 받지 않습니다." }, { status: 409 });
  }
  if (relevant.some((b: { time: string | null }) => b.time === time)) {
    return NextResponse.json({ error: "마감된 시간입니다. 다른 시간을 선택해 주세요." }, { status: 409 });
  }

  // 예약금은 관리자가 바꿨으면 그 값 (문자 계좌 안내에도 이 금액이 나감)
  const deposit = depositOf(config, theme.id, theme.deposit);

  const { data, error } = await db
    .from("reservations")
    .insert({
      store_id: theme.store,
      theme_id: theme.id,
      theme_name: theme.name,
      date,
      time,
      people,
      name,
      phone,
      pin,
      deposit,
      status: "pending",
    })
    .select("id, cancel_token")
    .single();

  if (error) {
    // 중복 슬롯(unique 위반)
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 예약된 시간입니다. 다른 시간을 선택해 주세요." }, { status: 409 });
    }
    return NextResponse.json({ error: "예약 저장 중 오류가 발생했습니다." }, { status: 500 });
  }

  // 변경 이력의 시작점
  await db.from("reservation_logs").insert({ reservation_id: data.id, action: "접수", detail: "손님이 홈페이지에서 예약" })
    .then(({ error: e }) => { if (e) console.error("[변경이력 기록 실패]", e.message); });

  /* 🔴 예약대기 안내 문자 — 입금 계좌를 손님 손에 남긴다 (2026-08-03 추가).
     전에는 이 문자가 **아예 나가지 않았다.** 문구(reservation)는 4테마 모두 준비돼 있었는데
     부르는 곳이 없었다. 그런데 예약 완료 화면은 "곧 안내 연락이 도착할 예정"이라고 약속한다.

     왜 급했나: 30분 안에 입금이 없으면 예약이 자동 취소된다(expire.ts). 그런데 계좌번호는
     예약 직후 팝업에만 있어서, 손님이 그 팝업을 닫으면 **계좌를 다시 볼 방법이 없었다.**
     → 입금을 못 하고 30분 뒤 예약이 사라진다. 매출이 그대로 새는 자리였다.

     ⚠️ 문자가 실패해도 예약은 이미 성사됐다. 여기서 에러를 던지면 손님 화면에 "예약 실패"가
        떠서 같은 시간에 두 번 예약을 시도하게 된다 — 그래서 삼키고 로그만 남긴다. */
  await sendReservationSms("reservation", {
    name, phone, theme_id: theme.id, theme_name: theme.name,
    date, time, people, deposit,
  }).catch((e) => console.error("[예약대기 안내문자 실패]", String(e)));

  return NextResponse.json({ ok: true, id: data.id, deposit });
}

// 전화번호 + 예약자 이름으로 예약 조회 (이름을 본인확인 수단으로 사용)
export async function GET(req: NextRequest) {
  // 레이트 리밋: IP당 20회/분 (전화번호 열거·수집 방어)
  if (!rateLimit(`res-get:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  // 만료 예약(30분 미입금) 자동 정리 — 실패해도 조회는 진행
  await sweepExpiredReservations(db).catch(() => {});
  // 한 달 지난 예약 자동 삭제 (1시간에 한 번, 실패해도 조회는 진행)
  await maybePurgeOldReservations(db).catch(() => {});

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") || "");
  const name = sanitizeText(req.nextUrl.searchParams.get("name") || "");
  const pin = String(req.nextUrl.searchParams.get("pin") || "").trim();
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "예약자 이름을 입력해 주세요." }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해 주세요." }, { status: 400 });

  // 🔒 4자리 비밀번호 무차별 대입 방어 — 전화번호 기준으로 실패를 센다(자세한 건 lib/pin-guard.ts).
  //   ⚠️ 잠겨 있으면 예약을 찾아보지도 않는다. 여기서 조회를 돌리면 "잠겼다"고 해놓고
  //      맞는 비밀번호는 통과시키는 셈이 되어 방어가 무의미해진다.
  if (await isLookupLocked(db, phone).catch(() => false)) {
    return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 429 });
  }

  const { data, error } = await db
    .from("reservations")
    .select("id, store_id, theme_id, theme_name, date, time, people, name, deposit, deposit_paid, status, created_at, cancelled_at")
    .eq("phone", phone)
    .eq("name", name)
    .eq("pin", pin)
    .order("date", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });

  // 맞았으면 카운터를 지우고, 틀렸으면 1회 기록한다.
  //   "이름은 맞는데 비밀번호만 틀린 경우"를 따로 가려내지 않는다 — 가려내는 순간
  //   그 응답이 "이 번호로 예약이 있다"는 정보를 흘린다.
  if ((data || []).length > 0) await clearLookupFails(db, phone).catch(() => {});
  else await noteLookupFail(db, phone).catch(() => {});

  // 끝난 지 일주일 넘은 예약(취소·이용완료)은 손님 조회 화면에서 숨긴다(DB엔 남음, 관리자는 봄).
  const visible = (data || []).filter((r) => !isHiddenFromLookup(r));

  // 각 예약이 손님이 이미 시간변경을 썼는지 표시 (변경은 1건당 1회만 — 화면에서 버튼을 미리 감춤).
  //   이력에 '손님 시간변경' 기록이 있으면 changed=true.
  const ids = visible.map((r) => r.id);
  const changedSet = new Set<string>();
  if (ids.length) {
    const { data: logs } = await db
      .from("reservation_logs")
      .select("reservation_id")
      .in("reservation_id", ids)
      .eq("action", "손님 시간변경");
    (logs || []).forEach((l: { reservation_id: string }) => changedSet.add(l.reservation_id));
  }
  const reservations = visible.map((r) => ({ ...r, changed: changedSet.has(r.id) }));
  return NextResponse.json({ ok: true, reservations });
}
