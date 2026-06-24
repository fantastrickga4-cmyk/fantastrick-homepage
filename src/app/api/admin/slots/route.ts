import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// 차단 슬롯 목록 (오늘 이후)
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("blocked_slots")
    .select("id, store_id, theme_id, date, time, reason, created_at")
    .gte("date", today)
    .order("date", { ascending: true });
  if (error) return NextResponse.json({ error: "조회 오류" }, { status: 500 });
  return NextResponse.json({ ok: true, blocks: data });
}

// 차단 추가 (time 없으면 그 날짜 전체 휴무 / theme 없으면 전 테마)
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const date = String(body.date || "");
  if (!date) return NextResponse.json({ error: "날짜를 선택해 주세요." }, { status: 400 });
  const { error } = await db.from("blocked_slots").insert({
    date,
    time: body.time ? String(body.time) : null,
    theme_id: body.themeId ? String(body.themeId) : null,
    store_id: body.storeId ? String(body.storeId) : null,
    reason: body.reason ? String(body.reason) : null,
  });
  if (error) return NextResponse.json({ error: "추가 중 오류" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 차단 해제 (열기)
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
  const { error } = await db.from("blocked_slots").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "삭제 중 오류" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
