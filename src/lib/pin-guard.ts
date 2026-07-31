import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 예약 조회 비밀번호(4자리) 무차별 대입 방어.
 *
 * [왜]
 *  조회·취소는 전화번호 + 이름 + 4자리로 한다. 4자리는 1만 가지뿐이라, 전화번호를 아는 사람이
 *  계속 찍으면 언젠가 열린다. 기존 방어는 "IP당 분당 20회"뿐이라 하루면 1만 개를 다 시도할 수 있었다.
 *  → **전화번호 기준으로 실패를 세서 {@link MAX_FAILS}번이면 잠근다.**
 *
 * [왜 메모리가 아니라 DB 인가]
 *  Cloudflare Workers 는 요청마다 다른 인스턴스가 처리할 수 있고 수시로 재시작된다.
 *  메모리에 세면 나눠 때리거나 재시작을 기다리는 것만으로 초기화된다. 돈이 걸린 문이라 DB 에 센다.
 *
 * [열리는 조건]
 *  · 비밀번호가 맞으면 즉시 카운터 삭제
 *  · 마지막 실패로부터 {@link WINDOW_HOURS}시간이 지나면 없던 일이 된다(손님이 다음날 재시도 가능)
 *  · 매장 문의 → 관리자 [비밀번호 재설정] 이 카운터를 지운다
 *
 * ⚠️ **막다가 손님을 막으면 안 된다.** 표가 아직 없거나 DB 가 흔들리면 이 방어는 조용히
 *    비켜선다(fail-open). 잠그는 쪽으로 실패하면 멀쩡한 손님이 예약을 못 보게 된다.
 */

export const MAX_FAILS = 30;
export const WINDOW_HOURS = 24;

export const LOCKED_MESSAGE =
  `비밀번호를 ${MAX_FAILS}번 넘게 잘못 입력해서 조회를 잠갔어요. 매장으로 문의해 주세요.`;

/** 잠겨 있나? (표가 없거나 오류면 false — 손님을 막지 않는다) */
export async function isLookupLocked(db: SupabaseClient, phone: string): Promise<boolean> {
  const { data, error } = await db
    .from("lookup_attempts")
    .select("fails, last_fail_at")
    .eq("phone", phone)
    .maybeSingle();
  if (error || !data) return false;
  if ((data.fails ?? 0) < MAX_FAILS) return false;
  // 마지막 실패가 오래됐으면 풀린 것으로 본다
  const ageMs = Date.now() - new Date(data.last_fail_at as string).getTime();
  return ageMs < WINDOW_HOURS * 3600 * 1000;
}

/** 실패 1회 기록. 창(WINDOW_HOURS)을 넘긴 기록은 1부터 다시 센다. */
export async function noteLookupFail(db: SupabaseClient, phone: string): Promise<void> {
  const { data } = await db
    .from("lookup_attempts")
    .select("fails, last_fail_at")
    .eq("phone", phone)
    .maybeSingle();

  const now = new Date().toISOString();
  const stale = data
    ? Date.now() - new Date(data.last_fail_at as string).getTime() >= WINDOW_HOURS * 3600 * 1000
    : true;
  const fails = stale ? 1 : (data?.fails ?? 0) + 1;

  await db.from("lookup_attempts").upsert({ phone, fails, last_fail_at: now }, { onConflict: "phone" });
}

/** 카운터 삭제 — 비밀번호가 맞았거나, 관리자가 비밀번호를 재설정했을 때. */
export async function clearLookupFails(db: SupabaseClient, phone: string): Promise<void> {
  await db.from("lookup_attempts").delete().eq("phone", phone);
}
