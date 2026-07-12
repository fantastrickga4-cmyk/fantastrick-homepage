import { getSupabase } from "./supabase";
import { DEPOSIT_PER_PERSON, TIME_SLOTS } from "./data";

// 앱 설정 (예약금·시간대·노출테마) — DB 값이 있으면 그걸, 없으면 코드 기본값
export type AppConfig = {
  depositPerPerson: number;
  timeSlots: string[];
  disabledThemes: string[]; // 예약 화면에서 숨길 테마 id 목록
  naverUrl: string;         // 네이버 플레이스 리뷰 URL (없으면 빈값)
  googleUrl: string;        // 구글 리뷰 URL (없으면 빈값)
  extRating: number;        // 외부 표시 평점 (0이면 미노출)
  extCount: number;         // 외부 리뷰 수 (0이면 미노출)
};

export const DEFAULT_CONFIG: AppConfig = {
  depositPerPerson: DEPOSIT_PER_PERSON,
  timeSlots: TIME_SLOTS,
  disabledThemes: [],
  naverUrl: "",
  googleUrl: "",
  extRating: 0,
  extCount: 0,
};

export async function getConfig(): Promise<AppConfig> {
  const db = getSupabase();
  if (!db) return DEFAULT_CONFIG;
  const { data } = await db.from("app_settings").select("key, value");
  const map = new Map((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const dep = Number(map.get("deposit_per_person"));
  const slots = map.get("time_slots");
  const disabled = map.get("disabled_themes");
  const rating = Number(map.get("ext_rating"));
  const count = Number(map.get("ext_count"));
  return {
    depositPerPerson: Number.isFinite(dep) && dep > 0 ? dep : DEFAULT_CONFIG.depositPerPerson,
    timeSlots: Array.isArray(slots) && slots.length ? (slots as string[]) : DEFAULT_CONFIG.timeSlots,
    disabledThemes: Array.isArray(disabled) ? (disabled as string[]) : [],
    naverUrl: typeof map.get("naver_url") === "string" ? (map.get("naver_url") as string) : "",
    googleUrl: typeof map.get("google_url") === "string" ? (map.get("google_url") as string) : "",
    extRating: Number.isFinite(rating) && rating > 0 ? rating : 0,
    extCount: Number.isFinite(count) && count > 0 ? count : 0,
  };
}
