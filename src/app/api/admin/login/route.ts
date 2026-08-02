import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ADMIN_COOKIE } from "@/lib/admin";
import { getClientIp } from "@/lib/ratelimit";
import { getSupabase } from "@/lib/supabase";
import {
  isLoginLocked, noteLoginFail, clearLoginFails, createSession,
  LOCKED_MESSAGE, SESSION_HOURS,
} from "@/lib/admin-auth";

// 타이밍 공격 방어: 길이 확인 후 상수시간 비교
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  // 🔒 무차별 대입 방어 — **DB 에 센다.**
  //   전에는 서버 메모리에 셌는데, Cloudflare 가 요청마다 다른 인스턴스로 보내고 수시로
  //   재시작해서 숫자가 쌓이질 않았다(7번 연속 실패해도 안 막히는 것을 실측).
  const ip = getClientIp(req);
  const db = getSupabase();
  if (db && (await isLoginLocked(db, ip).catch(() => false))) {
    return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 429 });
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
  // 아이디 없이 비밀번호만으로 로그인 (2026-07-25 사장님 요청). 상수시간 비교로 타이밍 공격 방어.
  const inputPw = String(body.password || "");
  const pwOk = safeEqual(inputPw, pw);
  if (!pwOk) {
    if (db) await noteLoginFail(db, ip).catch(() => {});
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  // 맞았으면 실패 기록을 지우고, **이번 로그인만의 무작위 열쇠**를 만든다.
  //   전에는 쿠키값이 비밀번호로 만든 고정값이라 로그아웃도 만료도 서버에선 없는 것이나 같았다.
  if (!db) return NextResponse.json({ error: "DB가 설정되지 않았습니다." }, { status: 503 });
  await clearLoginFails(db, ip).catch(() => {});
  const token = await createSession(db, ip, req.headers.get("user-agent") || "");
  if (!token) return NextResponse.json({ error: "로그인 처리에 실패했습니다. 다시 시도해 주세요." }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // 로컬(http)에서도 동작하도록
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * SESSION_HOURS, // 서버(admin_sessions)의 만료와 같은 값
  });
  return res;
}
