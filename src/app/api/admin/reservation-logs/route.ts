import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// 예약 1건의 변경 이력 (언제 뭐가 바뀌었나). 1인 운영이라 "누가"는 안 남긴다.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "예약 id가 필요합니다." }, { status: 400 });

  const { data, error } = await db
    .from("reservation_logs")
    .select("id, action, detail, created_at")
    .eq("reservation_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "이력 조회 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true, logs: data || [] });
}
