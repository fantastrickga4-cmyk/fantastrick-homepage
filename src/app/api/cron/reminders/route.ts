import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendReservationSms } from "@/lib/sms";

// 방문 전날 리마인더 자동 발송 (Vercel Cron 이 매일 호출)
//
// 🔴 보안: CRON_SECRET 만 믿는다.
//    전에는 `x-vercel-cron: 1` 헤더가 있으면 통과시켰는데, **Vercel 은 외부에서 들어온
//    이 헤더를 지우지 않는다** → 아무나 헤더 한 줄만 붙이면 크론을 실행할 수 있었다.
//    (2026-07-17 RPA 점검에서 실제로 우회 성공: curl -H "x-vercel-cron: 1" → 200)
//    지금은 전화번호가 전부 테스트 대역이라 문자가 안 나갔지만, 알리고 키를 넣고 실번호가
//    들어오는 순간 "아무나 누를 수 있는 문자 발송 버튼"이 된다(스팸·문자요금).
//    Vercel Cron 은 CRON_SECRET 환경변수가 있으면 Authorization: Bearer 를 자동으로 붙여준다.
//    → 이 분기를 지워도 크론은 정상 동작한다(2026-07-17 프로덕션에서 실제 확인).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // 비밀키가 아예 없으면(설정 실수) 열어두지 말고 막는다 — 문자를 보내는 엔드포인트다.
  if (!secret) return NextResponse.json({ error: "CRON_SECRET 미설정" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "DB 미설정" }, { status: 503 });

  // 내일(KST) 날짜
  const tomorrow = new Date(Date.now() + (9 + 24) * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("reservations")
    .select("name, phone, theme_name, date, time, people")
    .eq("date", tomorrow)
    .eq("status", "confirmed");
  if (error) return NextResponse.json({ error: "조회 오류" }, { status: 500 });

  let sent = 0;
  for (const r of data || []) {
    const res = await sendReservationSms("reminder", r);
    if (res.ok) sent++;
  }
  return NextResponse.json({ ok: true, date: tomorrow, total: (data || []).length, sent });
}
