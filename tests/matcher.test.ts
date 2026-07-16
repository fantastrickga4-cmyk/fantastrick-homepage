import { describe, it, expect } from 'vitest';
import { findMatch } from "../src/lib/bank/matcher";
import type { Deposit, Reservation } from "../src/lib/bank/types";

function makeDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: 'd1',
    eventId: 'evt-d1',
    depositorName: '홍길동',
    amount: 50000,
    rawText: '',
    receivedAt: Date.now(),
    ingestedAt: Date.now(),
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

describe('findMatch', () => {
  it('이름+금액 정확히 일치하면 매칭', () => {
    const deposit = makeDeposit();
    const reservations: Reservation[] = [
      { id: 'r1', name: '홍길동', amount: 50000 },
    ];
    const match = findMatch(deposit, reservations);
    expect(match?.reservation.id).toBe('r1');
  });

  it('공백 차이는 정규화로 처리', () => {
    const deposit = makeDeposit({ depositorName: '홍 길동' });
    const reservations: Reservation[] = [
      { id: 'r1', name: '홍길동', amount: 50000 },
    ];
    expect(findMatch(deposit, reservations)?.reservation.id).toBe('r1');
  });

  it('금액 1원이라도 다르면 매칭 안 됨', () => {
    const deposit = makeDeposit({ amount: 50000 });
    const reservations: Reservation[] = [
      { id: 'r1', name: '홍길동', amount: 49999 },
    ];
    expect(findMatch(deposit, reservations)).toBeNull();
  });

  it('이름 다르면 매칭 안 됨 (부분 일치 금지)', () => {
    const deposit = makeDeposit({ depositorName: '홍길' });
    const reservations: Reservation[] = [
      { id: 'r1', name: '홍길동', amount: 50000 },
    ];
    expect(findMatch(deposit, reservations)).toBeNull();
  });

  it('동명이인 + 동일금액이면 모호하므로 매칭 안 함', () => {
    const deposit = makeDeposit();
    const reservations: Reservation[] = [
      { id: 'r1', name: '홍길동', amount: 50000 },
      { id: 'r2', name: '홍길동', amount: 50000 },
    ];
    expect(findMatch(deposit, reservations)).toBeNull();
  });

  it('금액이 다른 동명이인은 정확히 일치하는 1건만 매칭', () => {
    const deposit = makeDeposit({ amount: 50000 });
    const reservations: Reservation[] = [
      { id: 'r1', name: '홍길동', amount: 30000 },
      { id: 'r2', name: '홍길동', amount: 50000 },
    ];
    expect(findMatch(deposit, reservations)?.reservation.id).toBe('r2');
  });

  describe('가격 매핑 미설정 (reservation.amount=0)', () => {
    it('reservation.amount=0이면 금액 검증 skip, 이름만 매칭', () => {
      const deposit = makeDeposit({ amount: 12345 });
      const reservations: Reservation[] = [{ id: 'r1', name: '홍길동', amount: 0 }];
      const result = findMatch(deposit, reservations);
      expect(result?.reservation.id).toBe('r1');
      expect(result?.reason).toBe('name');
    });

    it('amount=0 예약 여러 건이고 같은 이름이면 모호 → 매칭 안 함', () => {
      const deposit = makeDeposit();
      const reservations: Reservation[] = [
        { id: 'r1', name: '홍길동', amount: 0 },
        { id: 'r2', name: '홍길동', amount: 0 },
      ];
      expect(findMatch(deposit, reservations)).toBeNull();
    });

    it('amount=0이어도 이름 다르면 매칭 안 됨', () => {
      const deposit = makeDeposit();
      const reservations: Reservation[] = [{ id: 'r1', name: '박서준', amount: 0 }];
      expect(findMatch(deposit, reservations)).toBeNull();
    });
  });
});
