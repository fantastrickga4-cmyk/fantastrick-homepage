import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone } from "@/lib/util";

// 환불율 계산 (한국시간 기준)
// - 당일 예약(방문일이 오늘): 전액 환불 불가 → 0%
// - 테마 시작까지 24시간 이상 남음: 100%
// - 24시간 미만 남음: 80%
function calcRefundRate(date: string, time: string): number {
  const startKST = new Date(`${date}T${time}:00+09:00`);
  const now = new Date();
  // 오늘(KST) 날짜 문자열
  const todayKST = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (date === todayKST) return 0; // 당일 예약/방문
  const hours = (startKST.getTime() - now.getTime()) / 3600000;
  if (hours >= 24) return 100;
  return 80;
}

// 예약 취소 (예약 id + 전화번호 일치해야 취소 가능) + 환불 계좌 저장
export async function POST(req: NextRequest) {
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
  const refundBank = String(body.refundBank || "").trim();
  const refundAccount = String(body.refundAccount || "").trim();
  const refundHolder = String(body.refundHolder || "").trim();

  if (!id || !isValidPhone(phone)) {
    return NextResponse.json({ error: "예약 정보를 확인해 주세요." }, { status: 400 });
  }
  if (!refundBank || !refundAccount || !refundHolder) {
    return NextResponse.json({ error: "환불받으실 은행·계좌번호·예금주를 모두 입력해 주세요." }, { status: 400 });
  }

  // 본인 예약인지 확인 + 날짜/시간 가져오기
  const { data: found, error: findErr } = await db
    .from("reservations")
    .select("id, status, date, time")
    .eq("id", id)
    .eq("phone", phone)
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
  return NextResponse.json({ ok: true, refundRate });
}
