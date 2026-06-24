import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 특정 테마·날짜의 닫힌(예약불가) 시간 조회 — 예약 화면에서 사용
export async function GET(req: NextRequest) {
  const db = getSupabase();
  if (!db) return NextResponse.json({ blocked: [], dayClosed: false });

  const theme = req.nextUrl.searchParams.get("theme") || "";
  const date = req.nextUrl.searchParams.get("date") || "";
  if (!date) return NextResponse.json({ blocked: [], dayClosed: false });

  // 그 날짜의 차단 슬롯 (테마 일치 또는 테마 무관 전체 차단)
  const { data } = await db
    .from("blocked_slots")
    .select("theme_id, time")
    .eq("date", date);

  const rows = (data || []).filter((b: { theme_id: string | null }) => !b.theme_id || b.theme_id === theme);
  const dayClosed = rows.some((b: { time: string | null }) => !b.time);
  const blocked = rows.filter((b: { time: string | null }) => b.time).map((b: { time: string }) => b.time);

  // 이미 예약된 시간도 불가 처리
  const { data: taken } = await db
    .from("reservations")
    .select("time")
    .eq("theme_id", theme)
    .eq("date", date)
    .neq("status", "cancelled");
  const takenTimes = (taken || []).map((t: { time: string }) => t.time);

  return NextResponse.json({ dayClosed, blocked: Array.from(new Set([...blocked, ...takenTimes])) });
}
