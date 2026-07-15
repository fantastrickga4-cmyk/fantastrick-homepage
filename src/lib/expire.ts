import type { SupabaseClient } from "@supabase/supabase-js";

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
