import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { normalizePhone, isValidPhone } from "@/lib/util";
import { themeById } from "@/lib/data";
import { isRefundPending, refundAmount } from "@/lib/money";
import { sendReservationSms } from "@/lib/sms";
import { sweepExpiredReservations } from "@/lib/expire";

const COLS =
  "id, store_id, theme_id, theme_name, date, time, people, name, phone, deposit, deposit_paid, status, refund_bank, refund_account, refund_holder, refund_rate, refunded, memo, source, created_at, confirmed_at, cancelled_at";

// 예약 목록 조회 (필터·검색) + 통계
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  // 만료 예약(30분 미입금) 자동 정리 — 실패해도 목록 조회는 진행
  await sweepExpiredReservations(db).catch(() => {});

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status"); // pending/confirmed/cancelled/noshow
  const store = sp.get("store");
  const theme = sp.get("theme");
  const from = sp.get("from");
  const to = sp.get("to");
  const deposit = sp.get("deposit"); // "unpaid" → 미입금만
  const q = (sp.get("q") || "").trim();

  let query = db.from("reservations").select(COLS).order("date", { ascending: false }).order("time", { ascending: true }).limit(500);
  if (status && status !== "all") query = query.eq("status", status);
  if (store && store !== "all") query = query.eq("store_id", store);
  if (theme && theme !== "all") query = query.eq("theme_id", theme);
  if (deposit === "unpaid") query = query.eq("deposit_paid", false);
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
  const { data: allRows } = await db
    .from("reservations")
    .select("status, theme_id, theme_name, deposit, deposit_paid, date, refunded, refund_rate, refund_account");
  const stats = buildStats(allRows || []);

  return NextResponse.json({ ok: true, reservations: data, stats });
}

type Row = {
  status: string; theme_id: string; theme_name: string; deposit: number; deposit_paid: boolean; date: string;
  refunded: boolean; refund_rate: number | null; refund_account: string | null;
};
function buildStats(rows: Row[]) {
  // 모든 시각을 KST 기준으로 판정 (서버가 UTC라도 정확)
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const today = kstNow.toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7); // "YYYY-MM"
  // 이번 주 월~일 범위 (KST)
  const dow = kstNow.getUTCDay(); // 0=일 … 6=토
  const diffToMon = (dow + 6) % 7; // 월요일까지 거슬러 올라갈 일수
  const monday = new Date(kstNow); monday.setUTCDate(kstNow.getUTCDate() - diffToMon);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  const weekFrom = monday.toISOString().slice(0, 10);
  const weekTo = sunday.toISOString().slice(0, 10);

  const byStatus: Record<string, number> = { pending: 0, confirmed: 0, cancelled: 0, noshow: 0 };
  const byTheme: Record<string, { name: string; count: number }> = {};
  let todayCount = 0;
  let depositPaidSum = 0;
  let weekCount = 0;
  let monthConfirmedDeposit = 0;
  let pendingUnpaid = 0; // 입금대기 = 대기 상태 & 미입금
  let pendingUnpaidSum = 0;                    // 입금대기 금액 합
  let refundPending = 0, refundPendingSum = 0; // 환불대기 건수·금액 합
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.status === "pending" && !r.deposit_paid) { pendingUnpaid++; pendingUnpaidSum += r.deposit || 0; }
    if (isRefundPending(r)) { refundPending++; refundPendingSum += refundAmount(r); }
    if (r.status !== "cancelled") {
      byTheme[r.theme_id] = byTheme[r.theme_id] || { name: r.theme_name, count: 0 };
      byTheme[r.theme_id].count++;
      if (r.date >= weekFrom && r.date <= weekTo) weekCount++;
    }
    if (r.date === today && r.status !== "cancelled") todayCount++;
    if (r.deposit_paid) depositPaidSum += r.deposit || 0;
    if (r.status === "confirmed" && r.date.slice(0, 7) === monthPrefix) monthConfirmedDeposit += r.deposit || 0;
  }
  const themes = Object.values(byTheme).sort((a, b) => b.count - a.count);
  const activeTotal = themes.reduce((s, t) => s + t.count, 0);
  return { total: rows.length, byStatus, pendingUnpaid, pendingUnpaidSum, refundPending, refundPendingSum, todayCount, depositPaidSum, weekCount, monthConfirmedDeposit, themes, activeTotal };
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

  // 바꾸기 전 상태 — 문자를 "실제로 바뀐 순간"에만 1번 보내기 위해 필요
  const { data: before } = await db
    .from("reservations")
    .select("status, deposit_paid, name, phone, theme_id, theme_name, date, time, people, refund_rate")
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string" && ["pending", "confirmed", "cancelled", "noshow"].includes(body.status)) {
    patch.status = body.status;
    if (body.status === "confirmed") patch.confirmed_at = new Date().toISOString();
    if (body.status === "cancelled") patch.cancelled_at = new Date().toISOString();
  }
  if (typeof body.deposit_paid === "boolean") patch.deposit_paid = body.deposit_paid;
  if (typeof body.refunded === "boolean") patch.refunded = body.refunded;
  if (typeof body.memo === "string") patch.memo = body.memo;

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });

  // 입금확인 = 예약확정 (기존 fantastrick.co.kr 과 같은 방식).
  // 입금을 확인하면 대기 상태를 확정으로 함께 올리고, 안내는 입금확정 문자 1통만 보낸다.
  const nowPaid = patch.deposit_paid === true && !before.deposit_paid;
  if (nowPaid && before.status === "pending" && patch.status == null) {
    patch.status = "confirmed";
    patch.confirmed_at = new Date().toISOString();
  }

  const { error } = await db.from("reservations").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "수정 중 오류가 발생했습니다." }, { status: 500 });

  // 안내 문자 (알리고 키 있을 때만 실제 발송) — 상태가 실제로 바뀐 경우에만 1통
  const r = { ...before, refund_rate: before.refund_rate };
  if (nowPaid) {
    // 입금확인 → 예약확정 안내 (기존 payment 문자)
    await sendReservationSms("payment", r).catch(() => {});
  } else if (patch.status === "confirmed" && before.status !== "confirmed") {
    // 입금 없이 관리자가 확정한 경우
    await sendReservationSms("confirm", r).catch(() => {});
  } else if (patch.status === "cancelled" && before.status !== "cancelled") {
    // 관리자가 취소한 경우 (기존 admin_cancel 문자)
    await sendReservationSms("admin_cancel", r).catch(() => {});
  }
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

  const deposit = theme.deposit;
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
