// 판타스트릭 매장·테마 공유 데이터 (홈·예약·리뷰에서 함께 사용)

export type Store = {
  id: "s1" | "s2" | "s3";
  tag: string;
  name: string;
  addr: string;
  phone: string;
  hours: string;
  themes: string;
  tgc?: boolean;
};

export type Theme = {
  id: string;
  name: string;
  store: Store["id"];
  storeTag: string;
  poster: string;
  minutes: number;
  difficulty: number; // 1~5
  genres: string[];
  murder?: boolean;
  cat: string; // 필터용: "s1" / "s3 murder" 등
  soon?: boolean;
  soonGenres?: string[];
  deposit: number; // 테마 고정 예약금(원) — 인원과 무관
};

export const STORES: Store[] = [
  {
    id: "s1",
    tag: "1호점",
    name: "판타스트릭 1호점",
    addr: "강남대로79길 39, B1",
    phone: "010-4547-0481",
    hours: "평일 11:00–23:30 · 주말 09:00–23:30 · 연중무휴",
    themes: "태초의 신부 — 이브 프로젝트",
  },
  {
    id: "s2",
    tag: "2호점",
    name: "판타스트릭 2호점",
    addr: "사평대로 353, B1",
    phone: "010-4995-0482",
    hours: "금·토·일 11:00–23:30 · 월~목 부분운영 / 주말 무휴",
    themes: "사자의 서 — Book of Duat",
  },
  {
    id: "s3",
    tag: "3호점 ★",
    name: "판타스트릭 TGC",
    addr: "강남대로83길 34, B1",
    phone: "010-5536-0483",
    hours: "평일 12:00–23:30 · 주말 10:00–23:30 · 연중무휴",
    themes: "락다운시티 · 시간의 영속성(머더룸)",
    tgc: true,
  },
];

export const THEMES: Theme[] = [
  {
    id: "firstfoundbride",
    name: "태초의 신부",
    store: "s1",
    storeTag: "1호점",
    poster: "/images/poster-bride.jpg",
    minutes: 100,
    difficulty: 4,
    genres: ["잠입", "SF 판타지"],
    cat: "s1",
    deposit: 30000,
  },
  {
    id: "bookofduat",
    name: "사자의 서",
    store: "s2",
    storeTag: "2호점",
    poster: "/images/poster-duat.png",
    minutes: 80,
    difficulty: 3,
    genres: ["잠입", "SF 판타지"],
    cat: "s2",
    deposit: 25000,
  },
  {
    id: "ldc",
    name: "락다운시티",
    store: "s3",
    storeTag: "3호점 · TGC",
    poster: "/images/poster-ldc.png",
    minutes: 100,
    difficulty: 2,
    genres: ["액션", "SF", "이머시브", "재난"],
    cat: "s3",
    deposit: 120000,
  },
  {
    id: "time",
    name: "시간의 영속성",
    store: "s3",
    storeTag: "3호점 · TGC",
    poster: "/images/poster-time.jpg",
    minutes: 80,
    difficulty: 2,
    genres: ["SF", "추리"],
    murder: true,
    cat: "s3 murder",
    deposit: 63000,
  },
];

// 준비중(예약 불가) 테마
export const SOON_THEMES: Theme[] = [
  {
    id: "soon-blackwhite",
    name: "흑백사서 : ?",
    store: "s3",
    storeTag: "3호점 · TGC",
    poster: "",
    minutes: 0,
    difficulty: 0,
    genres: ["공포"],
    cat: "s3",
    soon: true,
    deposit: 0,
  },
  {
    id: "soon-unknown",
    name: "? ? ?",
    store: "s3",
    storeTag: "3호점 · TGC",
    poster: "",
    minutes: 0,
    difficulty: 0,
    genres: ["판타지", "아케이드"],
    cat: "s3",
    soon: true,
    deposit: 0,
  },
];

// 예약 가능한 시간대 (매장 운영시간 기준 — 전역 기본값. 매장별 설정이 없으면 이걸 사용)
export const TIME_SLOTS = [
  "10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00", "20:30", "22:00",
];

// 요일 라벨 (0=일 … 6=토)
export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 예약 시간대 설정(매장·테마 공용 구조).
//   default: 기본 시간대(모든 요일 공통)
//   byDow  : 특정 요일만 다르게. 키(0~6)가 있으면 default 대신 그 값을 사용.
//            빈 배열([]) = 그 요일은 휴무(예약칸 없음).
export type SlotSchedule = {
  default: string[];
  byDow: Record<string, string[]>;
};
export type StoreSlots = SlotSchedule; // (기존 이름 유지 — 매장별 설정에서 사용)

// 테마별·요일별 예약 시간대 — 기존 fantastrick.co.kr(Booked) 실제 운영 시간표를 그대로 옮긴 값.
// 테마마다 시작시각·간격이 전부 다르고(사자의 서 70분 간격 / 락다운시티 2시간 간격),
// 주말은 더 일찍 시작해 칸이 늘어난다. 2026-07-17~23 (7개 요일) 실측.
//   default = 평일 기준, byDow = 다른 요일만 덮어쓰기 (0=일 … 6=토)
export const THEME_SLOTS: Record<string, SlotSchedule> = {
  // 1호점 — 태초의 신부 (월~목 / 금 / 주말 3종)
  firstfoundbride: {
    default: ["12:00", "14:00", "15:20", "16:40", "18:00", "19:20", "21:20"], // 월·화·수·목
    byDow: {
      "5": ["12:00", "13:20", "14:40", "16:00", "17:20", "18:40", "20:00", "21:20"], // 금
      "6": ["10:00", "11:20", "12:40", "14:00", "15:20", "16:40", "18:00", "19:20", "20:40", "22:00"], // 토
      "0": ["10:00", "11:20", "12:40", "14:00", "15:20", "16:40", "18:00", "19:20", "20:40", "22:00"], // 일
    },
  },
  // 2호점 — 사자의 서 (70분 간격)
  bookofduat: {
    default: ["12:30", "13:40", "14:50", "16:00", "17:10", "18:20", "19:30", "20:40", "21:50"], // 월~금
    byDow: {
      "6": ["12:00", "13:10", "14:20", "15:30", "16:40", "17:50", "19:00", "20:10", "21:20"], // 토
      "0": ["12:00", "13:10", "14:20", "15:30", "16:40", "17:50", "19:00", "20:10", "21:20"], // 일
    },
  },
  // 3호점(TGC) — 락다운시티 (2시간 간격)
  ldc: {
    default: ["13:00", "15:00", "17:00", "19:00", "21:00"], // 월~금
    byDow: {
      "6": ["11:00", "13:00", "15:00", "17:00", "19:00", "21:00"], // 토
      "0": ["11:00", "13:00", "15:00", "17:00", "19:00", "21:00"], // 일
    },
  },
  // 3호점(TGC) — 시간의 영속성 (2시간 간격)
  time: {
    default: ["14:00", "16:00", "18:00", "20:00", "22:00"], // 월~금
    byDow: {
      "6": ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00"], // 토
      "0": ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00"], // 일
    },
  },
};

// 특정 매장·날짜에 실제 예약 가능한 시간대를 계산한다.
//   storeSlots 미설정 매장 → 전역 fallback(TIME_SLOTS) 사용 (기존 동작 유지)
//   설정된 매장 → 그 요일 override가 있으면 그것, 없으면 매장 default
export function slotsForStoreDate(
  storeSlots: Record<string, StoreSlots> | undefined,
  fallback: string[],
  storeId: string | undefined,
  date: string,
): string[] {
  const ss = storeId ? storeSlots?.[storeId] : undefined;
  if (!ss) return fallback;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!valid || isNaN(valid.getTime())) return ss.default;
  const dow = String(valid.getUTCDay());
  if (ss.byDow && Object.prototype.hasOwnProperty.call(ss.byDow, dow)) return ss.byDow[dow] || [];
  return ss.default;
}

// 시간 문자열(HH:MM) 정규화 검사
export function isSlotTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// 스케줄(default/byDow)에서 그 날짜의 시간대를 꺼낸다.
function pickFromSchedule(sch: SlotSchedule, date: string): string[] {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!d || isNaN(d.getTime())) return sch.default;
  const dow = String(d.getUTCDay());
  if (sch.byDow && Object.prototype.hasOwnProperty.call(sch.byDow, dow)) return sch.byDow[dow] || [];
  return sch.default;
}

// 특정 테마·날짜에 실제 예약 가능한 시간대를 계산한다. (우선순위: 테마 > 매장 > 전역)
//   테마마다 시간표가 완전히 다르므로(3호점은 한 매장에 시간표가 다른 테마 2개) 테마가 최우선.
//   테마 설정이 없으면 기존 매장별 설정 → 전역 fallback 순으로 내려간다(하위호환).
export function slotsForThemeDate(
  themeSlots: Record<string, SlotSchedule> | undefined,
  storeSlots: Record<string, StoreSlots> | undefined,
  fallback: string[],
  themeId: string | undefined,
  storeId: string | undefined,
  date: string,
): string[] {
  const ts = themeId ? themeSlots?.[themeId] : undefined;
  if (ts) return pickFromSchedule(ts, date);
  return slotsForStoreDate(storeSlots, fallback, storeId, date);
}

// 예약금 (1인 기준, 원) — 추후 매장/테마별로 조정 가능
export const DEPOSIT_PER_PERSON = 10000;

export function themeById(id: string): Theme | undefined {
  return [...THEMES, ...SOON_THEMES].find((t) => t.id === id);
}
