import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { sanitizeText } from "@/lib/util";
import { themeById } from "@/lib/data";

const COLS = "id, theme_id, theme_name, name, phone, rating, body, source, status, created_at";

// 리뷰 목록 (관리자) — ?status=pending|approved|all (기본 pending)
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const status = req.nextUrl.searchParams.get("status") || "pending";
  let q = db.from("reviews").select(COLS).order("created_at", { ascending: false }).limit(300);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "리뷰 조회 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true, reviews: data || [] });
}

// 리뷰 모더레이션 / 외부 후기 수동 등록 / 삭제
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }); }

  const action = String(body.action || "");

  // 상태 변경 (승인/거부/게시취소)
  if (action === "moderate") {
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id) return NextResponse.json({ error: "대상 후기를 찾을 수 없습니다." }, { status: 400 });
    if (!["approved", "rejected", "pending"].includes(status)) {
      return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
    }
    const { error } = await db.from("reviews").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ error: "상태 변경 중 오류가 발생했습니다." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // 외부 후기 수동 등록 (예약이력 검증 없음 — 관리자 우회, 즉시 게시)
  if (action === "add") {
    const themeId = String(body.themeId || "");
    const name = sanitizeText(String(body.name || ""));
    const rating = Number(body.rating || 0);
    const text = sanitizeText(String(body.body || ""));
    const source = sanitizeText(String(body.source || "")) || "외부";

    const theme = themeById(themeId);
    if (!theme) return NextResponse.json({ error: "테마를 선택해 주세요." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "이름(닉네임)을 입력해 주세요." }, { status: 400 });
    if (name.length > 40) return NextResponse.json({ error: "이름이 너무 깁니다." }, { status: 400 });
    if (source.length > 20) return NextResponse.json({ error: "출처가 너무 깁니다." }, { status: 400 });
    if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ error: "별점을 선택해 주세요." }, { status: 400 });
    if (text.length < 5) return NextResponse.json({ error: "후기를 5자 이상 입력해 주세요." }, { status: 400 });
    if (text.length > 1000) return NextResponse.json({ error: "후기는 1000자 이내로 입력해 주세요." }, { status: 400 });

    const { error } = await db.from("reviews").insert({
      theme_id: theme.id,
      theme_name: theme.name,
      name,
      phone: "", // 외부 후기는 전화번호 없음
      rating,
      body: text,
      status: "approved", // 관리자 등록은 즉시 게시
      source,
    });
    if (error) return NextResponse.json({ error: "후기 등록 중 오류가 발생했습니다." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // 삭제
  if (action === "delete") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "대상 후기를 찾을 수 없습니다." }, { status: 400 });
    const { error } = await db.from("reviews").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
}
