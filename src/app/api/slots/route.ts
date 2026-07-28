import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sweepExpiredReservations } from "@/lib/expire";

// 특정 테마·날짜의 닫힌(예약불가) 시간 조회 — 예약 화면에서 사용
export async function GET(req: NextRequest) {
  const db = getSupabase();
  if (!db) return NextResponse.json({ blocked: [], dayClosed: false });

  // 만료 예약(30분 미입금) 자동 정리 — 실패해도 조회는 진행
  await sweepExpiredReservations(db).catch(() => {});

  // 전체 미리불러오기 모드(?all=1) — 예약 화면이 열릴 때 앞으로의 모든 날짜·테마의
  // 차단/예약 시간을 한 번에 받아, 손님이 테마·날짜를 고를 때마다 다시 물어보지 않게 한다.
  if (req.nextUrl.searchParams.get("all")) {
    // 어제(KST)부터 — 오늘 지난 시간대는 화면이 알아서 걸러내므로 넉넉히 포함해도 무방.
    const from = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
    const [{ data: bs }, { data: rv }] = await Promise.all([
      db.from("blocked_slots").select("theme_id, date, time").gte("date", from),
      db.from("reservations").select("theme_id, date, time").gte("date", from).neq("status", "cancelled"),
    ]);
    return NextResponse.json({ all: true, blockedSlots: bs || [], reservations: rv || [] });
  }

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
