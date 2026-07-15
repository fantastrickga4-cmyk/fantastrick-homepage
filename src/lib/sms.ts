import { getSupabase } from "./supabase";
import { formatDate } from "./util";
import { THEME_TEMPLATES, TYPE_FALLBACK, type SmsType } from "./sms-templates";

// 문자 템플릿 기본값 (DB에도 테마별 문구에도 없을 때). 치환: {이름}{테마}{날짜}{시간}{인원}{환불율}
// reservation·payment·cancel·admin_cancel 은 기존 사이트 문구를 그대로 옮긴 sms-templates.ts 를 사용.
export const DEFAULT_TEMPLATES: Record<string, string> = {
  ...TYPE_FALLBACK,
  confirm:
    "[판타스트릭] {이름}님, 예약이 확정되었습니다.\n{테마} / {날짜} {시간} / {인원}명\n방문 감사합니다!",
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

// 테마마다 문구가 달라야 하는 종류 (기존 사이트와 동일)
//   reservation — 테마마다 예약금이 다름 (3만/2.5만/12만/6.3만)
//   payment     — 사자의 서만 인스타·길안내가 더 붙음
// 이 두 종류는 "공통 문구" 개념을 두지 않는다. 공통 문구를 허용하면 그게 테마별 문구를 덮어써서
// 사자의 서 손님에게 태초의 신부 예약금(3만)이 안내되는 사고가 난다.
export const PER_THEME_TYPES = new Set(["reservation", "payment"]);

// 문구 우선순위
//   테마별 종류 : 관리자가 저장한 그 테마 문구 > 기존 사이트의 그 테마 문구 > 기본값
//   공통 종류   : 관리자가 저장한 공통 문구 > 기본값(=기존 사이트 문구, 4테마 동일)
export async function getTemplate(type: string, themeId?: string): Promise<string> {
  const db = getSupabase();
  const perTheme = PER_THEME_TYPES.has(type) && !!themeId;
  if (db) {
    const { data } = await db
      .from("sms_templates")
      .select("body")
      .eq("type", type)
      .eq("theme_id", perTheme ? themeId! : "")
      .maybeSingle();
    if (data?.body) return data.body as string;
  }
  if (perTheme) {
    const t = THEME_TEMPLATES[`${type}:${themeId}`];
    if (t) return t;
  }
  return DEFAULT_TEMPLATES[type] || "";
}

// 발송 로그 기록. 실패해도 발송 자체는 막지 않되, 조용히 삼키지 말고 서버 로그에 남긴다.
// (channel 컬럼 마이그레이션 누락으로 로그가 통째로 안 쌓이는 걸 오래 못 본 적이 있음)
async function writeLog(row: Record<string, unknown>) {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from("sms_log").insert(row);
  if (error) console.error("[sms_log 기록 실패]", error.message, row.type);
}

// 문자 발송. 알리고(ALIGO) 키가 있으면 실제 발송, 없으면 발송 로그만 'skipped' 로 남김.
export async function sendSms(phone: string, body: string, type: string): Promise<{ ok: boolean; skipped?: boolean }> {
  const key = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;

  if (!key || !userId || !sender) {
    await writeLog({ phone, body, type, status: "skipped", channel: "sms", error: "ALIGO 키 미설정(미발송)" });
    return { ok: false, skipped: true };
  }
  try {
    const form = new URLSearchParams({ key, user_id: userId, sender, receiver: phone, msg: body });
    const res = await fetch("https://apis.aligo.in/send/", { method: "POST", body: form });
    const j = await res.json();
    const ok = String(j.result_code) === "1";
    await writeLog({ phone, body, type, status: ok ? "sent" : "failed", channel: "sms", error: ok ? null : String(j.message || "") });
    return { ok };
  } catch (e) {
    await writeLog({ phone, body, type, status: "failed", channel: "sms", error: String(e) });
    return { ok: false };
  }
}

// 알림톡 설정 완료 여부 (senderkey + 해당 타입 템플릿코드 존재)
const KAKAO_TPL: Record<string, string | undefined> = {
  confirm: process.env.ALIGO_KAKAO_TPL_CONFIRM,
  cancel: process.env.ALIGO_KAKAO_TPL_CANCEL,
  reminder: process.env.ALIGO_KAKAO_TPL_REMINDER,
};
export function kakaoConfigured(type?: string): boolean {
  const base = !!(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER && process.env.ALIGO_KAKAO_SENDERKEY);
  if (!type) return base;
  return base && !!KAKAO_TPL[type];
}

// 알림톡 발송 토큰 (30초 유효). 실패 시 null.
async function getKakaoToken(apikey: string, userid: string): Promise<string | null> {
  try {
    const form = new URLSearchParams({ apikey, userid });
    const res = await fetch("https://kakaoapi.aligo.in/akv10/token/create/30/s/", { method: "POST", body: form });
    const j = await res.json();
    return String(j.code) === "0" && j.token ? String(j.token) : null;
  } catch {
    return null;
  }
}

// 카카오 알림톡 발송. 실패 시 알리고가 자동으로 SMS 대체발송(failover). 미설정이면 null → 호출측이 SMS 폴백.
export async function sendAlimtalk(phone: string, body: string, type: string): Promise<{ ok: boolean } | null> {
  const apikey = process.env.ALIGO_API_KEY;
  const userid = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;
  const senderkey = process.env.ALIGO_KAKAO_SENDERKEY;
  const tpl_code = KAKAO_TPL[type];
  if (!apikey || !userid || !sender || !senderkey || !tpl_code) return null; // 미설정 → SMS 폴백

  const token = await getKakaoToken(apikey, userid);
  if (!token) return null; // 토큰 실패 → SMS 폴백
  try {
    const form = new URLSearchParams({
      apikey, userid, token, senderkey, tpl_code, sender,
      receiver_1: phone, subject_1: "판타스트릭 예약 안내", message_1: body,
      failover: "Y", fsubject_1: "판타스트릭", fmessage_1: body, // 알림톡 실패 시 SMS 자동대체
    });
    const res = await fetch("https://kakaoapi.aligo.in/akv10/alimtalk/send/", { method: "POST", body: form });
    const j = await res.json();
    const ok = String(j.code) === "0";
    await writeLog({ phone, body, type, status: ok ? "sent" : "failed", channel: "alimtalk", error: ok ? null : String(j.message || "") });
    return { ok };
  } catch (e) {
    await writeLog({ phone, body, type, status: "failed", channel: "alimtalk", error: String(e) });
    return { ok: false };
  }
}

// 예약 1건에 대해 특정 타입 문자 발송 (템플릿 렌더 포함)
// theme_id 가 있으면 그 테마의 기존 문구를 사용(사자의 서는 인스타·길안내가 더 붙는 등 테마마다 다름).
export async function sendReservationSms(
  type: SmsType,
  r: { name: string; phone: string; theme_name: string; date: string; time: string; people: number; refund_rate?: number | null; theme_id?: string }
) {
  const tpl = await getTemplate(type, r.theme_id);
  const body = renderTemplate(tpl, {
    name: r.name, theme: r.theme_name, date: r.date, time: r.time, people: r.people,
    refundRate: r.refund_rate ?? undefined,
  });
  // 1순위 알림톡(실패 시 알리고가 SMS 자동대체). 알림톡 미설정이면 기존 SMS 경로.
  const kakao = await sendAlimtalk(r.phone, body, type);
  if (kakao) return kakao;
  return sendSms(r.phone, body, type);
}
