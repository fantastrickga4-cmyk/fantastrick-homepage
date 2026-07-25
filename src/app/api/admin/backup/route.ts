import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { buildBackup, kstStamp } from "@/lib/backup";

// 통짜 백업(수동 다운로드) — 예약·리뷰·설정·문자문구·휴무를 파일 하나로.
//   자동 백업은 /api/cron/backup 이 같은 로직(buildBackup)으로 매주 Supabase Storage 에 올린다.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const dump = await buildBackup(db);
  const stamp = kstStamp();
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fantastrick_backup_${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
