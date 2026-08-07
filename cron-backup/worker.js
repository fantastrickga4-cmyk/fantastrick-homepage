/**
 * 크론 워커 (독립) — 메인 앱의 크론 엔드포인트를 시간에 맞춰 부른다.
 *
 * OpenNext 로 만든 메인 워커에는 scheduled 핸들러가 없다. 그래서 크론은 이 작은 워커가 맡는다.
 * 메인 앱이 CRON_SECRET 으로 인증하므로 이 워커에도 같은 CRON_SECRET 시크릿이 필요하다.
 *
 * ⚠️ 이름이 `fantastrick-cron-backup` 이지만 이제 **백업만 하는 게 아니다**(2026-08-07).
 *    이름을 바꾸면 워커를 새로 만들고 옛 것을 지워야 해서, 그대로 두고 여기 적어둔다.
 *
 * 하는 일:
 *   · 매주 월 03:00 UTC (= 월 12:00 KST) → /api/cron/backup   전체 백업
 *   · 5분마다                              → /api/cron/wp-sync 기존 사이트 예약 거울 맞추기
 *
 * [wp-sync 를 왜 여기로 옮겼나]
 *  전에는 사장님 PC 의 작업 스케줄러가 5분마다 돌렸다. **PC 가 꺼져 있으면 동기화가 멈춰**
 *  새 예약이 아침 안내문자 목록에서 빠졌다. 이제 PC 전원과 무관하다.
 *
 * [실패하면]
 *  로그만 남기고 넘어간다. 거울이라 다음 5분에 다시 맞으므로 재시도가 필요 없다.
 *  확인은 `npx wrangler tail fantastrick-cron-backup`.
 */
// 서비스 바인딩으로 부르므로 이 호스트명은 **아무 값이나 상관없다**(경로만 쓰인다).
// 공개 주소로 부르면 같은 존이라 막힌다 — 2026-08-07 에 `404 error code: 1042` 를 맞았다.
const BASE = "https://homepage.internal";

const JOBS = {
  "0 3 * * 1": { path: "/api/cron/backup", label: "backup" },
  "*/5 * * * *": { path: "/api/cron/wp-sync", label: "wp-sync" },
};

async function run(job, env) {
  const t0 = Date.now();
  try {
    const res = await env.HOMEPAGE.fetch(BASE + job.path, {
      method: "POST",
      headers: { authorization: "Bearer " + env.CRON_SECRET },
    });
    const text = (await res.text()).slice(0, 500);
    // 성공해도 한 줄 남긴다 — "돌긴 도는데 아무것도 안 바뀌는" 상태와 "아예 안 도는" 상태를
    // 로그만 보고 구분할 수 있어야 한다.
    console.log(`[${job.label}] ${res.status} ${Date.now() - t0}ms ${text}`);
  } catch (e) {
    console.error(`[${job.label}] 실패 ${Date.now() - t0}ms`, e?.message || e);
  }
}

export default {
  async scheduled(event, env, ctx) {
    // 어느 일정으로 깨어났는지는 event.cron 에 그대로 온다.
    // 못 알아보면(일정을 추가하고 여기 안 적었을 때) 조용히 넘어가지 말고 로그를 남긴다.
    const job = JOBS[event.cron];
    if (!job) {
      console.error("[cron] 모르는 일정:", event.cron, "— worker.js 의 JOBS 에 추가할 것");
      return;
    }
    ctx.waitUntil(run(job, env));
  },
};
