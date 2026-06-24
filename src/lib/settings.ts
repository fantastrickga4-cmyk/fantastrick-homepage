import { getSupabase } from "./supabase";
import { DEPOSIT_PER_PERSON, TIME_SLOTS } from "./data";

// 앱 설정 (예약금·시간대·노출테마) — DB 값이 있으면 그걸, 없으면 코드 기본값
export type AppConfig = {
  depositPerPerson: number;
  timeSlots: string[];
  disabledThemes: string[]; // 예약 화면에서 숨길 테마 id 목록
};

export const DEFAULT_CONFIG: AppConfig = {
  depositPerPerson: DEPOSIT_PER_PERSON,
  timeSlots: TIME_SLOTS,
  disabledThemes: [],
};

export async function getConfig(): Promise<AppConfig> {
  const db = getSupabase();
  if (!db) return DEFAULT_CONFIG;
  const { data } = await db.from("app_settings").select("key, value");
  const map = new Map((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const dep = Number(map.get("deposit_per_person"));
  const slots = map.get("time_slots");
  const disabled = map.get("disabled_themes");
  return {
    depositPerPerson: Number.isFinite(dep) && dep > 0 ? dep : DEFAULT_CONFIG.depositPerPerson,
    timeSlots: Array.isArray(slots) && slots.length ? (slots as string[]) : DEFAULT_CONFIG.timeSlots,
    disabledThemes: Array.isArray(disabled) ? (disabled as string[]) : [],
  };
}
