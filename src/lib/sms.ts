import { getSupabase } from "./supabase";
import { formatDate } from "./util";

// 문자 템플릿 기본값 (DB에 없으면 사용). 치환: {이름}{테마}{날짜}{시간}{인원}{환불율}
export const DEFAULT_TEMPLATES: Record<string, string> = {
  confirm:
    "[판타스트릭] {이름}님, 예약이 확정되었습니다.\n{테마} / {날짜} {시간} / {인원}명\n방문 감사합니다!",
  cancel:
    "[판타스트릭] {이름}님, 예약이 취소되었습니다.\n{테마} / {날짜} {시간}\n환불 {환불율}% 안내드립니다.",
  reminder:
    "[판타스트릭] {이름}님, 내일 예약 안내드립니다.\n{테마} / {날짜} {시간} / {인원}명\n늦지 않게 방문해 주세요!",
};

type Vars = { name?: string; theme?: string; date?: string; time?: string; people?: number; refundRate?: number };

export function renderTemplate(body: string, v: Vars): string {
  return body
    .replaceAll("{이름}", v.name ?? "")
    .replaceAll("{테마}", v.theme ?? "")
    .replaceAll("{날짜}", v.date ? formatDate(v.date) : "")
    .replaceAll("{시간}", v.time ?? "")
    .replaceAll("{인원}", v.people != null ? String(v.people) : "")
    .replaceAll("{환불율}", v.refundRate != null ? String(v.refundRate) : "");
}

export async function getTemplate(type: string): Promise<string> {
  const db = getSupabase();
  if (db) {
    const { data } = await db.from("sms_templates").select("body").eq("type", type).single();
    if (data?.body) return data.body as string;
  }
  return DEFAULT_TEMPLATES[type] || "";
}

// 문자 발송. 알리고(ALIGO) 키가 있으면 실제 발송, 없으면 발송 로그만 'skipped' 로 남김.
export async function sendSms(phone: string, body: string, type: string): Promise<{ ok: boolean; skipped?: boolean }> {
  const db = getSupabase();
  const key = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;

  if (!key || !userId || !sender) {
    await db?.from("sms_log").insert({ phone, body, type, status: "skipped", error: "ALIGO 키 미설정(미발송)" });
    return { ok: false, skipped: true };
  }
  try {
    const form = new URLSearchParams({ key, user_id: userId, sender, receiver: phone, msg: body });
    const res = await fetch("https://apis.aligo.in/send/", { method: "POST", body: form });
    const j = await res.json();
    const ok = String(j.result_code) === "1";
    await db?.from("sms_log").insert({ phone, body, type, status: ok ? "sent" : "failed", error: ok ? null : String(j.message || "") });
    return { ok };
  } catch (e) {
    await db?.from("sms_log").insert({ phone, body, type, status: "failed", error: String(e) });
    return { ok: false };
  }
}

// 예약 1건에 대해 특정 타입 문자 발송 (템플릿 렌더 포함)
export async function sendReservationSms(
  type: "confirm" | "cancel" | "reminder",
  r: { name: string; phone: string; theme_name: string; date: string; time: string; people: number; refund_rate?: number | null }
) {
  const tpl = await getTemplate(type);
  const body = renderTemplate(tpl, {
    name: r.name, theme: r.theme_name, date: r.date, time: r.time, people: r.people,
    refundRate: r.refund_rate ?? undefined,
  });
  return sendSms(r.phone, body, type);
}
