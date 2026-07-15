import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone, sanitizeText } from "@/lib/util";
import { sendReservationSms } from "@/lib/sms";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

// 환불율 계산 (한국시간 기준)
// - 당일 예약(방문일이 오늘): 전액 환불 불가 → 0%
// - 테마 시작까지 24시간 이상 남음: 100%
// - 24시간 미만 남음: 80%
function calcRefundRate(date: string, time: string): number {
  // 테마 시작(KST)까지 24시간 이상 남으면 100%, 24시간 미만이면 80%
  const startKST = new Date(`${date}T${time}:00+09:00`);
  const hours = (startKST.getTime() - Date.now()) / 3600000;
  return hours >= 24 ? 100 : 80;
}

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

  // 본인 예약인지 확인(전화번호 + 이름) + 날짜/시간 가져오기
  const { data: found, error: findErr } = await db
    .from("reservations")
    .select("id, status, date, time, theme_id, theme_name, people")
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

  const refundRate = calcRefundRate(found.date, found.time);

  const { error } = await db
    .from("reservations")
    .update({
      status: "cancelled",
      refund_bank: refundBank,
      refund_account: refundAccount,
      refund_holder: refundHolder,
      refund_rate: refundRate,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("phone", phone);

  if (error) return NextResponse.json({ error: "취소 중 오류가 발생했습니다." }, { status: 500 });

  // 취소 안내 문자 (알리고 키 있을 때만 실제 발송)
  await sendReservationSms("cancel", {
    name, phone, theme_id: found.theme_id, theme_name: found.theme_name, date: found.date, time: found.time,
    people: found.people, refund_rate: refundRate,
  }).catch(() => {});

  return NextResponse.json({ ok: true, refundRate });
}
