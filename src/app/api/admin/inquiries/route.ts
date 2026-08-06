import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { sanitizeText } from "@/lib/util";

const COLS = "id, store_name, phone, rooms, area, status, admin_note, created_at, contacted_at";
const STATUSES = ["new", "contacted", "done", "dropped"];

/* 비즈니스(B2B) 도입 문의 — 관리자 › 문의 탭이 쓴다.
   ⚠️ 표(biz_inquiries)가 아직 없으면 42P01 이 온다. 그때는 500 대신 안내 문구를 준다.
      새 기능을 올렸는데 SQL 적용을 아직 안 한 순간에도 관리자 화면이 안 깨지게. */
const NO_TABLE = "문의 표가 아직 없습니다. supabase/migration_biz_inquiries_APPLY_ME.sql 을 Supabase SQL Editor 에서 한 번 실행해 주세요.";

/* 표가 없을 때 오는 코드가 두 가지다.
   · PGRST205 — PostgREST 가 스키마 캐시에서 못 찾음 (Supabase 에서 실제로 오는 값)
   · 42P01    — 포스트그레스 자체의 "그런 표 없음"
   둘 다 "SQL 을 아직 안 돌렸다"는 같은 뜻이라 같이 잡는다. */
function isMissingTable(code?: string) {
  return code === "PGRST205" || code === "42P01";
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const status = req.nextUrl.searchParams.get("status") || "all";
  let q = db.from("biz_inquiries").select(COLS).order("created_at", { ascending: false }).limit(300);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error.code)) return NextResponse.json({ error: NO_TABLE, needsMigration: true }, { status: 503 });
    return NextResponse.json({ error: "문의 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
  const rows = data || [];
  // 뱃지용 — 아직 손 안 댄 문의 수(목록을 status 로 걸러도 전체 기준으로 세야 맞다)
  const { count } = await db
    .from("biz_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return NextResponse.json({ ok: true, inquiries: rows, newCount: count || 0 });
}

// 상태 바꾸기 / 메모 달기
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "문의 id 가 필요합니다." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
    patch.status = body.status;
    // "연락함"으로 올릴 때만 시각을 남긴다. 되돌리면(new) 지운다 — 남아 있으면 언제 연락했는지가 거짓이 된다.
    if (body.status === "contacted") patch.contacted_at = new Date().toISOString();
    if (body.status === "new") patch.contacted_at = null;
  }
  if (typeof body.admin_note === "string") patch.admin_note = sanitizeText(body.admin_note).slice(0, 200) || null;

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });

  const { error } = await db.from("biz_inquiries").update(patch).eq("id", id);
  if (error) {
    if (isMissingTable(error.code)) return NextResponse.json({ error: NO_TABLE, needsMigration: true }, { status: 503 });
    return NextResponse.json({ error: "수정 중 오류가 발생했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// 지우기 — 장난 문의를 남겨둘 이유가 없다
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "문의 id 가 필요합니다." }, { status: 400 });

  const { error } = await db.from("biz_inquiries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
