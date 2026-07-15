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
