import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { makeAdminToken, ADMIN_COOKIE } from "@/lib/admin";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

// 타이밍 공격 방어: 길이 확인 후 상수시간 비교
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  // 레이트 리밋: IP당 5회/5분 (무차별 대입 방어) — 성공·실패 모두 카운트
  if (!rateLimit(`admin-login:${getClientIp(req)}`, 5, 5 * 60_000)) {
    return NextResponse.json({ error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    return NextResponse.json({ error: "관리자 비밀번호가 설정되지 않았습니다(ADMIN_PASSWORD)." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const input = String(body.password || "");
  if (!safeEqual(input, pw)) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const token = makeAdminToken()!;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // 로컬(http)에서도 동작하도록
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12시간
  });
  return res;
}
