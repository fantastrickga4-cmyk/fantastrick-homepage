import crypto from "crypto";
import { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isSessionValid } from "@/lib/admin-auth";

/**
 * 관리자 인증.
 *
 * [2026-08-02 구조 변경 — 왜 바꿨나]
 *  전에는 쿠키값 = HMAC(ADMIN_PASSWORD) 라는 **고정값**이었고 서버는 그 값만 비교했다. 그래서
 *   · 12시간 만료가 브라우저 쪽 약속일 뿐이었고(서버는 아무 때나 통과시킴),
 *   · [로그아웃]을 눌러도 그 쿠키는 계속 유효했으며,
 *   · 쿠키가 한 번 새면 비밀번호를 바꾸기 전까지 영원히 관리자였다.
 *  → 이제 로그인할 때마다 **무작위 열쇠**를 만들어 DB(admin_sessions)에 적는다.
 *    로그아웃 = 그 줄 삭제, 만료 = 서버가 거부.
 */

/**
 * 서버 안에서 서버를 부를 때 쓰는 열쇠 (브라우저로 절대 나가지 않는다).
 *
 * 입금 웹훅이 "사장님이 [입금 확인] 누른 것과 똑같이" 관리자 PATCH 를 호출하는데,
 * 그때 사람의 로그인 세션이 있을 리 없다. 그 한 경우를 위해 남겨둔 값이다.
 * ⚠️ **쿠키로는 안 받는다** — 헤더(x-internal-admin)로만 인정한다.
 */
export function makeAdminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHmac("sha256", pw).update("ftk-admin-session-v1").digest("hex");
}

export const ADMIN_COOKIE = "ftk_admin";
export const INTERNAL_HEADER = "x-internal-admin";

/** 요청에 담긴 세션 열쇠 (없으면 빈 문자열) */
export function sessionTokenOf(req: NextRequest): string {
  return req.cookies.get(ADMIN_COOKIE)?.value || "";
}

/** 요청이 로그인된 관리자인지 확인 — DB 에 살아있는 세션이어야 한다. */
export async function isAdmin(req: NextRequest): Promise<boolean> {
  // ① 서버→서버 내부 호출 (입금 웹훅 → 관리자 PATCH)
  const internal = req.headers.get(INTERNAL_HEADER);
  if (internal) {
    const key = makeAdminToken();
    if (key && internal === key) return true;
  }
  // ② 사람의 로그인 세션
  const token = sessionTokenOf(req);
  if (!token) return false;
  const db = getSupabase();
  if (!db) return false;
  return isSessionValid(db, token);
}
