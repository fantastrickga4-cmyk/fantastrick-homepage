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

// 누가 취소했나 — DB에 '취소한 사람' 칸은 없지만 남는 흔적으로 구분된다(SQL 추가 불필요).
//   · 손님 취소(/reservation) : 환불 계좌를 반드시 입력받으므로 refund_account 가 있다
//   · 자동 취소(expire.ts)    : 메모에 "미입금으로 자동 취소" 를 남긴다
//   · 그 외                   : 관리자가 화면에서 [취소 처리] 를 누른 것
export function cancelledBy(r: { refund_account?: string | null; memo?: string | null }): string {
  if ((r.memo || "").includes("자동 취소")) return "미입금 자동취소";
  if (r.refund_account) return "손님이 직접 취소";
  return "관리자 취소";
}
