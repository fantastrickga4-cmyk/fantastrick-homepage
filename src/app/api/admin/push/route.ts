import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { pushConfigured, pushToAdmins } from "@/lib/push";

// 이 폰이 알림을 받고 있는지 + 등록된 기기 수
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  const { data, error } = await db.from("push_subscriptions").select("id, label, created_at, last_ok_at");
  if (error) {
    return NextResponse.json({ error: "알림 표가 아직 없습니다. supabase/migration_push_APPLY_ME.sql 을 먼저 적용해 주세요." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ready: pushConfigured(), devices: data || [] });
}

// 이 폰 등록 (구독)
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  if (!pushConfigured()) return NextResponse.json({ error: "알림 키(VAPID)가 아직 없어요." }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  // 테스트 발송 (등록된 기기에 지금 한 번 쏴본다)
  if (body.test) {
    const r = await pushToAdmins({ title: "🔔 알림 테스트", body: "이렇게 새 예약을 알려드릴게요.", url: "/admin" });
    if (r.sent === 0) return NextResponse.json({ error: "알림을 받을 기기가 없어요. 먼저 이 폰을 등록해 주세요." }, { status: 400 });
    return NextResponse.json({ ok: true, sent: r.sent });
  }

  const sub = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const label = String(body.label || "").trim().slice(0, 40) || "기기";
  // endpoint 가 unique — 같은 폰에서 다시 눌러도 중복 안 생김
  const { error } = await db.from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "등록 중 오류: " + error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 이 폰 해제
export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  const id = req.nextUrl.searchParams.get("id");
  if (!endpoint && !id) return NextResponse.json({ error: "해제할 기기를 지정해 주세요." }, { status: 400 });
  const q = db.from("push_subscriptions").delete();
  const { error } = endpoint ? await q.eq("endpoint", endpoint) : await q.eq("id", id!);
  if (error) return NextResponse.json({ error: "해제 실패" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
