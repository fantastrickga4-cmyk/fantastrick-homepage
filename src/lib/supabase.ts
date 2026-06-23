import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서버 전용 Supabase 클라이언트 (Service Role 키 사용 — API 라우트에서만 호출)
// 환경변수가 아직 없으면 null 을 돌려주고, 호출부에서 "DB 미설정" 안내를 보여준다.
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export const DB_NOT_CONFIGURED = {
  error:
    "예약 데이터베이스(Supabase)가 아직 연결되지 않았습니다. 관리자에게 문의해 주세요.",
};
