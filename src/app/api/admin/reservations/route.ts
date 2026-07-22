import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { normalizePhone, isValidPhone } from "@/lib/util";
import { themeById, isSlotTime } from "@/lib/data";
import { isRefundOwed, refundAmount, refundRateFor } from "@/lib/money";
import { getConfig, depositOf } from "@/lib/settings";
import { sendReservationSms } from "@/lib/sms";
import { sweepExpiredReservations, maybePurgeOldReservations } from "@/lib/expire";

const COLS =
  "id, store_id, theme_id, theme_name, date, time, people, name, phone, deposit, deposit_paid, deposit_payer, status, refund_bank, refund_account, refund_holder, refund_rate, refunded, memo, source, created_at, confirmed_at, cancelled_at, paid_at, refunded_at, paid_source";

// 변경 이력에 쓸 한국어 상태명
const ST_KO: Record<string, string> = { pending: "대기", confirmed: "확정", cancelled: "취소", noshow: "노쇼" };

// 예약 목록 조회 (필터·검색) + 통계
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  // 만료 예약(30분 미입금) 자동 정리 — 실패해도 목록 조회는 진행
  await sweepExpiredReservations(db).catch(() => {});
  await maybePurgeOldReservations(db).catch(() => {});

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

  // basis=money → "돈이 오간 날" 기준 조회 (입출금 내역용).
  //   기본은 예약일(date) 기준이지만, 장부는 7월에 받은 돈이 8월 예약이라고 8월로 잡히면 안 된다.
  //   한 예약이 7월 입금 + 8월 환불이면 두 달에 나뉘어 잡히는 게 맞다(그래서 or 조건).
  if (sp.get("basis") === "money" && from && to) {
    const s = `${from}T00:00:00+09:00`, e = `${to}T23:59:59+09:00`;
    query = query.or(`and(paid_at.gte.${s},paid_at.lte.${e}),and(refunded_at.gte.${s},refunded_at.lte.${e})`);
  } else {
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);
  }
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
    if (isRefundOwed(r)) { refundPending++; refundPendingSum += refundAmount(r); }
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

  // 바꾸기 전 상태 — 문자를 "실제로 바뀐 순간"에만 1번 보내고, 변경 이력에 "뭐가 뭐로" 남기기 위해 필요
  const { data: before } = await db
    .from("reservations")
    .select("status, deposit_paid, refunded, name, phone, store_id, theme_id, theme_name, date, time, people, refund_rate, deposit, memo")
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string" && ["pending", "confirmed", "cancelled", "noshow"].includes(body.status)) {
    patch.status = body.status;
    if (body.status === "confirmed") patch.confirmed_at = now;
    if (body.status === "cancelled") patch.cancelled_at = now;
  }
  if (typeof body.deposit_paid === "boolean") patch.deposit_paid = body.deposit_paid;
  if (typeof body.refunded === "boolean") patch.refunded = body.refunded;
  if (typeof body.memo === "string") patch.memo = body.memo;
  if (typeof body.deposit_payer === "string") patch.deposit_payer = body.deposit_payer.trim() || null;

  // 손님 환불 계좌 입력 — 사장님이 취소한 건은 계좌를 모르므로, 손님에게 받아 여기서 채워 넣는다.
  //   계좌가 채워져야 [환불 처리] 큐에서 "바로 보낼 수 있는" 상태(isRefundReady)로 올라온다.
  if (typeof body.refund_bank === "string") patch.refund_bank = body.refund_bank.trim().slice(0, 30) || null;
  if (typeof body.refund_account === "string") patch.refund_account = body.refund_account.trim().slice(0, 40) || null;
  if (typeof body.refund_holder === "string") patch.refund_holder = body.refund_holder.trim().slice(0, 30) || null;

  // 예약 옮기기 (날짜·시간·인원 변경) — 취소 후 재등록을 하지 않게 해서 장부가 더러워지는 걸 막는다.
  //   취소→재등록을 하면 환불율이 계산되고 환불 큐에 뜨고 입금상태가 초기화됨(손님은 그대로 오는데도).
  let moved: { from: string; to: string } | null = null;
  const newDate = typeof body.date === "string" ? body.date : "";
  const newTime = typeof body.time === "string" ? body.time : "";
  const newPeople = body.people != null ? Number(body.people) : null;
  if (newDate || newTime) {
    const d = newDate || before.date;
    const t = newTime || before.time;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isSlotTime(t)) {
      return NextResponse.json({ error: "날짜·시간 형식을 확인해 주세요." }, { status: 400 });
    }
    if (d !== before.date || t !== before.time) {
      // 옮길 칸에 이미 다른 예약이 있는지 (취소건은 칸을 차지하지 않음 — uq_res_slot 과 같은 기준)
      const { data: taken } = await db
        .from("reservations")
        .select("id, name")
        .eq("store_id", before.store_id).eq("theme_id", before.theme_id)
        .eq("date", d).eq("time", t).neq("status", "cancelled").neq("id", id)
        .maybeSingle();
      if (taken) return NextResponse.json({ error: `그 시간에는 이미 ${taken.name}님 예약이 있어요.` }, { status: 409 });
      // 그 날짜에 마감(휴무·차단)이 걸려 있는지도 알려준다 (막지는 않음 — 사장님이 알고 넣는 경우가 있음)
      patch.date = d; patch.time = t;
      moved = { from: `${before.date} ${before.time}`, to: `${d} ${t}` };
    }
  }
  if (newPeople != null) {
    if (!(newPeople >= 1 && newPeople <= 8)) return NextResponse.json({ error: "인원은 1~8명 사이로 입력해 주세요." }, { status: 400 });
    if (newPeople !== before.people) patch.people = newPeople;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });

  // 입금확인 = 예약확정 (기존 fantastrick.co.kr 과 같은 방식).
  // 입금을 확인하면 대기 상태를 확정으로 함께 올리고, 안내는 입금확정 문자 1통만 보낸다.
  const nowPaid = patch.deposit_paid === true && !before.deposit_paid;
  const nowUnpaid = patch.deposit_paid === false && before.deposit_paid;
  const nowRefunded = patch.refunded === true && !before.refunded;
  if (nowPaid && before.status === "pending" && patch.status == null) {
    patch.status = "confirmed";
    patch.confirmed_at = now;
  }
  // 🔴 입금확인을 되돌리면 확정도 같이 되돌린다 (위 승격의 짝).
  //    이게 없으면 "돈 안 냈는데 확정" 상태가 만들어지고, 그 예약은 어디에서도 안 보인다:
  //      · [입금·환불] 의 입금 대기 큐 — status=pending 인 것만 봄 → 안 뜸
  //      · 30분 미입금 자동취소(expire.ts) — status=pending 인 것만 봄 → 안 걸림
  //      · 이번 달 확정 예약금 합계 — deposit_paid 를 안 봄 → 돈을 안 냈는데 매출로 잡힘
  //    즉 사장님이 입금확인을 잘못 눌렀다 되돌리면 그 예약이 영영 방치된다.
  //    (2026-07-17 RPA 점검에서 발견)
  //    ※ 관리자가 같은 요청에서 상태를 직접 지정했으면(patch.status) 그 뜻을 존중해 건드리지 않는다.
  if (nowUnpaid && before.status === "confirmed" && patch.status == null) {
    patch.status = "pending";
    patch.confirmed_at = null;
  }
  // 돈이 실제로 움직인 시각 기록 — 이게 있어야 입출금 내역이 "예약일"이 아니라 "돈 들어온 날" 기준이 됨
  if (nowPaid) patch.paid_at = now;
  if (nowUnpaid) patch.paid_at = null;      // 입금확인을 잘못 눌러 되돌리는 경우

  // 입금을 누가 확인했나 — 'auto' 는 자동매칭 프로그램(bank-auto)이 보낼 때만.
  // 관리자 화면은 아무것도 안 보내므로 기본값 'manual'(사장님이 버튼 누름)이 된다.
  if (nowPaid) patch.paid_source = body.paid_source === "auto" ? "auto" : "manual";
  if (nowUnpaid) patch.paid_source = null;
  if (nowRefunded) patch.refunded_at = now;
  if (patch.refunded === false && before.refunded) patch.refunded_at = null;

  // 🔴 사장님이 '입금완료' 예약을 취소하면 돌려줘야 할 돈이 생긴다.
  //    전에는 refund_rate 가 null 로 남아 환불 대기 큐에도, 예약 상세에도 아무 표시가 없어서
  //    "받은 돈이 남아있다" 는 신호가 화면 어디에도 없었다(입출금 '실수령'엔 그대로 잡힌 채).
  //    → 손님이 직접 취소할 때와 같은 규정으로 환불율을 기록해 둔다.
  //    ✅ 이 건은 계좌가 없어도 환불 대기(isRefundOwed)에 잡히고, [환불 처리] 큐 맨 위
  //       "계좌 입력 필요" 칸에 떠서 사장님이 손님 계좌를 받아 그 자리에서 입력한다.
  //       (2026-07-17 RPA 점검에서 계좌 입력 경로가 없던 것을 2026-07-22 보완)
  const nowCancelled = patch.status === "cancelled" && before.status !== "cancelled";
  if (nowCancelled && before.deposit_paid && before.refund_rate == null) {
    patch.refund_rate = refundRateFor(before.date, before.time);
  }

  const { error } = await db.from("reservations").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "수정 중 오류가 발생했습니다." }, { status: 500 });

  // 변경 이력 — "언제 뭐가 바뀌었나". 1인 운영이라 "누가"는 안 남긴다.
  const logs: { reservation_id: string; action: string; detail: string | null }[] = [];
  if (nowPaid) logs.push({ reservation_id: id, action: "입금확인", detail: `${(before.deposit || 0).toLocaleString()}원${body.deposit_payer ? ` · 입금자 ${body.deposit_payer}` : ""}` });
  if (nowUnpaid) logs.push({ reservation_id: id, action: "입금확인 취소", detail: null });
  if (nowRefunded) logs.push({ reservation_id: id, action: "환불완료", detail: `${refundAmount({ deposit: before.deposit, refund_rate: before.refund_rate }).toLocaleString()}원` });
  // 입금완료 예약을 취소했으면 "얼마를 돌려줘야 하는지" 를 이력에 남긴다.
  // 계좌를 모르면 환불 대기 큐에 안 뜨므로, 최소한 여기라도 흔적이 있어야 잊지 않는다.
  if (nowCancelled && before.deposit_paid && patch.refund_rate != null) {
    const amt = refundAmount({ deposit: before.deposit, refund_rate: patch.refund_rate as number });
    logs.push({
      reservation_id: id, action: "환불 필요",
      detail: amt > 0
        ? `${amt.toLocaleString()}원 (환불율 ${patch.refund_rate}%) · 손님 계좌를 받아 [환불 처리]에서 입력하세요`
        : `환불 대상 아님 (당일/지난 예약 → 환불율 0%)`,
    });
  }
  if (patch.status && patch.status !== before.status) {
    logs.push({ reservation_id: id, action: String(patch.status === "confirmed" ? "확정" : patch.status === "cancelled" ? "취소" : patch.status === "noshow" ? "노쇼" : "대기로 되돌림"), detail: `${ST_KO[before.status] || before.status} → ${ST_KO[String(patch.status)] || patch.status}` });
  }
  if (moved) logs.push({ reservation_id: id, action: "시간 옮김", detail: `${moved.from} → ${moved.to}` });
  if (patch.people != null) logs.push({ reservation_id: id, action: "인원 변경", detail: `${before.people}명 → ${patch.people}명` });
  if (typeof body.memo === "string" && body.memo !== (before.memo || "")) logs.push({ reservation_id: id, action: "메모", detail: body.memo.slice(0, 60) || "(지움)" });
  // 환불 계좌를 채워 넣었을 때 — 이제 [환불 처리] 큐에서 바로 보낼 수 있는 상태가 됐다는 흔적.
  if (patch.refund_account) logs.push({ reservation_id: id, action: "환불 계좌 입력", detail: `${patch.refund_bank || ""} ${patch.refund_account}`.trim() });
  if (logs.length) await db.from("reservation_logs").insert(logs).then(({ error: e }) => { if (e) console.error("[변경이력 기록 실패]", e.message); });

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

  // 예약금은 관리자가 바꿨으면 그 값 (손님 예약과 같은 기준을 써야 금액이 어긋나지 않음)
  const cfg = await getConfig();
  const deposit = depositOf(cfg, theme.id, theme.deposit);
  const { data: made, error } = await db.from("reservations").insert({
    store_id: theme.store, theme_id: theme.id, theme_name: theme.name,
    date, time, people, name, phone, deposit, status: "pending", source: "phone", memo,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "이미 예약된 시간입니다." }, { status: 409 });
    return NextResponse.json({ error: "등록 중 오류가 발생했습니다." }, { status: 500 });
  }
  if (made) {
    await db.from("reservation_logs").insert({ reservation_id: made.id, action: "접수", detail: "관리자 등록(전화 예약)" })
      .then(({ error: e }) => { if (e) console.error("[변경이력 기록 실패]", e.message); });
  }
  return NextResponse.json({ ok: true });
}
