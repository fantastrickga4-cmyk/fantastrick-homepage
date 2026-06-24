import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { normalizePhone, isValidPhone } from "@/lib/util";
import { themeById, DEPOSIT_PER_PERSON } from "@/lib/data";

const COLS =
  "id, store_id, theme_id, theme_name, date, time, people, name, phone, deposit, deposit_paid, status, refund_bank, refund_account, refund_holder, refund_rate, refunded, memo, source, created_at, confirmed_at, cancelled_at";

// 예약 목록 조회 (필터·검색) + 통계
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status"); // pending/confirmed/cancelled/noshow
  const store = sp.get("store");
  const theme = sp.get("theme");
  const from = sp.get("from");
  const to = sp.get("to");
  const q = (sp.get("q") || "").trim();

  let query = db.from("reservations").select(COLS).order("date", { ascending: false }).order("time", { ascending: true }).limit(500);
  if (status && status !== "all") query = query.eq("status", status);
  if (store && store !== "all") query = query.eq("store_id", store);
  if (theme && theme !== "all") query = query.eq("theme_id", theme);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  if (q) {
    const qPhone = normalizePhone(q);
    if (qPhone.length >= 3) query = query.or(`name.ilike.%${q}%,phone.ilike.%${qPhone}%`);
    else query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });

  // 통계 (전체 기준 — 별도 경량 집계)
  const { data: allRows } = await db.from("reservations").select("status, theme_id, theme_name, deposit, deposit_paid, date");
  const stats = buildStats(allRows || []);

  return NextResponse.json({ ok: true, reservations: data, stats });
}

type Row = { status: string; theme_id: string; theme_name: string; deposit: number; deposit_paid: boolean; date: string };
function buildStats(rows: Row[]) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const byStatus: Record<string, number> = { pending: 0, confirmed: 0, cancelled: 0, noshow: 0 };
  const byTheme: Record<string, { name: string; count: number }> = {};
  let todayCount = 0;
  let depositPaidSum = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.status !== "cancelled") {
      byTheme[r.theme_id] = byTheme[r.theme_id] || { name: r.theme_name, count: 0 };
      byTheme[r.theme_id].count++;
    }
    if (r.date === today && r.status !== "cancelled") todayCount++;
    if (r.deposit_paid) depositPaidSum += r.deposit || 0;
  }
  const themes = Object.values(byTheme).sort((a, b) => b.count - a.count);
  const activeTotal = themes.reduce((s, t) => s + t.count, 0);
  return { total: rows.length, byStatus, todayCount, depositPaidSum, themes, activeTotal };
}

// 예약 수정 (상태/입금/메모/환불완료)
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "예약 id가 필요합니다." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string" && ["pending", "confirmed", "cancelled", "noshow"].includes(body.status)) {
    patch.status = body.status;
    if (body.status === "confirmed") patch.confirmed_at = new Date().toISOString();
  }
  if (typeof body.deposit_paid === "boolean") patch.deposit_paid = body.deposit_paid;
  if (typeof body.refunded === "boolean") patch.refunded = body.refunded;
  if (typeof body.memo === "string") patch.memo = body.memo;

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });

  const { error } = await db.from("reservations").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "수정 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 수동 예약 등록 (전화 예약)
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const themeId = String(body.themeId || "");
  const date = String(body.date || "");
  const time = String(body.time || "");
  const people = Number(body.people || 0);
  const name = String(body.name || "").trim();
  const phone = normalizePhone(String(body.phone || ""));
  const memo = String(body.memo || "").trim() || null;

  const theme = themeById(themeId);
  if (!theme || theme.soon) return NextResponse.json({ error: "테마를 확인해 주세요." }, { status: 400 });
  if (!date || !time) return NextResponse.json({ error: "날짜·시간을 입력해 주세요." }, { status: 400 });
  if (!(people >= 1 && people <= 8)) return NextResponse.json({ error: "인원을 확인해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호를 확인해 주세요." }, { status: 400 });

  const deposit = DEPOSIT_PER_PERSON * people;
  const { error } = await db.from("reservations").insert({
    store_id: theme.store, theme_id: theme.id, theme_name: theme.name,
    date, time, people, name, phone, deposit, status: "pending", source: "phone", memo,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "이미 예약된 시간입니다." }, { status: 409 });
    return NextResponse.json({ error: "등록 중 오류가 발생했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
