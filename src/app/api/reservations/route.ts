import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { normalizePhone, isValidPhone, reservationDateState, sanitizeText } from "@/lib/util";
import { themeById, slotsForThemeDate } from "@/lib/data";
import { getConfig } from "@/lib/settings";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { sweepExpiredReservations } from "@/lib/expire";

const TOO_MANY = { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };

// 예약 생성
export async function POST(req: NextRequest) {
  // 레이트 리밋: IP당 8회/분 (DB 접근 전에 차단)
  if (!rateLimit(`res-post:${getClientIp(req)}`, 8, 60_000)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
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
  const date = String(body.date || "");
  const time = String(body.time || "");
  const people = Number(body.people || 0);
  const name = sanitizeText(String(body.name || ""));
  const phone = normalizePhone(String(body.phone || ""));
  const pin = String(body.pin || "").trim();

  const theme = themeById(themeId);
  if (!theme || theme.soon) return NextResponse.json({ error: "예약할 수 없는 테마입니다." }, { status: 400 });
  if (!date || !time) return NextResponse.json({ error: "날짜와 시간을 선택해 주세요." }, { status: 400 });

  // 예약 오픈 규칙(서버 검증): 이용일 1주일 전 저녁 9시(KST) 이후에만 예약 가능
  const dateState = reservationDateState(date);
  if (dateState === "invalid") return NextResponse.json({ error: "날짜 형식을 확인해 주세요." }, { status: 400 });
  if (dateState === "past") return NextResponse.json({ error: "지난 날짜는 예약할 수 없습니다." }, { status: 400 });
  if (dateState === "not_open") {
    return NextResponse.json({ error: "아직 예약이 오픈되지 않은 날짜입니다. 예약은 이용일 1주일 전 저녁 9시에 열립니다." }, { status: 409 });
  }

  if (!(people >= 1 && people <= 8)) return NextResponse.json({ error: "인원을 확인해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "예약자 이름을 입력해 주세요." }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: "이름이 너무 깁니다." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해 주세요." }, { status: 400 });

  const config = await getConfig();
  if (config.disabledThemes.includes(theme.id)) {
    return NextResponse.json({ error: "현재 예약을 받지 않는 테마입니다." }, { status: 400 });
  }

  // 요청한 시간이 (그 테마·그 요일의) 허용 시간대에 있는지 검사
  const allowedSlots = slotsForThemeDate(config.themeSlots, config.storeSlots, config.timeSlots, theme.id, theme.store, date);
  if (!allowedSlots.includes(time)) {
    return NextResponse.json({ error: "유효하지 않은 시간입니다." }, { status: 400 });
  }

  // 예약 스팸 상한: 같은 전화번호로 대기(pending) 예약이 6건 이상이면 차단
  const { count: pendingCount } = await db
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .eq("status", "pending");
  if ((pendingCount || 0) >= 6) {
    return NextResponse.json(
      { error: "대기 중인 예약이 너무 많습니다. 기존 예약 확인 후 이용해 주세요." },
      { status: 429 }
    );
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

  const deposit = theme.deposit;

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
      pin,
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
  // 레이트 리밋: IP당 20회/분 (전화번호 열거·수집 방어)
  if (!rateLimit(`res-get:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  // 만료 예약(30분 미입금) 자동 정리 — 실패해도 조회는 진행
  await sweepExpiredReservations(db).catch(() => {});

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") || "");
  const name = sanitizeText(req.nextUrl.searchParams.get("name") || "");
  const pin = String(req.nextUrl.searchParams.get("pin") || "").trim();
  if (!isValidPhone(phone)) return NextResponse.json({ error: "전화번호 형식을 확인해 주세요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "예약자 이름을 입력해 주세요." }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해 주세요." }, { status: 400 });

  const { data, error } = await db
    .from("reservations")
    .select("id, store_id, theme_id, theme_name, date, time, people, name, deposit, deposit_paid, status, created_at")
    .eq("phone", phone)
    .eq("name", name)
    .eq("pin", pin)
    .order("date", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true, reservations: data });
}
