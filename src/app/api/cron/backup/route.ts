import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { buildBackup, kstStamp } from "@/lib/backup";

// 자동 백업 — 매주 1회 Vercel Cron 이 호출(vercel.json). 관리자도 "지금 실행" 으로 수동 호출 가능.
//   전체 데이터를 JSON 으로 만들어 Supabase Storage 비공개 버킷 'backups' 에 올리고, 최근 KEEP 개만 남긴다.
export const dynamic = "force-dynamic";
const BUCKET = "backups";
const KEEP = 12; // 최근 12개(≈3개월치) 보관

// Vercel Cron 은 Authorization: Bearer ${CRON_SECRET} 를 붙여 호출한다. 관리자 세션도 허용(수동 실행).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return isAdmin(req);
}

async function runBackup(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "DB가 설정되지 않았습니다." }, { status: 503 });

  // 버킷 보장(없으면 비공개로 생성)
  const { data: bucket } = await db.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error } = await db.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      return NextResponse.json({ error: "버킷 생성 실패: " + error.message }, { status: 500 });
    }
  }

  // 백업 만들어 업로드
  const dump = await buildBackup(db);
  const filename = `backup_${kstStamp()}.json`;
  const body = Buffer.from(JSON.stringify(dump, null, 2), "utf-8");
  const { error: upErr } = await db.storage.from(BUCKET).upload(filename, body, {
    contentType: "application/json; charset=utf-8",
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: "업로드 실패: " + upErr.message }, { status: 500 });

  // 오래된 백업 정리 (이름=타임스탬프라 내림차순 = 최신순, 앞 KEEP 개만 남김)
  let pruned = 0;
  const { data: files } = await db.storage.from(BUCKET).list("", { limit: 200, sortBy: { column: "name", order: "desc" } });
  if (files && files.length > KEEP) {
    const old = files.slice(KEEP).map((f) => f.name);
    if (old.length) { await db.storage.from(BUCKET).remove(old); pruned = old.length; }
  }
  return NextResponse.json({ ok: true, file: filename, total: Math.min(files?.length ?? 1, KEEP), pruned });
}

// Vercel Cron 은 GET 으로 호출한다. 관리자 "지금 실행" 도 POST/GET 둘 다 받게.
export async function GET(req: NextRequest) { return runBackup(req); }
export async function POST(req: NextRequest) { return runBackup(req); }
