import type { Deposit, Reservation } from "./types";

function normalizeName(s: string): string {
  return s.replace(/\s+/g, '').normalize('NFC').toLowerCase();
}

export interface MatchResult {
  reservation: Reservation;
  reason: 'name' | 'name+amount' | 'name+amount+phone';
}

/**
 * 정확 일치만 허용. 부분 매칭/유사 매칭은 절대 안 함 (오송금 방지).
 *
 *  - 이름: 공백 제거 + NFC 정규화 후 정확 일치
 *  - 금액:
 *      - reservation.amount > 0 이면 정확히 같은 원화 금액
 *      - reservation.amount === 0 이면 금액 검증 skip (캘린더-가격 매핑 미설정)
 *  - 전화번호: 있으면 보조 확인 (없어도 통과)
 *
 * 여러 건 매칭 시 자동 승인 금지 (운영자 수동 처리).
 */
export function findMatch(deposit: Deposit, reservations: Reservation[]): MatchResult | null {
  const depositName = normalizeName(deposit.depositorName);

  const candidates = reservations.filter((r) => {
    if (normalizeName(r.name) !== depositName) return false;
    // 가격 매핑이 없는 예약 (amount=0) → 금액 검증 skip
    if (r.amount === 0) return true;
    return r.amount === deposit.amount;
  });

  if (candidates.length === 0) return null;

  // 1건만 매칭되면 안전하게 사용
  if (candidates.length === 1) {
    const reservation = candidates[0];
    if (!reservation) return null;
    const reason: MatchResult['reason'] =
      reservation.amount === 0
        ? 'name'
        : reservation.phone
          ? 'name+amount+phone'
          : 'name+amount';
    return { reservation, reason };
  }

  // 여러 건 매칭 시 — 절대 자동 승인하지 않음 (모호함)
  return null;
}
