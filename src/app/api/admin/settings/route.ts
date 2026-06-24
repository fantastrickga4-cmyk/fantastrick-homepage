import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { getConfig } from "@/lib/settings";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json(await getConfig());
}

export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const rows: { key: string; value: unknown; updated_at: string }[] = [];
  const now = new Date().toISOString();
  if (body.depositPerPerson != null) {
    const n = Number(body.depositPerPerson);
    if (!(n >= 0)) return NextResponse.json({ error: "예약금 금액을 확인해 주세요." }, { status: 400 });
    rows.push({ key: "deposit_per_person", value: n, updated_at: now });
  }
  if (Array.isArray(body.timeSlots)) {
    rows.push({ key: "time_slots", value: body.timeSlots, updated_at: now });
  }
  if (Array.isArray(body.disabledThemes)) {
    rows.push({ key: "disabled_themes", value: body.disabledThemes, updated_at: now });
  }
  if (!rows.length) return NextResponse.json({ error: "변경할 설정이 없습니다." }, { status: 400 });

  const { error } = await db.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "설정 저장 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
