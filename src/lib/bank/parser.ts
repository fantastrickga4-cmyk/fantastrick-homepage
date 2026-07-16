/**
 * 입금 알림 텍스트 → 구조화된 결과로 파싱.
 *
 * 안드로이드는 raw 텍스트만 보내고 모든 파싱은 여기서 함.
 * 새 카뱅 포맷이 등장하면 정규식을 여기에 추가하면 됨 (안드로이드 재빌드 불필요).
 *
 * 지원 포맷:
 *  1) 카뱅 신형 (앱 푸시):
 *       "입금 1,000원\n장유한 → 입출금통장(5207)\n잔액 45,478원"
 *  2) "이름님이 N원을 입금"
 *  3) "이름 N원 입금"
 *  4) "입금 N원 이름님" / "입금 N원 이름" (화살표 없는 변형)
 */

export interface ParsedDeposit {
  depositorName: string;
  amount: number;
  kind: 'deposit';
}

const NAME_CLASS = '[가-힣A-Za-z]{2,10}';
// 카뱅 알림에서 이름과 도착 계좌 사이를 가르는 구분자.
// → (U+2192), ▶ (U+25B6), ▸ (U+25B8), › (U+203A), > (ASCII), - (ASCII)
const ARROW_CLASS = '[→▶▸›>\\-]';

const PATTERNS: ReadonlyArray<{ regex: RegExp; nameGroup: number; amountGroup: number }> = [
  // 1) 카뱅 신형: "입금 1,000원 ... 장유한 →"
  {
    regex: new RegExp(
      `(?:입금|송금)\\s*([\\d,]+)\\s*원[\\s\\S]*?(${NAME_CLASS})\\s*${ARROW_CLASS}`,
    ),
    nameGroup: 2,
    amountGroup: 1,
  },
  // 2) 옛 형식: "홍길동님이 50,000원을 입금"
  {
    regex: new RegExp(
      `(${NAME_CLASS})\\s*님(?:이)?\\s*([\\d,]+)\\s*원(?:을)?\\s*(?:입금|송금|보냈)`,
    ),
    nameGroup: 1,
    amountGroup: 2,
  },
  // 3) 단순: "홍길동 50,000원 입금"
  {
    regex: new RegExp(`(${NAME_CLASS})\\s+([\\d,]+)\\s*원\\s*(?:입금|송금)`),
    nameGroup: 1,
    amountGroup: 2,
  },
  // 4) 화살표 없는 카뱅 변형: "입금 N원 ... 이름님"
  {
    regex: new RegExp(
      `(?:입금|송금)\\s*([\\d,]+)\\s*원[\\s\\S]*?(${NAME_CLASS})\\s*님`,
    ),
    nameGroup: 2,
    amountGroup: 1,
  },
  // 5) 화살표 없는 변형 (관대): "입금 N원 ... 이름" — 마지막 단어가 이름
  // 위 패턴 모두 실패 시 fallback. 이름 다음에 화살표/님 없어도 매칭.
  {
    regex: new RegExp(
      `(?:입금|송금)\\s*([\\d,]+)\\s*원[\\s\\S]*?(${NAME_CLASS})(?=[\\s\\n]|$)`,
    ),
    nameGroup: 2,
    amountGroup: 1,
  },
];

/**
 * 정확히 1건만 안전하게 파싱. 형식 안 맞으면 null.
 * 부분 매칭/추측은 금지 — 자동 승인 흐름에서 잘못된 이름·금액으로 매칭되면 큰 사고.
 */
export function parseDeposit(rawText: string): ParsedDeposit | null {
  if (!rawText || rawText.length > 2000) return null;

  const cleaned = rawText.replace(/\n/g, ' ').trim();
  if (!cleaned) return null;

  for (const { regex, nameGroup, amountGroup } of PATTERNS) {
    const m = cleaned.match(regex);
    if (!m) continue;

    const rawName = m[nameGroup];
    const rawAmount = m[amountGroup];
    if (!rawName || !rawAmount) continue;

    const amount = Number(rawAmount.replace(/,/g, ''));
    if (!Number.isInteger(amount) || amount <= 0) continue;

    return {
      depositorName: rawName.trim(),
      amount,
      kind: 'deposit',
    };
  }

  return null;
}
