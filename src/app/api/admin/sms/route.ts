import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_TEMPLATES, kakaoConfigured } from "@/lib/sms";
import { THEME_TEMPLATES } from "@/lib/sms-templates";
import { THEMES } from "@/lib/data";

// 문자 종류. perTheme=true 면 테마마다 문구가 다를 수 있어 테마별로 편집한다.
//   (기존 사이트: 예약대기=테마마다 예약금이 다름 / 입금확정=사자의 서만 인스타·길안내 추가)
const SMS_TYPES = [
  { type: "reservation", label: "예약대기 안내 (접수 직후 · 계좌 안내)", perTheme: true },
  { type: "payment", label: "입금확정 안내 (입금확인 시)", perTheme: true },
  { type: "cancel", label: "취소 문자 (손님이 직접 취소)", perTheme: false },
  { type: "admin_cancel", label: "관리자 취소 안내", perTheme: false },
  { type: "confirm", label: "예약확정 문자 (입금 없이 확정 시)", perTheme: false },
  { type: "reminder", label: "방문 리마인더", perTheme: false },
] as const;
const TYPE_KEYS = SMS_TYPES.map((t) => t.type) as readonly string[];
const THEME_IDS = new Set(THEMES.map((t) => t.id));

// 저장된 문구가 없을 때 보여줄 기본 문구 (기존 사이트에서 옮겨온 것)
function fallbackBody(type: string, themeId: string): string {
  if (themeId) return THEME_TEMPLATES[`${type}:${themeId}`] || DEFAULT_TEMPLATES[type] || "";
  return DEFAULT_TEMPLATES[type] || "";
}

// 템플릿(종류별·테마별) + 최근 발송내역 + 알리고 연동여부
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const { data: tpls, error } = await db.from("sms_templates").select("type, theme_id, body");
  if (error) {
    // theme_id 칸이 아직 없으면(마이그레이션 전) 알기 쉽게 알려준다
    return NextResponse.json({ error: "문자 문구 표에 theme_id 칸이 없습니다. supabase/migration_sms_theme_APPLY_ME.sql 을 먼저 적용해 주세요." }, { status: 503 });
  }
  const saved = new Map((tpls || []).map((t) => [`${t.type}:${t.theme_id || ""}`, t.body as string]));

  // 화면에 뿌릴 구조
  //   perTheme 종류 : 테마별 문구만 (공통 없음 — 공통이 테마별을 덮어써서 예약금이 잘못 안내되는 걸 막음)
  //   그 외         : 공통 문구 하나만
  const templates = SMS_TYPES.map((t) => ({
    type: t.type,
    label: t.label,
    perTheme: t.perTheme,
    common: t.perTheme ? null : { body: saved.get(`${t.type}:`) ?? fallbackBody(t.type, ""), saved: saved.has(`${t.type}:`) },
    themes: t.perTheme
      ? THEMES.map((th) => ({
          id: th.id,
          name: th.name,
          body: saved.get(`${t.type}:${th.id}`) ?? fallbackBody(t.type, th.id),
          saved: saved.has(`${t.type}:${th.id}`),
        }))
      : [],
  }));

  const { data: log } = await db
    .from("sms_log")
    .select("id, phone, body, type, status, error, channel, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const aligoReady = !!(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER);
  const kakaoReady = kakaoConfigured();
  const kakaoTemplates = { confirm: kakaoConfigured("confirm"), cancel: kakaoConfigured("cancel"), reminder: kakaoConfigured("reminder") };
  return NextResponse.json({ ok: true, templates, log: log || [], aligoReady, kakaoReady, kakaoTemplates });
}

// 템플릿 수정 — themeId 를 주면 그 테마 전용, 없으면 모든 테마 공통
export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const type = String(body.type || "");
  const themeId = String(body.themeId || "");
  const text = String(body.body || "");
  if (!TYPE_KEYS.includes(type)) return NextResponse.json({ error: "타입 오류" }, { status: 400 });
  if (themeId && !THEME_IDS.has(themeId)) return NextResponse.json({ error: "테마 오류" }, { status: 400 });
  if (!text.trim()) return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  // 테마별 종류는 반드시 테마를 지정해야 한다 (공통으로 저장하면 테마별 문구를 덮어써 사고가 남)
  const perTheme = SMS_TYPES.find((t) => t.type === type)?.perTheme;
  if (perTheme && !themeId) return NextResponse.json({ error: "이 문자는 테마를 골라서 저장해 주세요." }, { status: 400 });
  if (!perTheme && themeId) return NextResponse.json({ error: "이 문자는 테마별로 나눠 쓰지 않습니다." }, { status: 400 });

  const { error } = await db
    .from("sms_templates")
    .upsert({ type, theme_id: themeId, body: text, updated_at: new Date().toISOString() }, { onConflict: "type,theme_id" });
  if (error) return NextResponse.json({ error: "저장 중 오류: " + error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 저장한 문구를 지워 "기존 문구"로 되돌리기
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  const sp = req.nextUrl.searchParams;
  const type = String(sp.get("type") || "");
  const themeId = String(sp.get("themeId") || "");
  if (!TYPE_KEYS.includes(type)) return NextResponse.json({ error: "타입 오류" }, { status: 400 });
  const { error } = await db.from("sms_templates").delete().eq("type", type).eq("theme_id", themeId);
  if (error) return NextResponse.json({ error: "되돌리기 실패" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
