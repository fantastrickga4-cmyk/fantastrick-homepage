import type { SupabaseClient } from "@supabase/supabase-js";
import { isRefundOwed, type MoneyRow } from "@/lib/money";

// 미입금 예약 자동취소 (지연 정리 방식) — 접속 시점에 청소한다.
//
// 규칙 (손님에게 문자로 안내하는 것과 반드시 같아야 함):
//   ① 보통은 접수 후 30분 안에 입금 확인이 안 되면 취소.
//   ② 단, 자정(KST 00:00) 이후에 접수된 예약은 그날 오전 10시까지 기다린다.
//      → 문자에 "(자정이후 예약자의 경우 익일 오전10시까지)" 라고 안내하고 있고,
//        기존 fantastrick.co.kr 도 "영업시간 외 예약은 다음날 오전 10시까지 입금하시면 됩니다"로 운영했다.
//      → 이 예외가 없으면 밤 손님에게 "아침 10시까지 넣으세요"라고 문자를 보내놓고
//        30분 뒤에 취소해버린다(= 지키지 못할 약속).
//
// ⚠️ 아래 숫자를 바꾸면 lib/sms-templates.ts 의 예약대기 문구(reservation 4개)도 같이 바꿀 것.
export const EXPIRE_MINUTES = 30;      // 보통 유예 (화면 카운트다운도 이 값을 씀)
export const GRACE_UNTIL_HOUR = 10;    // 자정 이후 접수 건은 이 시각(KST)까지 기다림

const KST_OFFSET = 9 * 3600 * 1000;

// 자정 이후 접수 건을 아직 봐줘야 하는 시간인가?
//   "오전 10시까지 입금" + 사장님이 10시부터 순차 확인 → 10시가 지나고 나서 30분을 더 준다.
//   (10시 정각에 쓸어버리면, 9시 55분에 입금한 손님을 사장님이 확인하기도 전에 취소됨)
export function isInMidnightGrace(nowMs: number = Date.now()): boolean {
  const kst = new Date(nowMs + KST_OFFSET);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes < GRACE_UNTIL_HOUR * 60 + EXPIRE_MINUTES;
}

// 오늘 자정(KST)을 UTC ISO 로. 이 시각 이후에 접수된 건이 "자정 이후 예약".
export function kstMidnightIso(nowMs: number = Date.now()): string {
  const kst = new Date(nowMs + KST_OFFSET);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - KST_OFFSET).toISOString();
}

export async function sweepExpiredReservations(db: SupabaseClient): Promise<void> {
  const now = Date.now();
  const cutoff = new Date(now - EXPIRE_MINUTES * 60 * 1000).toISOString();

  let q = db
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      memo: "미입금으로 자동 취소",
    })
    .eq("status", "pending")
    .eq("deposit_paid", false)
    .lt("created_at", cutoff);

  // 아직 오전 10시 30분(KST) 전이면, 오늘 자정 이후 접수된 건은 건드리지 않는다.
  //   → 새벽 2시 예약: 10시 30분까지 살아있음 (문자로 약속한 대로)
  //   → 어제 밤 11시 예약: 자정 이전이라 이 조건에 걸리지 않고 30분 룰대로 취소됨
  if (isInMidnightGrace(now)) {
    q = q.lt("created_at", kstMidnightIso(now));
  }

  await q;
}

// ─── 기록 보관 정책 (2026-07-21 사장님 지시) ──────────────────────────
//   · 이용/취소가 '일주일' 지나면 → 손님 조회 화면에서 숨김 (DB엔 남고, 관리자는 계속 봄)
//   · 이용/취소가 '한 달' 지나면 → DB에서 완전 삭제 (딸린 이력은 cascade 삭제, 입금기록은 링크만 해제)
//   ⚠️ 환불이 아직 안 끝난 취소건(돌려줄 돈 남음)은 한 달이 지나도 삭제하지 않는다 — 돈 기록이 사라지면 안 됨.
export const HIDE_AFTER_DAYS = 7;
export const DELETE_AFTER_DAYS = 30;

// 오늘 기준 N일 전의 한국 날짜("YYYY-MM-DD"). 이용일(date) 비교용.
function kstDateMinus(days: number, nowMs: number): string {
  return new Date(nowMs + KST_OFFSET - days * 86400000).toISOString().slice(0, 10);
}

// 손님 조회 화면에서 숨길 예약인가 — '끝난 지 일주일 넘은' 취소·이용완료.
//   · 취소건: 취소한 시각(cancelled_at) 기준
//   · 그 외(이용완료·노쇼 등, 또는 취소인데 취소시각이 없는 옛 데이터): 이용일(date) 기준
//   · 미래 예약·최근(일주일 내) 건은 그대로 보인다.
export function isHiddenFromLookup(
  r: { status: string; date: string; cancelled_at?: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (r.status === "cancelled" && r.cancelled_at) {
    return Date.parse(r.cancelled_at) < nowMs - HIDE_AFTER_DAYS * 86400000;
  }
  return r.date < kstDateMinus(HIDE_AFTER_DAYS, nowMs);
}

// 한 달 지난 예약을 실제로 삭제. 삭제한 건수를 돌려준다.
//   이력(reservation_logs)은 FK on delete cascade 로 자동 삭제되고,
//   입금기록(deposits.matched_reservation_id)은 on delete set null 로 링크만 풀린다.
export async function purgeOldReservations(db: SupabaseClient, nowMs: number = Date.now()): Promise<number> {
  const cancelCutoff = new Date(nowMs - DELETE_AFTER_DAYS * 86400000).toISOString();
  const dateCutoff = kstDateMinus(DELETE_AFTER_DAYS, nowMs);
  // 후보: (취소된 지 한 달 넘음) 또는 (이용일이 한 달 넘게 지남)
  const { data, error } = await db
    .from("reservations")
    .select("id, status, deposit, deposit_paid, refunded, refund_rate, refund_account")
    .or(`and(status.eq.cancelled,cancelled_at.lt.${cancelCutoff}),date.lt.${dateCutoff}`);
  if (error || !data || data.length === 0) return 0;
  // 🔴 환불 안 끝난 취소건은 제외 — 돌려줄 돈이 남아있으면 절대 지우지 않는다.
  //    isRefundOwed(계좌 유무 무관)로 봐야, 사장님이 취소해 계좌를 아직 못 받은 건도 지켜진다.
  //    (예전 isRefundReady 기준은 계좌 없는 환불 대기건을 한 달 뒤 삭제해 돈+기록이 사라졌다)
  const ids = data
    .filter((r) => !isRefundOwed(r as MoneyRow))
    .map((r) => r.id as string);
  if (ids.length === 0) return 0;
  const { error: delErr } = await db.from("reservations").delete().in("id", ids);
  if (delErr) { console.error("[보관정책 삭제 실패]", delErr.message); return 0; }
  return ids.length;
}

// 삭제 sweep 을 너무 자주 돌리지 않게 인스턴스별 1시간에 한 번으로 제한.
//   (삭제 자체는 여러 번 돌아도 무해하지만, 매 요청마다 조회+삭제는 낭비라 throttle)
let lastPurgeMs = 0;
export async function maybePurgeOldReservations(db: SupabaseClient): Promise<void> {
  const now = Date.now();
  if (now - lastPurgeMs < 3600_000) return;
  lastPurgeMs = now;
  await purgeOldReservations(db, now).catch(() => {});
}
