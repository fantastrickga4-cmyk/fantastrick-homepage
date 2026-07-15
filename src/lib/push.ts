import webpush from "web-push";
import { getSupabase } from "./supabase";

// 폰 알림(웹푸시) — 관리자 화면을 안 켜놔도 새 예약을 알려준다.
//   30분 미입금 자동취소가 있어서, 현장에 있는 사장님이 새 예약을 놓치면 예약이 날아간다.
//   키가 없으면 조용히 넘어간다(문자와 같은 방식) — 기능이 없다고 예약이 실패하면 안 되므로.

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function init(): boolean {
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@fantastrick.co.kr",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

type Payload = { title: string; body: string; url?: string };

// 등록된 모든 기기에 알림. 실패해도 호출부(예약 생성)를 막지 않는다.
export async function pushToAdmins(payload: Payload): Promise<{ sent: number; gone: number }> {
  const db = getSupabase();
  if (!db || !init()) return { sent: 0, gone: 0 };

  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!subs?.length) return { sent: 0, gone: 0 };

  let sent = 0, gone = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
        JSON.stringify(payload),
      );
      sent++;
      await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      // 404/410 = 그 폰이 알림을 껐거나 앱을 지움 → 죽은 구독은 지운다(계속 쌓이면 매번 실패함)
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await db.from("push_subscriptions").delete().eq("id", s.id);
        gone++;
      } else {
        console.error("[푸시 실패]", code, (e as Error).message);
      }
    }
  }));
  return { sent, gone };
}
