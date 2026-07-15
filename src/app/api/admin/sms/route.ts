import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_TEMPLATES, kakaoConfigured } from "@/lib/sms";

// 템플릿 3종 + 최근 발송내역 + 알리고 연동여부
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const { data: tpls } = await db.from("sms_templates").select("type, body");
  const map = new Map((tpls || []).map((t: { type: string; body: string }) => [t.type, t.body]));
  // ⚠️ payment·reservation 은 테마마다 문구가 달라(사자의 서는 인스타·길안내가 더 붙음)
  //    여기서 한 덩어리로 저장하면 테마별 문구가 날아감 → 테마별 편집 붙이기 전까지 노출하지 않음.
  const templates = {
    confirm: map.get("confirm") ?? DEFAULT_TEMPLATES.confirm,
    cancel: map.get("cancel") ?? DEFAULT_TEMPLATES.cancel,
    admin_cancel: map.get("admin_cancel") ?? DEFAULT_TEMPLATES.admin_cancel,
    reminder: map.get("reminder") ?? DEFAULT_TEMPLATES.reminder,
  };
  const { data: log } = await db
    .from("sms_log")
    .select("id, phone, body, type, status, error, channel, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const aligoReady = !!(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER);
  // 알림톡 준비: 발신프로필키 + 타입별 템플릿코드 (하나라도 있으면 부분 준비)
  const kakaoReady = kakaoConfigured();
  const kakaoTemplates = {
    confirm: kakaoConfigured("confirm"),
    cancel: kakaoConfigured("cancel"),
    reminder: kakaoConfigured("reminder"),
  };
  return NextResponse.json({ ok: true, templates, log: log || [], aligoReady, kakaoReady, kakaoTemplates });
}

// 템플릿 수정
export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }
  const type = String(body.type || "");
  const text = String(body.body || "");
  // payment·reservation 은 테마별 문구라 여기서 통째로 덮어쓰지 않게 막아둠
  if (!["confirm", "cancel", "admin_cancel", "reminder"].includes(type)) return NextResponse.json({ error: "타입 오류" }, { status: 400 });
  if (!text.trim()) return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  const { error } = await db.from("sms_templates").upsert({ type, body: text, updated_at: new Date().toISOString() }, { onConflict: "type" });
  if (error) return NextResponse.json({ error: "저장 중 오류" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
