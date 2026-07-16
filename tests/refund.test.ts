import { describe, it, expect } from "vitest";
import { refundRateFor, refundAmount, isRefundPending } from "../src/lib/money";

// 손님 돈이 걸린 규정이라 테스트로 못 박아둔다.
// 안내 문구(theme-content.ts 의 BOOKING_INFO.refund)와 반드시 같아야 한다:
//   · 24시간 보다 많이 남음 → 100%
//   · 24시간 이내 · 전날 취소 → 80%
//   · 당일 취소 → 0%

// 기준 시각: 2026-07-20(월) 15:00 KST = 06:00 UTC
const NOW = Date.parse("2026-07-20T15:00:00+09:00");

describe("refundRateFor — 환불율", () => {
  it("24시간 보다 많이 남으면 100%", () => {
    // 7/22 15:00 = 48시간 뒤
    expect(refundRateFor("2026-07-22", "15:00", NOW)).toBe(100);
    // 7/21 16:00 = 25시간 뒤
    expect(refundRateFor("2026-07-21", "16:00", NOW)).toBe(100);
  });

  it("24시간 이내지만 내일이면 80%", () => {
    // 7/21 14:00 = 23시간 뒤 (내일이지만 24시간 안 됨)
    expect(refundRateFor("2026-07-21", "14:00", NOW)).toBe(80);
    // 7/21 00:30 = 9시간 반 뒤
    expect(refundRateFor("2026-07-21", "00:30", NOW)).toBe(80);
  });

  it("당일(오늘) 취소는 0% — 예전엔 여기서 80%를 줬다", () => {
    expect(refundRateFor("2026-07-20", "22:00", NOW)).toBe(0); // 7시간 뒤
    expect(refundRateFor("2026-07-20", "16:00", NOW)).toBe(0); // 1시간 뒤
    expect(refundRateFor("2026-07-20", "10:00", NOW)).toBe(0); // 이미 지남
  });

  it("경계: 정확히 24시간 남으면 100% (손님에게 유리한 쪽)", () => {
    expect(refundRateFor("2026-07-21", "15:00", NOW)).toBe(100);
  });

  it("한국 날짜로 판정한다 — 서버가 UTC 라도 새벽에 하루가 밀리면 안 됨", () => {
    // 2026-07-20 01:00 KST = 7/19 16:00 UTC. 한국에선 '오늘'이므로 당일 취소.
    const earlyMorning = Date.parse("2026-07-20T01:00:00+09:00");
    expect(refundRateFor("2026-07-20", "23:00", earlyMorning)).toBe(0);
    // 같은 시각에 '내일(7/21)' 예약은 24시간 넘게 남아 100%
    expect(refundRateFor("2026-07-21", "23:00", earlyMorning)).toBe(100);
  });

  it("날짜 형식이 이상하면 0% (돈을 잘못 내보내지 않는 쪽으로)", () => {
    expect(refundRateFor("이상한날짜", "15:00", NOW)).toBe(0);
  });
});

describe("refundAmount — 실제 환불 금액", () => {
  it("환불율대로 계산", () => {
    expect(refundAmount({ deposit: 30000, refund_rate: 100 })).toBe(30000);
    expect(refundAmount({ deposit: 30000, refund_rate: 80 })).toBe(24000);
    expect(refundAmount({ deposit: 30000, refund_rate: 0 })).toBe(0);
    expect(refundAmount({ deposit: 63000, refund_rate: 80 })).toBe(50400);
  });
  it("환불율이 없으면(자동취소 등) 0원", () => {
    expect(refundAmount({ deposit: 30000, refund_rate: null })).toBe(0);
  });
});

describe("isRefundPending — 환불 대기 목록에 뜨는 조건", () => {
  const base = { status: "cancelled", deposit: 30000, deposit_paid: true, refunded: false, refund_rate: 80, refund_account: "123-456" };
  it("취소 + 입금했었음 + 아직 안 보냄 + 환불율>0 + 계좌 있음 → 대기", () => {
    expect(isRefundPending(base)).toBe(true);
  });
  it("당일취소(0%)는 보낼 돈이 없어 대기에 안 뜬다", () => {
    expect(isRefundPending({ ...base, refund_rate: 0 })).toBe(false);
  });
  it("입금 안 한 자동취소는 대기에 안 뜬다", () => {
    expect(isRefundPending({ ...base, deposit_paid: false, refund_rate: null })).toBe(false);
  });
  it("이미 환불했으면 안 뜬다", () => {
    expect(isRefundPending({ ...base, refunded: true })).toBe(false);
  });
});
