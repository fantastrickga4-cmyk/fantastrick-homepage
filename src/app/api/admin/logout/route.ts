import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, sessionTokenOf } from "@/lib/admin";
import { getSupabase } from "@/lib/supabase";
import { destroySession } from "@/lib/admin-auth";

// 로그아웃 — 브라우저 쿠키만 지우면 그 값은 서버에서 계속 유효했다(2026-08-02 이전).
//   이제 **DB 의 세션 줄을 지운다.** 그 순간부터 그 쿠키는 무용지물이다.
export async function POST(req: NextRequest) {
  const token = sessionTokenOf(req);
  const db = getSupabase();
  if (db && token) await destroySession(db, token).catch(() => {});

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
