// 입금 자동매칭용 타입.
//
// bank-auto 프로젝트(D:\test3\bank-auto)에서 그대로 옮겨온 것. parser.ts / matcher.ts 가
// 이 타입을 쓰므로, 저쪽 파일을 다시 가져올 일이 생기면 여기도 같이 맞춰야 한다.
// (필요 없는 필드 — 브라우저 자동화 핸들 등 — 는 뺐다)

export type DepositStatus =
  | "pending"   // 받았고 처리 중
  | "approved"  // 입금확인까지 완료
  | "no_match"  // 이름+금액이 맞는 예약이 없음
  | "failed"    // 처리 중 오류
  | "dry_run";  // 연습모드 — 매칭만 하고 실제로 안 누름

/**
 * 처리 중인 입금 1건 (메모리 상의 모양).
 * DB 의 deposits 표는 snake_case 라 모양이 다르다 — 저장할 때 변환한다.
 */
export interface Deposit {
  id: string;
  /** 같은 알림인지 판별하는 열쇠. 보낸시각+원문으로 만든 지문. */
  eventId: string;
  depositorName: string;
  amount: number;
  rawText: string;
  receivedAt: number; // epoch ms — 태블릿이 알림 받은 시각
  ingestedAt: number; // epoch ms — 서버가 받은 시각
  status: DepositStatus;
  matchedReservationId?: string;
  approvedAt?: number;
  errorMessage?: string;
  attempts: number;
}

/** 매칭 대상 예약 (예약 테이블에서 필요한 것만 추린 모양) */
export interface Reservation {
  id: string;
  name: string;
  phone?: string;
  /** 예약금(원). 0 이면 매처가 금액 검증을 건너뛴다. */
  amount: number;
  bookedAt?: string;
}
