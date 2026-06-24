import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone } from "@/lib/util";
import { themeById } from "@/lib/data";
import { getConfig } from "@/lib/settings";

// 예약 생성
export async function POST(req: NextRequest) {
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const themeId = String(body.themeId || "");
  const date = String(body.date || "");
  const time = String(body.time || "");
  const people = Number(body.people || 0);
  const name = String(body.name || "").trim();
  const phone = normalizePhone(String(body.phone || ""));

  const theme = themeById(themeId);
  if (!theme || theme.soon) return NextResponse.json({ error: "예약할 수 없는 테마입니다." }, { status: 400 });
  if (!date || !time) return NextResponse.json({ error: "날짜와 시간을 선택해 주세요." }, { status: 400 });
  if (!(people >= 1 && people <= 8)) return NextResponse.json({ error: "인원을 확인해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "예약자 이름을 입력해 주세요." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });

  const config = await getConfig();
  if (config.disabledThemes.includes(theme.id)) {
    return NextResponse.json({ error: "현재 예약을 받지 않는 테마입니다." }, { status: 400 });
  }

  // 관리자가 닫은(차단) 시간인지 확인
  const { data: blocks } = await db
    .from("blocked_slots")
    .select("theme_id, time")
    .eq("date", date);
  const relevant = (blocks || []).filter((b: { theme_id: string | null }) => !b.theme_id || b.theme_id === theme.id);
  if (relevant.some((b: { time: string | null }) => !b.time)) {
    return NextResponse.json({ error: "해당 날짜는 예약을 받지 않습니다." }, { status: 409 });
  }
  if (relevant.some((b: { time: string | null }) => b.time === time)) {
    return NextResponse.json({ error: "마감된 시간입니다. 다른 시간을 선택해 주세요." }, { status: 409 });
  }

  const deposit = config.depositPerPerson * people;

  const { data, error } = await db
    .from("reservations")
    .insert({
      store_id: theme.store,
      theme_id: theme.id,
      theme_name: theme.name,
      date,
      time,
      people,
      name,
      phone,
      deposit,
      status: "pending",
    })
    .select("id, cancel_token")
    .single();

  if (error) {
    // 중복 슬롯(unique 위반)
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 예약된 시간입니다. 다른 시간을 선택해 주세요." }, { status: 409 });
    }
    return NextResponse.json({ error: "예약 저장 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, deposit });
}

// 전화번호 + 예약자 이름으로 예약 조회 (이름을 본인확인 수단으로 사용)
export async function GET(req: NextRequest) {
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") || "");
  const name = (req.nextUrl.searchParams.get("name") || "").trim();
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "예약자 이름을 입력해 주세요." }, { status: 400 });

  const { data, error } = await db
    .from("reservations")
    .select("id, store_id, theme_id, theme_name, date, time, people, name, deposit, deposit_paid, status, created_at")
    .eq("phone", phone)
    .eq("name", name)
    .order("date", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true, reservations: data });
}
