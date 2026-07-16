import { describe, it, expect } from 'vitest';
import { parseDeposit } from "../src/lib/bank/parser";

describe('parseDeposit', () => {
  describe('카뱅 신형 (앱 푸시)', () => {
    it('표준 케이스', () => {
      const raw = '입금 1,000원\n장유한 → 입출금통장(5207)\n잔액 45,478원';
      expect(parseDeposit(raw)).toEqual({
        depositorName: '장유한',
        amount: 1000,
        kind: 'deposit',
      });
    });

    it('큰 금액 (콤마 여러 개)', () => {
      const raw = '입금 1,234,567원\n홍길동 → 입출금통장(1234)';
      expect(parseDeposit(raw)).toMatchObject({ depositorName: '홍길동', amount: 1234567 });
    });

    it('짧은 이름 (2자)', () => {
      expect(parseDeposit('입금 50,000원\n김민 → 입출금통장(5207)')?.depositorName).toBe('김민');
    });

    it('영문 이름', () => {
      expect(parseDeposit('입금 30,000원\nKim → 입출금통장(5207)')?.depositorName).toBe('Kim');
    });

    it('ASCII 화살표 (->)', () => {
      expect(parseDeposit('입금 1,000원 장유한 -> 입출금통장(5207)')?.depositorName).toBe('장유한');
    });

    it('다른 화살표 (▶, ▸, ›)', () => {
      expect(parseDeposit('입금 1,000원 장유한 ▶ 입출금통장(5207)')?.depositorName).toBe('장유한');
      expect(parseDeposit('입금 1,000원 장유한 ▸ 입출금통장(5207)')?.depositorName).toBe('장유한');
      expect(parseDeposit('입금 1,000원 장유한 › 입출금통장(5207)')?.depositorName).toBe('장유한');
    });

    it('알림 전체가 한 줄로 합쳐진 경우 (title | text)', () => {
      const raw = '입금 1,000원 | 장유한 → 입출금통장(5207) 잔액 45,478원';
      expect(parseDeposit(raw)).toMatchObject({ depositorName: '장유한', amount: 1000 });
    });
  });

  describe('옛 알림 포맷', () => {
    it('"이름님이 N원을 입금"', () => {
      expect(parseDeposit('홍길동님이 50,000원을 입금했어요')).toMatchObject({
        depositorName: '홍길동',
        amount: 50000,
      });
    });

    it('"이름님 N원 송금"', () => {
      expect(parseDeposit('박서준님 25,000원 송금')?.depositorName).toBe('박서준');
    });
  });

  describe('단순 포맷', () => {
    it('"이름 N원 입금"', () => {
      expect(parseDeposit('홍길동 50,000원 입금')).toMatchObject({
        depositorName: '홍길동',
        amount: 50000,
      });
    });
  });

  describe('화살표 없는 변형', () => {
    it('"입금 N원 이름님" (님으로 끝)', () => {
      expect(parseDeposit('입금 5,000원\n장유찬님 잔액 100,000원')).toMatchObject({
        depositorName: '장유찬',
        amount: 5000,
      });
    });

    it('"입금 N원 이름 잔액..." (화살표/님 없음, 마지막 fallback)', () => {
      expect(parseDeposit('입금 5,000원 장유찬 잔액 100,000원')).toMatchObject({
        depositorName: '장유찬',
        amount: 5000,
      });
    });
  });

  describe('실패 케이스 (null 반환)', () => {
    it('빈 문자열', () => {
      expect(parseDeposit('')).toBeNull();
    });

    it('금액 없음', () => {
      expect(parseDeposit('홍길동 입금')).toBeNull();
    });

    it('이름 없음', () => {
      expect(parseDeposit('입금 50,000원')).toBeNull();
    });

    it('금액 0원', () => {
      expect(parseDeposit('입금 0원\n홍길동 → 입출금통장(1)')).toBeNull();
    });

    it('출금 알림 (지원 안 함)', () => {
      expect(parseDeposit('출금 1,000원 잔액 45,000원')).toBeNull();
    });

    it('관련 없는 문자열', () => {
      expect(parseDeposit('이건 그냥 일반 메시지입니다')).toBeNull();
    });

    it('과도하게 긴 텍스트는 거부', () => {
      expect(parseDeposit('x'.repeat(2001))).toBeNull();
    });
  });
});
