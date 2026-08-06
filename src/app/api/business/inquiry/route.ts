import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone, sanitizeText } from "@/lib/util";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

/* 비즈니스(B2B) 도입 문의 접수 — /business 페이지의 폼이 여기로 보낸다.
   손님 예약과 달리 "아직 손님이 아닌 사람"이 남기는 것이라 예약 표와 섞지 않고
   biz_inquiries 에 따로 쌓는다(관리자 › 문의 탭에서 본다). */
export async function POST(req: NextRequest) {
  // 같은 사람이 실수로 두 번 누르는 건 막고, 장난 폭주는 걸러낸다. IP당 3회/분.
  if (!rateLimit(`biz-inquiry:${getClientIp(req)}`, 3, 60_000)) {
    return NextResponse.json({ error: "요청이 너무 잦습니다. 잠시 후 다시 보내주세요." }, { status: 429 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const storeName = sanitizeText(String(body.storeName || "")).slice(0, 60);
  const phone = normalizePhone(String(body.phone || ""));
  const area = sanitizeText(String(body.area || "")).slice(0, 40) || null;
  // 방 개수는 "3개", "세 칸" 처럼 들어올 수 있다. 숫자만 뽑고, 없으면 비워둔다(막지 않는다).
  const roomsRaw = String(body.rooms || "").replace(/[^0-9]/g, "");
  const rooms = roomsRaw ? Math.min(99, Number(roomsRaw)) : null;

  if (!storeName) return NextResponse.json({ error: "매장명을 입력해 주세요." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "연락처 형식을 확인해 주세요." }, { status: 400 });

  // 같은 번호가 방금 남긴 문의가 있으면 새로 만들지 않는다(더블클릭·새로고침 대비).
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: dup } = await db
    .from("biz_inquiries")
    .select("id")
    .eq("phone", phone)
    .gte("created_at", since)
    .maybeSingle();
  if (dup) return NextResponse.json({ ok: true, duplicated: true });

  const { error } = await db.from("biz_inquiries").insert({
    store_name: storeName, phone, rooms, area, status: "new",
  });
  if (error) {
    // 표가 아직 없으면(SQL 미적용) 손님에게는 "메일 주세요"로 안내한다.
    // 손님 입장에선 우리 사정이 뭐든 "연락할 방법"이 보여야 한다.
    if (error.code === "PGRST205" || error.code === "42P01") {
      console.error("[B2B 문의] biz_inquiries 표가 없음 — migration_biz_inquiries_APPLY_ME.sql 적용 필요");
      return NextResponse.json(
        { error: "지금은 문의 접수가 잠시 안 됩니다. fantastrick@fantastrick.co.kr 로 보내주시면 바로 답 드립니다." },
        { status: 503 }
      );
    }
    console.error("[B2B 문의 저장 실패]", error.message);
    return NextResponse.json({ error: "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
