import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone } from "@/lib/util";

// 예약 취소 (예약 id + 전화번호 일치해야 취소 가능)
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
  if (!id || !isValidPhone(phone)) {
    return NextResponse.json({ error: "예약 정보를 확인해 주세요." }, { status: 400 });
  }

  // 본인 예약인지 확인
  const { data: found, error: findErr } = await db
    .from("reservations")
    .select("id, status")
    .eq("id", id)
    .eq("phone", phone)
    .single();

  if (findErr || !found) {
    return NextResponse.json({ error: "해당 예약을 찾을 수 없습니다." }, { status: 404 });
  }
  if (found.status === "cancelled") {
    return NextResponse.json({ error: "이미 취소된 예약입니다." }, { status: 409 });
  }

  const { error } = await db
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("phone", phone);

  if (error) return NextResponse.json({ error: "취소 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
