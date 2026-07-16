import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { sweepExpiredReservations } from "@/lib/expire";
import { parseDeposit } from "@/lib/bank/parser";
import { findMatch } from "@/lib/bank/matcher";
import type { Deposit, Reservation } from "@/lib/bank/types";
import { makeAdminToken, ADMIN_COOKIE } from "@/lib/admin";
import { PATCH as adminPatch } from "@/app/api/admin/reservations/route";

/**
 * 입금 알림 받는 문 — 태블릿(BankNotify 앱)이 여기로 알림을 보낸다.
 *
 *   태블릿 카톡 입금알림 → POST /api/bank/deposit → 이름·금액 뽑기 →
 *   입금 기다리는 예약 중 이름+금액이 정확히 맞는 1건 찾기 → 입금확인 처리
 *
 * [왜 홈페이지 안에 있나]
 *  전에는 PC 에 프로그램을 따로 켜두고 그게 이 일을 했다(bank-auto). 워드프레스 DB 에
 *  직접 붙어야 해서 PC 가 필요했던 것. 새 사이트는 예약이 바로 옆(같은 DB)에 있으므로
 *  홈페이지가 직접 받으면 된다. → PC·방화벽·Tailscale 전부 불필요.
 *
 * [안전장치]
 *  · 토큰(X-Webhook-Token)이 맞아야만 받는다.
 *  · 같은 알림이 두 번 와도 한 번만 처리 (deposits.event_id unique).
 *  · 이름+금액이 정확히 일치하고 후보가 딱 1건일 때만 처리. 동명이인·여러건이면 손 안 댐.
 *  · BANK_DRY_RUN=true 동안은 매칭만 해보고 실제로 누르지 않는다.
 */

// 입금 알림은 오래 걸릴 일이 없다. 늘어지면 태블릿이 재전송하게 두는 편이 낫다.
export const maxDuration = 20;

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

/** 같은 알림인지 판별하는 지문. 태블릿이 재전송해도 같은 값이 나온다. */
function deriveEventId(rawText: string, receivedAt: number): string {
  return createHash("sha256").update(`${receivedAt}|${rawText}`).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  // ── 1) 토큰 확인 ────────────────────────────────────────────────
  const secret = process.env.BANK_WEBHOOK_SECRET;
  if (!secret) return jsonError(503, "BANK_WEBHOOK_SECRET 미설정");
  if (req.headers.get("x-webhook-token") !== secret) return jsonError(401, "unauthorized");

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  // ── 2) 알림 내용 꺼내기 ─────────────────────────────────────────
  let body: { rawText?: unknown; receivedAt?: unknown; depositorName?: unknown; amount?: unknown };
  try { body = await req.json(); } catch { return jsonError(400, "invalid_json"); }

  const rawText = typeof body.rawText === "string" ? body.rawText : "";
  const receivedAt = Number(body.receivedAt);
  if (!rawText || rawText.length > 2000) return jsonError(400, "rawText 가 없거나 너무 깁니다");
  if (!Number.isFinite(receivedAt) || receivedAt <= 0) return jsonError(400, "receivedAt 이 올바르지 않습니다");

  // 앱이 미리 뽑아 보내면 그대로, 아니면 여기서 원문을 파싱한다.
  // (앱을 다시 설치하지 않고도 새 알림 형식에 대응하려고 서버 파싱을 우선으로 둔다)
  let depositorName = typeof body.depositorName === "string" ? body.depositorName : undefined;
  let amount = Number.isInteger(body.amount) ? (body.amount as number) : undefined;
  if (!depositorName || !amount) {
    const parsed = parseDeposit(rawText);
    if (!parsed) {
      console.warn("[입금] 파싱 실패:", rawText.slice(0, 200));
      return jsonError(400, "parse_failed", { message: "알림에서 이름·금액을 못 뽑았습니다." });
    }
    depositorName = parsed.depositorName;
    amount = parsed.amount;
  }

  const eventId = deriveEventId(rawText, receivedAt);

  // ── 3) 기록 (같은 알림 두 번 막기) ──────────────────────────────
  // event_id 가 unique 라, 두 번째 시도는 DB 가 거부한다(23505). 돈 관련이라 이 방식이 안전하다.
  const { data: inserted, error: insErr } = await db
    .from("deposits")
    .insert({
      event_id: eventId,
      depositor_name: depositorName,
      amount,
      raw_text: rawText,
      received_at: new Date(receivedAt).toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      const { data: prev } = await db.from("deposits").select("id, status").eq("event_id", eventId).single();
      return NextResponse.json({ ok: true, decision: "duplicate", id: prev?.id, status: prev?.status });
    }
    console.error("[입금] 기록 실패", insErr.message);
    return jsonError(500, "기록 실패");
  }
  const depositId = inserted.id as string;
  const finish = (patch: Record<string, unknown>) => db.from("deposits").update(patch).eq("id", depositId);

  // ── 4) 입금 기다리는 예약 찾기 ──────────────────────────────────
  // 만료 정리(30분 미입금·자정 유예)를 먼저 돌린다 — 이미 취소돼야 할 예약에 입금확인을 누르지 않도록.
  await sweepExpiredReservations(db).catch(() => {});

  const { data: rows, error: selErr } = await db
    .from("reservations")
    .select("id, name, phone, deposit, theme_name, date, time")
    .eq("status", "pending")
    .eq("deposit_paid", false);

  if (selErr) {
    await finish({ status: "failed", error_message: `예약 조회 실패: ${selErr.message}` });
    return jsonError(500, "예약 조회 실패");
  }

  const candidates: Reservation[] = (rows || []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    ...(r.phone ? { phone: r.phone as string } : {}),
    amount: (r.deposit as number) ?? 0,
    bookedAt: `${r.date} ${r.time} ${r.theme_name}`,
  }));

  const deposit: Deposit = {
    id: depositId, eventId, depositorName, amount, rawText,
    receivedAt, ingestedAt: Date.now(), status: "pending", attempts: 1,
  };

  const match = findMatch(deposit, candidates);
  if (!match) {
    await finish({ status: "no_match" });
    console.log(`[입금] 매칭 실패: ${depositorName} ${amount}원 (대기 ${candidates.length}건)`);
    return NextResponse.json({ ok: true, decision: "no_match", id: depositId, pending: candidates.length });
  }

  // ── 5) 연습모드 가드 ────────────────────────────────────────────
  if (process.env.BANK_DRY_RUN !== "false") {
    await finish({ status: "dry_run", matched_reservation_id: match.reservation.id });
    console.log(`[입금] DRY_RUN 매칭 성공: ${depositorName} ${amount}원 → ${match.reservation.id}`);
    return NextResponse.json({
      ok: true, decision: "dry_run", id: depositId,
      reservation_id: match.reservation.id, reason: match.reason,
    });
  }

  // ── 6) 입금확인 처리 ────────────────────────────────────────────
  // 사장님이 관리자 화면에서 [입금 확인] 버튼을 누를 때와 "똑같은 함수"를 부른다.
  // 입금확인 → 예약확정 → 안내문자 → 변경이력이 전부 그 안에서 처리되므로,
  // 여기서 그 규칙을 다시 구현하지 않는다. (두 곳에 같은 규칙을 두면 언젠가 어긋난다)
  const patchReq = new NextRequest(new URL("/api/admin/reservations", req.url), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      cookie: `${ADMIN_COOKIE}=${makeAdminToken() ?? ""}`,
    },
    body: JSON.stringify({
      id: match.reservation.id,
      deposit_paid: true,
      paid_source: "auto",        // 관리자 화면에 "🤖 자동매칭" 으로 표시됨
      deposit_payer: depositorName,
    }),
  });

  const patchRes = await adminPatch(patchReq);
  if (!patchRes.ok) {
    let detail = `HTTP ${patchRes.status}`;
    try { detail = ((await patchRes.json()) as { error?: string }).error || detail; } catch { /* 본문 없음 */ }
    await finish({ status: "failed", error_message: detail, matched_reservation_id: match.reservation.id });
    console.error("[입금] 입금확인 실패:", detail);
    return jsonError(500, "입금확인 실패", { detail, id: depositId });
  }

  await finish({
    status: "approved",
    matched_reservation_id: match.reservation.id,
  });
  console.log(`[입금] 자동 입금확인 완료: ${depositorName} ${amount}원 → ${match.reservation.id}`);
  return NextResponse.json({
    ok: true, decision: "approved", id: depositId,
    reservation_id: match.reservation.id, reason: match.reason,
  });
}
