import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { getConfig } from "@/lib/settings";
import { STORES, isSlotTime, type StoreSlots } from "@/lib/data";

// storeSlots 입력을 안전한 형태로 정화 (알 수 없는 매장·잘못된 시간 제거)
function sanitizeStoreSlots(input: unknown): Record<string, StoreSlots> {
  const out: Record<string, StoreSlots> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const storeIds = new Set(STORES.map((s) => s.id));
  const cleanList = (v: unknown): string[] =>
    Array.isArray(v) ? Array.from(new Set(v.filter(isSlotTime))).sort() : [];
  for (const [storeId, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!storeIds.has(storeId as never) || !raw || typeof raw !== "object") continue;
    const r = raw as { default?: unknown; byDow?: unknown };
    const byDow: Record<string, string[]> = {};
    if (r.byDow && typeof r.byDow === "object" && !Array.isArray(r.byDow)) {
      for (const [dow, list] of Object.entries(r.byDow as Record<string, unknown>)) {
        if (/^[0-6]$/.test(dow)) byDow[dow] = cleanList(list);
      }
    }
    out[storeId] = { default: cleanList(r.default), byDow };
  }
  return out;
}

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
  if (body.storeSlots != null) {
    rows.push({ key: "store_slots", value: sanitizeStoreSlots(body.storeSlots), updated_at: now });
  }
  if (Array.isArray(body.disabledThemes)) {
    rows.push({ key: "disabled_themes", value: body.disabledThemes, updated_at: now });
  }
  // 외부 리뷰 링크 (빈 문자열은 저장 → 미노출 처리)
  const isHttpUrl = (u: string) => /^https?:\/\/.+/i.test(u);
  if (body.naverUrl != null) {
    const u = String(body.naverUrl).trim();
    if (u && !isHttpUrl(u)) return NextResponse.json({ error: "네이버 URL 형식을 확인해 주세요. (http로 시작)" }, { status: 400 });
    rows.push({ key: "naver_url", value: u, updated_at: now });
  }
  if (body.googleUrl != null) {
    const u = String(body.googleUrl).trim();
    if (u && !isHttpUrl(u)) return NextResponse.json({ error: "구글 URL 형식을 확인해 주세요. (http로 시작)" }, { status: 400 });
    rows.push({ key: "google_url", value: u, updated_at: now });
  }
  if (body.extRating != null) {
    const n = Number(body.extRating);
    if (!(n >= 0 && n <= 5)) return NextResponse.json({ error: "외부 평점은 0~5 사이여야 합니다." }, { status: 400 });
    rows.push({ key: "ext_rating", value: n, updated_at: now });
  }
  if (body.extCount != null) {
    const n = Number(body.extCount);
    if (!(n >= 0)) return NextResponse.json({ error: "외부 리뷰 수를 확인해 주세요." }, { status: 400 });
    rows.push({ key: "ext_count", value: n, updated_at: now });
  }
  if (!rows.length) return NextResponse.json({ error: "변경할 설정이 없습니다." }, { status: 400 });

  const { error } = await db.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "설정 저장 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
