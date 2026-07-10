import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone, sanitizeText, maskPhone } from "@/lib/util";
import { themeById } from "@/lib/data";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

type ReviewRow = { phone: string | null; [k: string]: unknown };

// 리뷰 목록 조회 (전체 또는 테마별)
export async function GET(req: NextRequest) {
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const theme = req.nextUrl.searchParams.get("theme");
  let q = db
    .from("reviews")
    .select("id, theme_id, theme_name, name, phone, rating, body, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (theme && theme !== "all") q = q.eq("theme_id", theme);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "리뷰 조회 중 오류가 발생했습니다." }, { status: 500 });
  // 개인정보 노출 차단: 전화번호는 서버에서 마스킹해서 내보낸다
  const reviews = (data as ReviewRow[] | null || []).map((r) => ({
    ...r,
    phone: r.phone ? maskPhone(r.phone) : "",
  }));
  return NextResponse.json({ ok: true, reviews });
}

// 리뷰 작성 (해당 전화번호로 예약 이력이 있어야 작성 가능)
export async function POST(req: NextRequest) {
  // 레이트 리밋: IP당 5회/분
  if (!rateLimit(`review-post:${getClientIp(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const themeId = String(body.themeId || "");
  const name = sanitizeText(String(body.name || ""));
  const phone = normalizePhone(String(body.phone || ""));
  const rating = Number(body.rating || 0);
  const text = sanitizeText(String(body.body || ""));

  const theme = themeById(themeId);
  if (!theme) return NextResponse.json({ error: "테마를 선택해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "이름(닉네임)을 입력해 주세요." }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "이름이 너무 깁니다." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });
  if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ error: "별점을 선택해 주세요." }, { status: 400 });
  if (text.length < 5) return NextResponse.json({ error: "후기를 5자 이상 입력해 주세요." }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "후기는 1000자 이내로 입력해 주세요." }, { status: 400 });

  // 예약 이력 확인 (해당 전화번호로 그 테마를 예약한 적이 있는지)
  const { count } = await db
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .eq("theme_id", themeId);

  if (!count || count < 1) {
    return NextResponse.json(
      { error: "해당 전화번호로 이 테마를 예약한 기록이 있어야 후기를 남길 수 있어요." },
      { status: 403 }
    );
  }

  const { error } = await db.from("reviews").insert({
    theme_id: theme.id,
    theme_name: theme.name,
    name,
    phone,
    rating,
    body: text,
  });

  if (error) return NextResponse.json({ error: "리뷰 저장 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
