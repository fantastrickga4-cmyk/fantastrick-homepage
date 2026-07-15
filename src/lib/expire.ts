import type { SupabaseClient } from "@supabase/supabase-js";

// 30분 미입금 자동취소 (지연 정리 방식)
// status='pending' AND deposit_paid=false AND created_at < (now - 30분) 인 예약을
// 접속 시점에 'cancelled' 로 정리한다. 실패해도 호출부 본 로직은 진행되도록 try/catch 로 감쌀 것.
// ⚠️ 이 숫자를 바꾸면 예약대기 안내 문자의 "예약 후 30분 이내에 입금확인이…" 문구도
//    같이 바꿔야 한다 (lib/sms-templates.ts 의 reservation 4개). 안 그러면 안내와 실제가 어긋남.
export const EXPIRE_MINUTES = 30; // 화면 카운트다운도 이 값을 쓴다(하드코딩하면 나중에 화면만 거짓말함)

export async function sweepExpiredReservations(db: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRE_MINUTES * 60 * 1000).toISOString();
  await db
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      memo: "30분 내 예약금 미입금으로 자동 취소",
    })
    .eq("status", "pending")
    .eq("deposit_paid", false)
    .lt("created_at", cutoff);
}
