// 자동 백업 크론 워커 (독립) — 매주 1회 메인 앱의 /api/cron/backup 을 호출한다.
//   OpenNext 워커에는 scheduled 핸들러가 없어, 크론은 이 작은 워커가 맡는다.
//   메인 앱이 CRON_SECRET 으로 인증하므로 이 워커에도 같은 CRON_SECRET 시크릿이 필요.
export default {
  async scheduled(event, env, ctx) {
    const url = "https://fantastrick-homepage.tndn1102.workers.dev/api/cron/backup";
    ctx.waitUntil(
      fetch(url, { method: "POST", headers: { authorization: "Bearer " + env.CRON_SECRET } })
        .then((r) => r.text())
        .then((t) => console.log("[backup cron]", t))
        .catch((e) => console.error("[backup cron] error", e)),
    );
  },
};
