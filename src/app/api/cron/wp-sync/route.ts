import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { syncFromWordpress } from "@/lib/wp-sync";

/**
 * 기존 사이트(fantastrick.co.kr) 확정 예약 거울 맞추기 — **5분마다 크론이 부른다.**
 *
 * [왜 여기로 옮겼나 — 2026-08-07]
 *  전에는 사장님 PC 의 작업 스케줄러(fantastrick-wp-sync)가 5분마다 돌렸다. 그래서
 *  **PC 가 꺼져 있으면 동기화가 멈췄다** — 새 예약이 들어와도 아침 안내문자 목록에 안 뜬다.
 *  크론을 클라우드플레어로 옮겨 PC 전원과 무관하게 만든다.
 *
 * [워커에서 MySQL 이 되나 — 된다. 단 두 가지 조건이 있다]
 *  · mysql2 는 `disableEval: true` 여야 한다. 행 파서를 코드 생성으로 만드는데 워커가 금지한다.
 *  · WP_DB_HOST 는 **호스트명**이어야 한다(db.fantastrick.co.kr). 워커는 원시 IP 연결을 막는다
 *    (211.47.74.38 로 하면 error 1104). ⚠️ PC 쪽 .env 는 IP 라서 값이 서로 다르다.
 *  둘 다 2026-08-07 에 임시 워커로 실제 확인했다.
 *
 * [실패하면]
 *  200 이 아닌 응답을 준다. 크론 워커가 그 결과를 로그에 남긴다(wrangler tail 로 확인).
 *  동기화가 몇 번 실패해도 다음 5분에 다시 맞춰지므로 **재시도는 하지 않는다** — 거울이라
 *  마지막 한 번만 성공하면 상태가 같아진다.
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean | Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return isAdmin(req); // 관리자가 화면에서 "지금 맞추기" 를 눌러도 되게
}

async function run(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const { WP_DB_HOST, WP_DB_PORT, WP_DB_USER, WP_DB_PASSWORD, WP_DB_NAME, WP_TABLE_PREFIX,
          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  const missing = Object.entries({ WP_DB_HOST, WP_DB_USER, WP_DB_PASSWORD, WP_DB_NAME,
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return NextResponse.json({ error: `설정이 빠졌습니다: ${missing.join(", ")}` }, { status: 503 });
  }

  const t0 = Date.now();
  try {
    const r = await syncFromWordpress({
      db: {
        host: WP_DB_HOST!, port: +(WP_DB_PORT || 3306), user: WP_DB_USER!,
        password: WP_DB_PASSWORD!, database: WP_DB_NAME!, prefix: WP_TABLE_PREFIX || "wp_",
      },
      supabaseUrl: SUPABASE_URL!,
      supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY!,
    });
    return NextResponse.json({ ok: r.errors.length === 0, ms: Date.now() - t0, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, ms: Date.now() - t0, error: (e as Error).message.slice(0, 300) },
      { status: 500 },
    );
  }
}

export const POST = run;
export const GET = run; // 손으로 확인할 때 브라우저·curl 로 부르기 편하게
