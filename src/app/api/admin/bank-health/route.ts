import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

/**
 * 관리자 **입금 감시 신호등** — 태블릿이 지금 입금을 받을 수 있는 상태인지 한 줄로 답한다.
 *
 * [왜 만들었나 — 2026-08-03]
 *  2026-08-02 10:17 ~ 08-03 12:26, 약 **26시간** 동안 태블릿에 카카오톡이 화면에 없어서
 *  화면 감시가 글자를 하나도 못 읽었다. 그런데 **아무도 몰랐다.**
 *  신호는 `bank_diag` 표에 5분마다 꼬박꼬박 쌓이고 있었지만 그걸 보는 화면이 없었다.
 *  → 쌓기만 하지 말고 **사람 눈에 띄게** 한다. `bank_diag` 를 읽어 신호등으로 요약한다.
 *
 * [핵심 판단 — 경로가 둘이라 "하나 죽음"과 "둘 다 죽음"은 전혀 다르다]
 *  · 화면 감시(접근성): 카카오톡 채팅방이 화면에 떠 있어야 읽는다.
 *  · 알림 캡처(NotificationListener): 화면과 무관하게 알림만 오면 읽는다.
 *  한쪽이 멈춰도 다른 쪽이 받아준다(실제로 그 26시간의 입금은 알림 캡처가 전부 받았다).
 *  그래서 **하나만 멈추면 🟡 주의, 둘 다 멈추면 🔴 위험**이다. 하나 멈췄다고 빨강을 켜면
 *  사장님이 빨강에 익숙해져서 진짜 빨강을 무시하게 된다.
 *
 * [읽기 전용] 이 API 는 아무것도 바꾸지 않는다. 화면에서 30초마다 불러도 안전하다.
 */

export const dynamic = "force-dynamic";

/** 하트비트는 5분마다 온다. 3번 연속 빠지면(=15분) 죽은 것으로 본다. */
const SERVICE_DOWN_MIN = 15;

/**
 * 카카오톡 화면 이벤트는 사람이 안 만져도 채팅방이 갱신될 때마다 온다.
 * 실측(08-02 새벽)에 20분쯤 벌어지는 구간이 있었다 → 30분은 아직 주의, 2시간이면 진짜 멈춘 것.
 * 밤마다 빨강이 켜지면 아무도 안 보게 되므로 일부러 느슨하게 잡았다.
 */
const SCREEN_WARN_MIN = 30;
const SCREEN_DOWN_MIN = 120;

/** 진단 표에서 몇 줄이나 훑어볼지. 5분 하트비트 × 2경로 = 시간당 24줄쯤 쌓인다. */
const SCAN_ROWS = 400;

type Level = "ok" | "warn" | "down" | "unknown";

type DiagRow = { kind: string; payload: Record<string, unknown> | null; created_at: string };

type Signal = {
  key: string;
  label: string;
  level: Level;
  lastAt: string | null;
  minsAgo: number | null;
  note: string;
};

function minsSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
}

/** "3분 전" / "26시간 전" — 26시간을 "1560분 전"으로 쓰면 심각한지 감이 안 온다. */
function ago(mins: number | null): string {
  if (mins === null) return "기록 없음";
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}시간 ${mins % 60}분 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 여러 kind 중 가장 최근 것의 시각 */
function latestOf(rows: DiagRow[], kinds: string[]): string | null {
  for (const r of rows) if (kinds.includes(r.kind)) return r.created_at; // rows 는 최신순
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "DB가 설정되지 않았습니다." }, { status: 503 });

  const { data, error } = await db
    .from("bank_diag")
    .select("kind, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(SCAN_ROWS);
  if (error) return NextResponse.json({ error: "진단 기록을 못 읽었습니다." }, { status: 500 });

  const rows = (data || []) as DiagRow[];
  const now = Date.now();

  // ── 1) 화면 감시(접근성) 서비스가 살아 있나 ────────────────────────────
  const watcherAt = latestOf(rows, ["svc_heartbeat", "svc_connected", "svc_event", "send_result", "manual_dump"]);
  const watcherMins = minsSince(watcherAt, now);
  // 마지막 신호가 "죽었다" 자체면 그걸 그대로 말해준다(가장 확실한 단서).
  const watcherDead = rows.find((r) => r.kind === "svc_destroyed" || r.kind === "svc_not_running");
  const watcherDeadIsLatest = !!watcherDead && (!watcherAt || watcherDead.created_at >= watcherAt);

  const watcher: Signal = {
    key: "watcher",
    label: "화면 감시",
    level: watcherMins === null ? "unknown" : watcherDeadIsLatest || watcherMins > SERVICE_DOWN_MIN ? "down" : "ok",
    lastAt: watcherAt,
    minsAgo: watcherMins,
    note: "",
  };
  watcher.note =
    watcher.level === "unknown" ? "신호가 한 번도 안 왔습니다."
      : watcherDeadIsLatest ? "서비스가 내려갔다는 신호가 마지막입니다. 접근성 설정에서 껐다 켜야 합니다."
        : watcher.level === "down" ? `${ago(watcherMins)}부터 신호가 없습니다. 태블릿 접근성 설정을 껐다 켜주세요.`
          : `살아 있습니다 (마지막 신호 ${ago(watcherMins)}).`;

  // ── 2) 카카오톡이 화면에 떠 있나 ───────────────────────────────────────
  // svc_event 행은 오래되면 정리돼 사라진다. 그래서 하트비트가 들고 있는
  // secSinceLastEvent(마지막으로 화면을 읽은 지 몇 초) 로도 역산해 더 최근 값을 쓴다.
  let screenAt = latestOf(rows, ["svc_event", "send_result", "manual_dump"]);
  const hb = rows.find((r) => r.kind === "svc_heartbeat");
  const secSinceEvent = num(hb?.payload?.["secSinceLastEvent"]);
  if (hb && secSinceEvent !== null) {
    const derived = new Date(new Date(hb.created_at).getTime() - secSinceEvent * 1000).toISOString();
    if (!screenAt || derived > screenAt) screenAt = derived;
  }
  const screenMins = minsSince(screenAt, now);

  const screen: Signal = {
    key: "screen",
    label: "카톡 화면",
    level:
      watcher.level === "down" || watcher.level === "unknown" ? "unknown" // 감시가 죽었으면 화면 상태는 알 수 없다
        : screenMins === null ? "unknown"
          : screenMins > SCREEN_DOWN_MIN ? "down"
            : screenMins > SCREEN_WARN_MIN ? "warn"
              : "ok",
    lastAt: screenAt,
    minsAgo: screenMins,
    note: "",
  };
  screen.note =
    screen.level === "unknown" && watcher.level !== "ok" ? "화면 감시가 멈춰 있어 알 수 없습니다."
      : screen.level === "unknown" ? "아직 화면을 읽은 기록이 없습니다."
        : screen.level === "down" ? `${ago(screenMins)}부터 카카오톡을 못 읽었습니다. 태블릿에 카카오뱅크 채팅방을 다시 띄워주세요.`
          : screen.level === "warn" ? `${ago(screenMins)}부터 조용합니다. 채팅방이 떠 있는지 봐주세요.`
            : `읽고 있습니다 (마지막 ${ago(screenMins)}).`;

  // ── 3) 알림 캡처 (화면을 안 봐도 되는 예비 경로) ───────────────────────
  const notifAt = latestOf(rows, ["notif_heartbeat", "notif_connected", "notif_send"]);
  const notifMins = minsSince(notifAt, now);
  const notifDead = rows.find((r) => r.kind === "notif_destroyed" || r.kind === "notif_disconnected");
  const notifDeadIsLatest = !!notifDead && (!notifAt || notifDead.created_at >= notifAt);

  const notif: Signal = {
    key: "notif",
    label: "알림 캡처",
    level: notifMins === null ? "unknown" : notifDeadIsLatest || notifMins > SERVICE_DOWN_MIN ? "down" : "ok",
    lastAt: notifAt,
    minsAgo: notifMins,
    note: "",
  };
  notif.note =
    // 앱 v0.4.0 부터 신호를 보낸다. 그 전 버전이면 "없음"이 정상이라 겁줄 필요가 없다.
    notif.level === "unknown" ? "아직 신호가 없습니다. 태블릿 앱이 0.4.0 미만이면 정상입니다(그 버전엔 이 신호가 없음)."
      : notifDeadIsLatest ? "연결이 끊겼다는 신호가 마지막입니다. 알림 접근 설정을 껐다 켜주세요."
        : notif.level === "down" ? `${ago(notifMins)}부터 신호가 없습니다. 알림 접근 설정을 껐다 켜주세요.`
          : `살아 있습니다 (마지막 신호 ${ago(notifMins)}).`;

  // ── 4) 종합 — "지금 입금이 들어오면 잡히나?" 하나로 답한다 ──────────────
  // 잡을 수 있는 경로: 화면 감시(서비스 살아있고 + 카톡이 화면에 있음) / 알림 캡처(살아있음)
  const screenPathOk = watcher.level === "ok" && (screen.level === "ok" || screen.level === "warn");
  const notifPathOk = notif.level === "ok";
  // 앱이 구버전이라 알림 신호가 아예 없는 경우 — 죽었다고 단정하면 안 된다(모르는 것뿐).
  const notifUnknown = notif.level === "unknown";

  let level: Level;
  let headline: string;
  let detail: string;
  if (screenPathOk && notifPathOk) {
    level = "ok";
    headline = "입금 감시 정상";
    detail = "두 경로(화면 감시·알림 캡처)가 모두 살아 있습니다.";
  } else if (notifUnknown) {
    // "모른다"를 "멈췄다"로 말하면 안 된다 — 앱이 구버전이면 신호가 없는 게 정상이다.
    // (이 분기를 아래 "하나 멈춤"보다 먼저 둬야 한다. 순서를 바꾸면 멀쩡한 태블릿을 고장났다고 말한다)
    level = screenPathOk ? "warn" : "down";
    headline = screenPathOk ? "화면 감시만 확인됨" : "입금이 안 잡히고 있습니다";
    detail = screenPathOk
      ? "알림 캡처 상태는 알 수 없습니다 — 태블릿 앱이 0.4.0 미만이면 원래 신호를 안 보냅니다."
      : "화면 감시가 멈췄고, 알림 캡처는 상태를 알 수 없습니다. 태블릿을 확인해 주세요.";
  } else if (screenPathOk || notifPathOk) {
    level = "warn";
    const alive = screenPathOk ? "화면 감시" : "알림 캡처";
    const dead = screenPathOk ? "알림 캡처" : "화면 감시";
    headline = `${dead}가 멈췄습니다 — ${alive}가 대신 받는 중`;
    detail = "입금은 계속 들어옵니다. 다만 지금은 예비가 없으니 시간 날 때 태블릿을 봐주세요.";
  } else {
    level = "down";
    headline = "입금이 안 잡히고 있습니다";
    detail = "두 경로가 모두 멈췄습니다. 지금 들어오는 입금은 자동확정되지 않습니다 — 태블릿을 확인해 주세요.";
  }

  // 참고용 — 마지막으로 실제 입금이 올라온 시각. 신호등이 초록인데 이게 한참 전이면
  // "감시는 도는데 돈이 안 들어온 것"이라 사람이 헷갈리지 않는다.
  const { data: dep } = await db
    .from("deposits")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    overall: { level, headline, detail },
    signals: [watcher, screen, notif] satisfies Signal[],
    lastDepositAt: dep?.created_at ?? null,
    checkedAt: new Date().toISOString(),
  });
}
