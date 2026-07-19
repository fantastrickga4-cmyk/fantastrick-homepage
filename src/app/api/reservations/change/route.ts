import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone, reservationDateState, sanitizeText } from "@/lib/util";
import { slotsForThemeDate, isTooSoon } from "@/lib/data";
import { getConfig } from "@/lib/settings";
import { refundRateFor, hasStarted } from "@/lib/money";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

// 손님이 예약 조회 후 **시간·날짜를 변경**하는 기능.
//   방식: 취소→재예약이 아니라 "예약을 그대로 옮기기"(관리자 '예약 옮기기'와 같은 방식).
//        → 예약금·입금상태 그대로 유지, 손님이 돈을 다시 낼 필요 없음.
//   규칙(사장님 확정, 2026-07-20):
//     · 같은 테마 안에서 날짜·시간만 변경 (다른 테마로는 못 바꿈 — 취소 후 재예약)
//     · 시작 24시간 넘게 남았을 때만 변경 가능 (= 취소 시 100% 환불 조건과 동일).
//       24시간 이내·당일·임박 예약은 매장 전화로. 이 규칙이 "80% 위약금 회피" 구멍도 막는다.
//     · 변경은 예약 1건당 딱 1번만 (남용 방지). 2번째부터는 매장 문의.
//   새 시간은 **새로 예약할 때와 똑같은 조건**을 통과해야 한다(오픈 규칙·요일 시간표·임박·마감·중복).
export async function POST(req: NextRequest) {
  // 레이트 리밋: IP당 10회/분
  if (!rateLimit(`res-change:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const id = String(body.id || "");
  const phone = normalizePhone(String(body.phone || ""));
  const name = sanitizeText(String(body.name || ""));
  const pin = String(body.pin || "").trim();
  const date = String(body.date || "");
  const time = String(body.time || "");

  if (!id || !isValidPhone(phone) || !name) {
    return NextResponse.json({ error: "예약 정보를 확인해 주세요." }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해 주세요." }, { status: 400 });
  }
  if (!date || !time) {
    return NextResponse.json({ error: "옮길 날짜와 시간을 선택해 주세요." }, { status: 400 });
  }

  // 본인 예약 확인 (id + 전화 + 이름 + 비번 모두 일치) + 현재 예약 정보 가져오기
  const { data: before, error: findErr } = await db
    .from("reservations")
    .select("id, store_id, theme_id, date, time, status")
    .eq("id", id)
    .eq("phone", phone)
    .eq("name", name)
    .eq("pin", pin)
    .single();

  if (findErr || !before) {
    return NextResponse.json({ error: "해당 예약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (before.status === "cancelled") {
    return NextResponse.json({ error: "이미 취소된 예약이에요." }, { status: 409 });
  }
  if (hasStarted(before.date, before.time)) {
    return NextResponse.json({ error: "이미 이용하신 예약은 변경할 수 없어요. 매장으로 문의해 주세요." }, { status: 409 });
  }

  // A안 규칙: 시작 24시간 넘게 남았을 때만 변경 가능 (refundRateFor === 100 이 곧 "24시간 초과")
  if (refundRateFor(before.date, before.time) !== 100) {
    return NextResponse.json({ error: "예약 변경은 시작 24시간 전까지만 가능해요. 임박한 예약은 매장으로 문의해 주세요." }, { status: 409 });
  }

  // 변경 1회 제한 — 이력에 '손님 시간변경' 기록이 이미 있으면 막는다.
  //   (관리자가 옮긴 건 action 이 달라서 이 카운트에 안 잡힘 — 손님 셀프 변경만 1회로 센다)
  const { count: changeCount } = await db
    .from("reservation_logs")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", id)
    .eq("action", "손님 시간변경");
  if ((changeCount || 0) >= 1) {
    return NextResponse.json({ error: "예약 변경은 한 번만 가능해요. 추가 변경은 매장으로 문의해 주세요." }, { status: 409 });
  }

  // 지금과 같은 시간으로는 변경 의미 없음
  if (date === before.date && time === before.time) {
    return NextResponse.json({ error: "지금 예약과 같은 시간이에요. 다른 시간을 선택해 주세요." }, { status: 400 });
  }

  // ── 새 슬롯 검증 (새 예약 POST 와 동일한 규칙) ──────────────────────
  const dateState = reservationDateState(date);
  if (dateState === "invalid") return NextResponse.json({ error: "날짜 형식을 확인해 주세요." }, { status: 400 });
  if (dateState === "past") return NextResponse.json({ error: "지난 날짜로는 옮길 수 없어요." }, { status: 400 });
  if (dateState === "not_open") {
    return NextResponse.json({ error: "아직 예약이 오픈되지 않은 날짜예요. 예약은 이용일 1주일 전 저녁 9시에 열립니다." }, { status: 409 });
  }

  const config = await getConfig();

  // 그 테마·그 요일에 실제 있는 시간대인지
  const allowedSlots = slotsForThemeDate(config.themeSlots, config.storeSlots, config.timeSlots, before.theme_id, before.store_id, date);
  if (!allowedSlots.includes(time)) {
    return NextResponse.json({ error: "선택하신 요일에는 그 시간이 없어요. 다른 시간을 선택해 주세요." }, { status: 400 });
  }

  // 임박(시작 직전)·지난 시간으로는 옮길 수 없음
  if (isTooSoon(date, time, config.minLeadMinutes)) {
    const msg = config.minLeadMinutes > 0
      ? `시작 ${config.minLeadMinutes}분 전부터는 예약할 수 없어요. 매장으로 전화 주세요.`
      : "이미 지난 시간이에요.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 사장님이 닫은(휴무·마감) 시간인지
  const { data: blocks } = await db.from("blocked_slots").select("theme_id, time").eq("date", date);
  const relevant = (blocks || []).filter((b: { theme_id: string | null }) => !b.theme_id || b.theme_id === before.theme_id);
  if (relevant.some((b: { time: string | null }) => !b.time)) {
    return NextResponse.json({ error: "그 날짜는 예약을 받지 않아요. 다른 날짜를 선택해 주세요." }, { status: 409 });
  }
  if (relevant.some((b: { time: string | null }) => b.time === time)) {
    return NextResponse.json({ error: "마감된 시간이에요. 다른 시간을 선택해 주세요." }, { status: 409 });
  }

  // 옮길 칸에 이미 다른 예약이 있는지 (취소건은 칸을 차지하지 않음 — uq_res_slot 과 같은 기준)
  const { data: taken } = await db
    .from("reservations")
    .select("id")
    .eq("store_id", before.store_id).eq("theme_id", before.theme_id)
    .eq("date", date).eq("time", time).neq("status", "cancelled").neq("id", id)
    .maybeSingle();
  if (taken) {
    return NextResponse.json({ error: "방금 다른 분이 그 시간을 예약했어요. 다른 시간을 선택해 주세요." }, { status: 409 });
  }

  // ── 옮기기 (날짜·시간만 바꾸고 나머지는 그대로) ──────────────────────
  const { error: upErr } = await db
    .from("reservations")
    .update({ date, time })
    .eq("id", id)
    .eq("phone", phone);
  if (upErr) {
    // 동시성: 검사와 저장 사이에 누가 그 칸을 채웠으면 DB 가 막는다(uq_res_slot)
    if (upErr.code === "23505") {
      return NextResponse.json({ error: "방금 다른 분이 그 시간을 예약했어요. 다른 시간을 선택해 주세요." }, { status: 409 });
    }
    return NextResponse.json({ error: "변경 중 오류가 발생했어요." }, { status: 500 });
  }

  // 변경 이력 — 1회 제한 카운트의 근거이자 "내가 안 바꿨는데?" 대비 기록
  await db.from("reservation_logs").insert({
    reservation_id: id, action: "손님 시간변경",
    detail: `${before.date} ${before.time} → ${date} ${time}`,
  }).then(({ error: e }) => { if (e) console.error("[변경이력 기록 실패]", e.message); });

  return NextResponse.json({ ok: true, date, time });
}
