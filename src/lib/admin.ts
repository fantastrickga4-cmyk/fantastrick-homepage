import crypto from "crypto";
import { NextRequest } from "next/server";

// 관리자 세션 토큰: ADMIN_PASSWORD 로 HMAC 생성 (쿠키에 원문 비번을 넣지 않기 위함)
export function makeAdminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHmac("sha256", pw).update("ftk-admin-session-v1").digest("hex");
}

export const ADMIN_COOKIE = "ftk_admin";

// 요청이 로그인된 관리자인지 확인
export function isAdmin(req: NextRequest): boolean {
  const token = makeAdminToken();
  if (!token) return false;
  const c = req.cookies.get(ADMIN_COOKIE)?.value;
  return !!c && c === token;
}
