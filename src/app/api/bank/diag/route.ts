import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";

/**
 * 태블릿 감시 앱(BankNotify)이 보내는 **진단 기록**을 받는 문.
 *
 * [왜 있나]
 *  2026-07-30, 태블릿이 입금을 하나도 못 올렸다. 그런데 서버에서 보면
 *  "앱이 안 보냈다"와 "보냈는데 실패했다"가 구분이 안 돼서 하루 종일 추측만 했다.
 *  앱 안에서 무슨 일이 일어나는지 볼 창이 없었던 게 원인이다.
 *  → 앱이 스스로 상태를 여기 적게 하고, 사람은 bank_diag 표만 보면 된다.
 *
 * [안전]
 *  · 입금 문(webhook/deposit)과 같은 토큰을 쓴다.
 *  · 개인 대화는 안 들어온다 — 앱이 화면 글자를 "개수"로만 세고,
 *    실제 문구는 "입금/송금"이 든 것만 담아 보낸다.
 *  · 진단일 뿐이라 실패해도 앱 동작을 막지 않는다(앱은 결과를 무시해도 됨).
 */

export const maxDuration = 10;

/** 이 표는 진단용이라 무한정 쌓을 필요가 없다. 너무 커지면 오래된 것부터 지운다. */
const KEEP_ROWS = 500;

export async function POST(req: NextRequest) {
  const secret = process.env.BANK_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "BANK_WEBHOOK_SECRET 미설정" }, { status: 503 });
  if (req.headers.get("x-webhook-token") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  let body: { kind?: unknown; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" ? body.kind.slice(0, 40) : "";
  if (!kind) return NextResponse.json({ ok: false, error: "kind 가 없습니다" }, { status: 400 });

  // payload 는 앱이 무엇을 담든 받는다(진단이라 형태를 미리 못 박지 않는다).
  // 다만 통째로 커지면 곤란하니 크기만 제한한다.
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const asText = JSON.stringify(payload);
  if (asText.length > 8000) {
    return NextResponse.json({ ok: false, error: "payload 가 너무 큽니다" }, { status: 400 });
  }

  const { error } = await db.from("bank_diag").insert({ kind, payload });
  if (error) {
    console.error("[진단] 기록 실패", error.message);
    return NextResponse.json({ ok: false, error: "기록 실패" }, { status: 500 });
  }

  // 가끔씩만 청소한다(매번 하면 느려진다). 5분마다 오는 heartbeat 기준 대략 하루 한두 번.
  if (Math.random() < 0.02) {
    const { data: cutoff } = await db
      .from("bank_diag")
      .select("created_at")
      .order("created_at", { ascending: false })
      .range(KEEP_ROWS, KEEP_ROWS)
      .maybeSingle();
    if (cutoff?.created_at) {
      await db.from("bank_diag").delete().lt("created_at", cutoff.created_at);
    }
  }

  return NextResponse.json({ ok: true, build: "20260731-diag" });
}
