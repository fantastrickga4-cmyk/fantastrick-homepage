import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { PATCH as adminPatch } from "@/app/api/admin/reservations/route";

/**
 * 관리자 [입출금 내역] — **통장(카톡) 기준** 목록.
 *
 * [왜 만들었나]
 *  기존 입출금 화면은 "예약에 입금확인 도장이 찍힌 기록"을 보여줬다. 즉 **예약 장부**다.
 *  그래서 **돈은 들어왔는데 예약을 못 찾은 입금(no_match)** 은 화면 어디에도 안 나왔다.
 *  손님이 다른 이름으로 보내거나 금액을 잘못 넣으면 사장님은 그 사실을 영영 모른다.
 *  → 태블릿이 카톡에서 읽어온 입금(deposits)을 그대로 늘어놓고,
 *    **그 옆에 "이 예약인 것 같다"를 붙여** 한눈에 대조할 수 있게 한다.
 *
 * [자동확인이 왜 보류했는지를 말해주는 게 핵심]
 *  matcher 는 이름·금액이 **정확히** 같아야만 자동으로 누른다(돈 문제라 일부러 엄격).
 *  사람에게 필요한 건 "왜 안 눌렸는지"다 — 금액이 4천원 다른지, 이름 한 글자가 다른지,
 *  기존 워드프레스 예약이라 대상이 아닌지. 그걸 문장으로 만들어 돌려준다.
 */

export const dynamic = "force-dynamic";

/** 매칭 판단용 이름 정규화 — matcher.ts 와 같은 규칙(공백 제거·NFC·소문자) */
function normalizeName(s: string): string {
  return (s || "").replace(/\s+/g, "").normalize("NFC").toLowerCase();
}

/** 글자 하나 차이까지만 "비슷하다"고 본다. 너무 느슨하면 엉뚱한 예약을 권하게 된다. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 99; // 두 글자 이상 차이는 볼 것도 없음
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

type ResRow = {
  id: string; name: string; phone: string | null; deposit: number;
  theme_name: string; date: string; time: string;
  status: string; deposit_paid: boolean; source: string | null;
};

/** 한국시각 날짜(YYYY-MM-DD) → DB 비교용 ISO. 그냥 자르면 새벽 0~9시가 전날로 밀린다. */
function kstStart(d: string) { return `${d}T00:00:00+09:00`; }
function kstEndExclusive(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, day + 1));
  return `${next.toISOString().slice(0, 10)}T00:00:00+09:00`;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "DB가 설정되지 않았습니다." }, { status: 503 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || from;

  const { data: deps, error } = await db
    .from("deposits")
    .select("id, depositor_name, amount, raw_text, received_at, status, matched_reservation_id, error_message, created_at")
    .gte("created_at", kstStart(from))
    .lt("created_at", kstEndExclusive(to))
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "입금 내역을 못 읽었습니다." }, { status: 500 });

  const rows = deps || [];

  // 이미 붙은 예약은 id 로 직접 가져온다(예약일이 지났어도 보여야 하므로 후보 풀과 별개).
  const matchedIds = rows.map((d) => d.matched_reservation_id).filter(Boolean) as string[];
  const matchedMap = new Map<string, ResRow>();
  if (matchedIds.length) {
    const { data } = await db
      .from("reservations")
      .select("id, name, phone, deposit, theme_name, date, time, status, deposit_paid, source")
      .in("id", matchedIds);
    for (const r of (data || []) as ResRow[]) matchedMap.set(r.id, r);
  }

  // "이 예약 아닌가요?" 후보 풀 — 입금일 기준 최근/앞으로의 예약만 본다.
  const poolFrom = new Date(`${from}T00:00:00+09:00`);
  poolFrom.setDate(poolFrom.getDate() - 14);
  const { data: pool } = await db
    .from("reservations")
    .select("id, name, phone, deposit, theme_name, date, time, status, deposit_paid, source")
    .gte("date", poolFrom.toISOString().slice(0, 10))
    .limit(1000);
  const candidatesPool = (pool || []) as ResRow[];

  const deposits = rows.map((d) => {
    const dn = normalizeName(d.depositor_name);
    const matched = d.matched_reservation_id ? matchedMap.get(d.matched_reservation_id) ?? null : null;

    // 이미 자동으로 붙은 건은 후보를 계산하지 않는다(볼 이유가 없다).
    let candidates: Array<ResRow & { why: string; strength: number }> = [];
    if (d.status !== "approved" && d.status !== "parse_failed") {
      candidates = candidatesPool
        .map((r) => {
          const rn = normalizeName(r.name);
          const nameEq = rn === dn;
          const amountEq = r.deposit === d.amount;
          const nameNear = !nameEq && rn.length >= 2 && editDistance(rn, dn) <= 1;
          if (!nameEq && !(amountEq && nameNear)) return null;

          let why: string;
          let strength: number;
          if (nameEq && amountEq) {
            if (r.deposit_paid) {
              why = "이름·금액이 딱 맞는데 **이미 입금확인이 된 예약**입니다. 같은 사람이 두 번 보냈을 수 있어요.";
              strength = 3;
            } else if (r.status !== "pending") {
              why = `이름·금액은 맞는데 예약 상태가 **${r.status}** 입니다.`;
              strength = 3;
            } else {
              why = "이름·금액이 완전히 일치합니다. (같은 조건 예약이 2건 이상이면 안전을 위해 자동확인을 보류합니다)";
              strength = 5;
            }
          } else if (nameEq) {
            const diff = d.amount - r.deposit;
            why = `이름은 같은데 **금액이 ${Math.abs(diff).toLocaleString()}원 ${diff > 0 ? "많습니다" : "적습니다"}** (예약금 ${r.deposit.toLocaleString()}원).`;
            strength = 2;
          } else {
            why = `금액은 같은데 **이름이 다릅니다** (예약자 ${r.name}). 가족·지인 이름으로 보냈을 수 있어요.`;
            strength = 1;
          }
          return { ...r, why, strength };
        })
        .filter(Boolean)
        .sort((a, b) => b!.strength - a!.strength)
        .slice(0, 3) as Array<ResRow & { why: string; strength: number }>;
    }

    const verdict =
      d.status === "approved" ? "ok"
        : d.status === "parse_failed" ? "parse_failed"
          : d.status === "dry_run" ? "dry_run"
            : d.status === "failed" ? "failed"
              : candidates.length ? "near"
                : "none";

    return {
      id: d.id,
      at: d.created_at,
      receivedAt: d.received_at,
      depositorName: d.depositor_name,
      amount: d.amount,
      rawText: d.raw_text,
      status: d.status,
      errorMessage: d.error_message,
      verdict,
      matched,
      candidates,
    };
  });

  return NextResponse.json({ deposits });
}

/**
 * "이 입금은 이 예약이 맞다" — 사람이 직접 이어붙인다.
 *
 * ⚠️ 입금확인 규칙을 여기서 다시 구현하지 않는다. 자동확인과 **똑같이**
 *    관리자 PATCH 를 그대로 호출한다(확정·문자·변경이력이 전부 거기 있다).
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "DB가 설정되지 않았습니다." }, { status: 503 });

  let body: { depositId?: string; reservationId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }
  const { depositId, reservationId } = body;
  if (!depositId || !reservationId) return NextResponse.json({ error: "입금·예약을 함께 지정해 주세요." }, { status: 400 });

  const { data: dep } = await db
    .from("deposits").select("id, depositor_name, status").eq("id", depositId).maybeSingle();
  if (!dep) return NextResponse.json({ error: "그 입금 기록을 찾을 수 없습니다." }, { status: 404 });
  if (dep.status === "approved") return NextResponse.json({ error: "이미 처리된 입금입니다." }, { status: 409 });

  const patchReq = new NextRequest(new URL("/api/admin/reservations", req.url), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
    body: JSON.stringify({
      id: reservationId,
      deposit_paid: true,
      paid_source: "manual",           // 사람이 고른 것이므로 자동매칭이 아니다
      deposit_payer: dep.depositor_name,
    }),
  });
  const patchRes = await adminPatch(patchReq);
  if (!patchRes.ok) {
    let detail = `HTTP ${patchRes.status}`;
    try { detail = ((await patchRes.json()) as { error?: string }).error || detail; } catch { /* 본문 없음 */ }
    return NextResponse.json({ error: `입금확인 실패: ${detail}` }, { status: 500 });
  }

  await db.from("deposits")
    .update({ status: "approved", matched_reservation_id: reservationId })
    .eq("id", depositId);

  return NextResponse.json({ ok: true });
}
