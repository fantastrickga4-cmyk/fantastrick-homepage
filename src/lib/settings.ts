import { getSupabase } from "./supabase";
import { DEPOSIT_PER_PERSON, TIME_SLOTS, THEME_SLOTS, type StoreSlots, type SlotSchedule } from "./data";

// 팝업 공지 (기존 사이트 modal-window 이식)
//   기존 동작: 페이지 열자마자 표시 · 모든 페이지 · 쿠키 1일("하루 안 보기")
//   · 닫기 버튼(우측상단) + 바깥클릭 + ESC · 폭 500px · 오버레이 검정 70%
export type Notice = {
  enabled: boolean;
  title: string;
  body: string;      // 줄바꿈 그대로 표시 (HTML 아님 — 안전)
  imageUrl: string;  // 선택 — 기존 팝업은 이미지 한 장이었음
  linkUrl: string;   // 선택 — 이미지/버튼 클릭 시 이동
  until: string;     // 선택 "YYYY-MM-DD" — 이 날짜까지만 표시 (빈값=계속)
  hideDays: number;  // "N일 동안 안 보기" (기존 쿠키 1일과 동일하게 기본 1)
  updatedAt: string; // 내용이 바뀌면 "안 보기"를 초기화해 다시 보이게 하는 용도
};

export const DEFAULT_NOTICE: Notice = {
  enabled: false, title: "", body: "", imageUrl: "", linkUrl: "", until: "", hideDays: 1, updatedAt: "",
};

// 앱 설정 (예약금·시간대·팝업공지) — DB 값이 있으면 그걸, 없으면 코드 기본값
// 2026-07-15 제거: disabledThemes(예약 받을 테마)·naverUrl/googleUrl/extRating/extCount(외부 노출)
//   — 전부 안 쓰던 기능이라 사장님 요청으로 삭제. 되살리려면 이 커밋 이전을 참고.
export type AppConfig = {
  depositPerPerson: number;
  timeSlots: string[];      // 전역 기본 시간대 (매장·테마 설정 없을 때 fallback)
  themeSlots: Record<string, SlotSchedule>; // 테마별 요일별 시간대 (최우선)
  storeSlots: Record<string, StoreSlots>; // 매장별 요일별 시간대 (테마 설정 없을 때)
  notice: Notice;           // 팝업 공지
  minLeadMinutes: number;   // 예약 임박 차단 — 시작 N분 전부터는 손님이 예약 못 함 (0=제한없음)
};

export const DEFAULT_CONFIG: AppConfig = {
  depositPerPerson: DEPOSIT_PER_PERSON,
  timeSlots: TIME_SLOTS,
  themeSlots: THEME_SLOTS,
  storeSlots: {},
  notice: DEFAULT_NOTICE,
  minLeadMinutes: 10, // 사장님 지정(2026-07-15): 시작 10분 전부터는 예약 불가
};

export async function getConfig(): Promise<AppConfig> {
  const db = getSupabase();
  if (!db) return DEFAULT_CONFIG;
  const { data } = await db.from("app_settings").select("key, value");
  const map = new Map((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const dep = Number(map.get("deposit_per_person"));
  const slots = map.get("time_slots");
  const thSlots = map.get("theme_slots");
  const stSlots = map.get("store_slots");
  const lead = Number(map.get("min_lead_minutes"));
  const rawNotice = map.get("notice");
  const notice: Notice =
    rawNotice && typeof rawNotice === "object" && !Array.isArray(rawNotice)
      ? { ...DEFAULT_NOTICE, ...(rawNotice as Partial<Notice>) }
      : DEFAULT_NOTICE;
  return {
    depositPerPerson: Number.isFinite(dep) && dep > 0 ? dep : DEFAULT_CONFIG.depositPerPerson,
    timeSlots: Array.isArray(slots) && slots.length ? (slots as string[]) : DEFAULT_CONFIG.timeSlots,
    // 테마 시간표는 DB에 저장된 게 있으면 그것, 없으면 코드에 심어둔 실제 운영 시간표
    themeSlots: thSlots && typeof thSlots === "object" && !Array.isArray(thSlots) ? (thSlots as Record<string, SlotSchedule>) : DEFAULT_CONFIG.themeSlots,
    storeSlots: stSlots && typeof stSlots === "object" && !Array.isArray(stSlots) ? (stSlots as Record<string, StoreSlots>) : {},
    notice,
    // 0 도 유효한 값(제한없음)이라 isFinite 로만 판정
    minLeadMinutes: Number.isFinite(lead) && lead >= 0 ? lead : DEFAULT_CONFIG.minLeadMinutes,
  };
}
