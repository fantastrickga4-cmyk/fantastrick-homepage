import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone, sanitizeText } from "@/lib/util";
import { sendReservationSms } from "@/lib/sms";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { refundRateFor, hasStarted } from "@/lib/money";

// 환불율은 lib/money.ts 의 refundRateFor 하나만 쓴다 (손님 화면과 같은 계산을 쓰기 위함)

// 예약 취소 (예약 id + 전화번호 일치해야 취소 가능) + 환불 계좌 저장
export async function POST(req: NextRequest) {
  // 레이트 리밋: IP당 10회/분
  if (!rateLimit(`res-cancel:${getClientIp(req)}`, 10, 60_000)) {
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
  const refundBank = sanitizeText(String(body.refundBank || ""));
  const refundAccount = sanitizeText(String(body.refundAccount || ""));
  const refundHolder = sanitizeText(String(body.refundHolder || ""));

  if (!id || !isValidPhone(phone) || !name) {
    return NextResponse.json({ error: "예약 정보를 확인해 주세요." }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해 주세요." }, { status: 400 });
  }

  // 본인 예약인지 확인(전화번호 + 이름) + 날짜/시간/입금여부 가져오기
  const { data: found, error: findErr } = await db
    .from("reservations")
    .select("id, status, date, time, theme_id, theme_name, people, deposit_paid")
    .eq("id", id)
    .eq("phone", phone)
    .eq("name", name)
    .eq("pin", pin)
    .single();

  if (findErr || !found) {
    return NextResponse.json({ error: "해당 예약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (found.status === "cancelled") {
    return NextResponse.json({ error: "이미 취소된 예약입니다." }, { status: 409 });
  }
  // 이미 이용이 끝난 예약은 취소 대상이 아니다. 화면에서도 버튼을 숨기지만, API 를 직접
  // 부르면 뚫리므로 여기서도 막는다. (환불은 어차피 0% 라 돈이 나가진 않지만, 쓸데없는
  // 취소 기록이 쌓이고 "이용했는데 취소됨" 같은 이상한 상태가 만들어진다)
  if (hasStarted(found.date, found.time)) {
    return NextResponse.json({ error: "이미 이용하신 예약은 취소할 수 없습니다. 매장으로 문의해 주세요." }, { status: 409 });
  }

  // 🔴 입금이 확정된 예약만 환불이 발생하고 환불 계좌가 필요하다.
  //    미입금(대기) 건은 돌려줄 돈이 없어 계좌 없이 그냥 취소한다 — 환불율도 남기지 않는다.
  //    (전엔 입금 안 했는데도 "100% 환불" 안내가 나가고 계좌 입력을 강요했다.)
  const paid = !!found.deposit_paid;
  if (paid) {
    if (!refundBank || !refundAccount || !refundHolder) {
      return NextResponse.json({ error: "환불받으실 은행·계좌번호·예금주를 모두 입력해 주세요." }, { status: 400 });
    }
    // 입력 하드닝: 길이 상한 + 계좌번호는 숫자·하이픈만
    if (name.length > 40 || refundBank.length > 60 || refundAccount.length > 60 || refundHolder.length > 60) {
      return NextResponse.json({ error: "입력값이 너무 깁니다." }, { status: 400 });
    }
    if (!/^[0-9-]+$/.test(refundAccount)) {
      return NextResponse.json({ error: "계좌번호는 숫자와 하이픈(-)만 입력해 주세요." }, { status: 400 });
    }
  }

  // 미입금이면 환불율은 null(환불 없음), 입금건이면 규정대로 계산.
  const refundRate = paid ? refundRateFor(found.date, found.time) : null;

  const { error } = await db
    .from("reservations")
    .update({
      status: "cancelled",
      refund_bank: paid ? refundBank : null,
      refund_account: paid ? refundAccount : null,
      refund_holder: paid ? refundHolder : null,
      refund_rate: refundRate,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("phone", phone);

  if (error) return NextResponse.json({ error: "취소 중 오류가 발생했습니다." }, { status: 500 });

  // 변경 이력 — 손님이 직접 취소한 것도 남긴다("제가 취소한 적 없는데요?" 대비)
  await db.from("reservation_logs").insert({
    reservation_id: id, action: "손님 취소", detail: paid ? `환불율 ${refundRate}%` : "미입금 취소(환불 없음)",
  }).then(({ error: e }) => { if (e) console.error("[변경이력 기록 실패]", e.message); });

  // 취소 안내 문자 (알리고 키 있을 때만 실제 발송) — 미입금은 환불 언급 없이(refund_rate=0)
  await sendReservationSms("cancel", {
    name, phone, theme_id: found.theme_id, theme_name: found.theme_name, date: found.date, time: found.time,
    people: found.people, refund_rate: refundRate ?? 0,
  }).catch(() => {});

  return NextResponse.json({ ok: true, refundRate });
}
