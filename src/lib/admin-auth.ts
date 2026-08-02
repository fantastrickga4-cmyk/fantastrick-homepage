import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관리자 로그인 보호 — 실패 횟수 잠금 + 진짜로 만료되는 세션.
 *
 * [전에는 왜 안 됐나]
 *  · 실패 횟수를 **서버 메모리**에 셌다. Cloudflare 는 요청마다 다른 인스턴스로 보내고
 *    수시로 재시작해서 숫자가 쌓이질 않는다 → 비밀번호를 몇 번이든 찍어볼 수 있었다(실측).
 *  · 세션 쿠키가 **비밀번호로 만든 고정값**이라 값 비교만 했다. 서버가 만료를 모르니
 *    12시간은 브라우저 쪽 약속일 뿐이고, 로그아웃해도 그 쿠키는 계속 유효했다.
 *
 * [지금]
 *  · 실패는 DB 에 센다. {@link MAX_FAILS}회면 {@link LOCK_MINUTES}분 잠금(시간 지나면 저절로 풀림).
 *  · 로그인할 때마다 **무작위 열쇠**를 만들어 DB 에 적고 만료시각을 함께 둔다.
 *    로그아웃 = 그 줄 삭제. 만료 = 서버가 거부. 비밀번호를 바꾸면 전부 지울 수도 있다.
 *
 * ⚠️ 사장님이 스스로 잠기면 안 되므로 **영구 잠금은 두지 않는다.** 시간이 지나면 풀린다.
 */

export const MAX_FAILS = 5;
export const LOCK_MINUTES = 10;
export const SESSION_HOURS = 12;

export const LOCKED_MESSAGE =
  `비밀번호를 ${MAX_FAILS}번 틀렸습니다. ${LOCK_MINUTES}분 뒤에 다시 시도해 주세요.`;

/** 지금 이 IP 가 잠겨 있나? (표가 없거나 오류면 막지 않는다 — 사장님이 못 들어가면 더 큰일) */
export async function isLoginLocked(db: SupabaseClient, ip: string): Promise<boolean> {
  const { data, error } = await db
    .from("admin_login_attempts").select("fails, last_fail_at").eq("ip", ip).maybeSingle();
  if (error || !data) return false;
  if ((data.fails ?? 0) < MAX_FAILS) return false;
  const ageMs = Date.now() - new Date(data.last_fail_at as string).getTime();
  return ageMs < LOCK_MINUTES * 60_000;
}

/** 실패 1회 기록. 잠금 시간이 지난 기록은 1부터 다시 센다. */
export async function noteLoginFail(db: SupabaseClient, ip: string): Promise<void> {
  const { data } = await db
    .from("admin_login_attempts").select("fails, last_fail_at").eq("ip", ip).maybeSingle();
  const stale = data
    ? Date.now() - new Date(data.last_fail_at as string).getTime() >= LOCK_MINUTES * 60_000
    : true;
  const fails = stale ? 1 : (data?.fails ?? 0) + 1;
  await db.from("admin_login_attempts")
    .upsert({ ip, fails, last_fail_at: new Date().toISOString() }, { onConflict: "ip" });
}

/** 비밀번호가 맞았으면 실패 기록을 지운다. */
export async function clearLoginFails(db: SupabaseClient, ip: string): Promise<void> {
  await db.from("admin_login_attempts").delete().eq("ip", ip);
}

/** 새 세션 발급 — 무작위 열쇠를 만들어 DB 에 적고 그 값을 돌려준다(쿠키에 담을 값). */
export async function createSession(
  db: SupabaseClient, ip: string, userAgent: string,
): Promise<string | null> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
  const { error } = await db.from("admin_sessions").insert({
    token, expires_at: expires, ip, user_agent: userAgent.slice(0, 200),
  });
  if (error) return null;
  // 만료된 줄은 가끔 치운다(쌓아둘 이유가 없다). 실패해도 로그인은 진행.
  if (Math.random() < 0.1) {
    await db.from("admin_sessions").delete().lt("expires_at", new Date().toISOString());
  }
  return token;
}

/** 이 열쇠가 아직 살아있나? */
export async function isSessionValid(db: SupabaseClient, token: string): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await db
    .from("admin_sessions").select("expires_at").eq("token", token).maybeSingle();
  if (error || !data) return false;
  return new Date(data.expires_at as string).getTime() > Date.now();
}

/** 로그아웃 — 그 열쇠를 지운다. 이 순간부터 그 쿠키는 무용지물. */
export async function destroySession(db: SupabaseClient, token: string): Promise<void> {
  if (!token) return;
  await db.from("admin_sessions").delete().eq("token", token);
}

/** 모든 기기에서 로그아웃 (비밀번호를 바꿨거나 찜찜할 때) */
export async function destroyAllSessions(db: SupabaseClient): Promise<void> {
  await db.from("admin_sessions").delete().neq("token", "");
}
