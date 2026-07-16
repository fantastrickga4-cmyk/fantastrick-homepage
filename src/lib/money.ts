// 예약금·환불 계산 — 서버(통계)와 화면(목록)이 반드시 같은 기준을 쓰도록 한 곳에 모음.
// 여기가 갈라지면 "환불 대기 2건"이라 떠 있는데 목록엔 1건만 나오는 식으로 어긋난다.

export type MoneyRow = {
  status: string;
  deposit: number;
  deposit_paid: boolean;
  refunded: boolean;
  refund_rate: number | null;
  refund_account: string | null;
};

// 환불 대기 = 취소됨 + 입금했었음 + 아직 안 보냄 + 환불율>0 + 계좌 있음
//   · 30분 미입금 자동취소(expire.ts)는 deposit_paid=false·refund_rate=null 이라 자동 제외
//   · 당일취소(환불율 0%)는 보낼 돈이 없어 제외
export function isRefundPending(r: MoneyRow): boolean {
  return r.status === "cancelled" && r.deposit_paid && !r.refunded && (r.refund_rate ?? 0) > 0 && !!r.refund_account;
}

// 실제로 보낼 환불 금액 (예상이 아니라 확정 금액)
export function refundAmount(r: Pick<MoneyRow, "deposit" | "refund_rate">): number {
  return Math.round((r.deposit * (r.refund_rate ?? 0)) / 100);
}

/**
 * 취소 시 환불율(%) — 손님에게 안내하는 규정(theme-content.ts 의 BOOKING_INFO.refund)과 같은 기준.
 *
 *   · 시작까지 24시간 보다 많이 남음   → 100%
 *   · 24시간 이내지만 전날까지 취소    →  80%
 *   · 당일 취소                       →   0% (환불 불가)
 *
 * ⚠️ 반드시 이 함수 하나만 쓸 것. 예전엔 취소 API 와 손님 화면에 각각 복사돼 있었고, 둘 다
 *    `hours >= 24 ? 100 : 80` 이라 **당일 취소에도 80% 를 줬다**(안내는 "당일 환불 불가"인데).
 *    두 곳에 두면 한쪽만 고쳐져서 "화면엔 80% 라 해놓고 실제론 0원" 같은 사고가 난다.
 *
 * @param nowMs 테스트에서 시각을 고정하기 위한 값 (기본: 지금)
 */
export function refundRateFor(date: string, time: string, nowMs: number = Date.now()): number {
  const startKST = new Date(`${date}T${time}:00+09:00`).getTime();
  if (Number.isNaN(startKST)) return 0;
  const hours = (startKST - nowMs) / 3_600_000;
  if (hours >= 24) return 100;

  // 방문일이 오늘(한국 날짜)이면 당일 취소 → 환불 없음.
  // 서버가 UTC 로 돌아도 한국 날짜로 판정해야 새벽 시간대에 하루가 어긋나지 않는다.
  const todayKST = new Date(nowMs + 9 * 3_600_000).toISOString().slice(0, 10);
  if (date === todayKST) return 0;

  return 80;
}

// 누가 취소했나 — DB에 '취소한 사람' 칸은 없지만 남는 흔적으로 구분된다(SQL 추가 불필요).
//   · 손님 취소(/reservation) : 환불 계좌를 반드시 입력받으므로 refund_account 가 있다
//   · 자동 취소(expire.ts)    : 메모에 "미입금으로 자동 취소" 를 남긴다
//   · 그 외                   : 관리자가 화면에서 [취소 처리] 를 누른 것
export function cancelledBy(r: { refund_account?: string | null; memo?: string | null }): string {
  if ((r.memo || "").includes("자동 취소")) return "미입금 자동취소";
  if (r.refund_account) return "손님이 직접 취소";
  return "관리자 취소";
}
