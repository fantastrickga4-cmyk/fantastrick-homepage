import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendReservationSms } from "@/lib/sms";

// 방문 전날 리마인더 자동 발송 (Vercel Cron 이 매일 호출)
// 보안: CRON_SECRET 헤더(Authorization: Bearer) 또는 Vercel cron 요청만 허용
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
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
