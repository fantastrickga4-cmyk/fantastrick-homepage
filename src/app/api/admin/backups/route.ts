import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// 자동 백업(Storage 'backups' 버킷)에 쌓인 파일 목록 + 다운로드 서명 URL.
export const dynamic = "force-dynamic";
const BUCKET = "backups";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "DB가 설정되지 않았습니다." }, { status: 503 });

  const { data: files, error } = await db.storage.from(BUCKET)
    .list("", { limit: 50, sortBy: { column: "name", order: "desc" } });
  // 버킷이 아직 없으면(자동백업 첫 실행 전) 빈 목록으로
  if (error) return NextResponse.json({ backups: [] });

  const list = (files || []).filter((f) => f.name.endsWith(".json"));
  const backups = await Promise.all(list.map(async (f) => {
    const { data } = await db.storage.from(BUCKET).createSignedUrl(f.name, 60 * 30); // 30분 유효
    return {
      name: f.name,
      size: f.metadata?.size ?? null,
      created_at: f.created_at ?? f.updated_at ?? null,
      url: data?.signedUrl ?? null,
    };
  }));
  return NextResponse.json({ backups });
}
