import crypto from "crypto";
import { getSupabase } from "./supabase";
import { formatDate, normalizePhone } from "./util";
import { THEME_TEMPLATES, TYPE_FALLBACK, type SmsType } from "./sms-templates";

// ─── 솔라피(Solapi) 발송 공통 ──────────────────────────────────────────────
// Cloudflare(서버리스)라 IP 고정이 안 돼, IP 화이트리스트가 필요한 알리고 대신
// API키+시크릿 HMAC 서명 방식인 솔라피를 쓴다(어느 IP에서든 발송 가능).
//   env: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER(발신번호, 숫자),
//        SOLAPI_PFID(카카오 발신프로필ID), SOLAPI_TPL_CONFIRM/CANCEL(알림톡 템플릿ID)
function solapiAuthHeader(): string | null {
  const key = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
  if (!key || !secret) return null;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 솔라피 단건 발송. message 안에 kakaoOptions 를 넣으면 알림톡(+SMS 자동대체)이 된다.
async function solapiSend(message: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const auth = solapiAuthHeader();
  if (!auth) return { ok: false, error: "SOLAPI 키 미설정" };
  try {
    const res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ message }),
    });
    const j = await res.json().catch(() => ({}));
    // 단건 접수 성공 = statusCode "2000"(정상 접수). 실패면 코드/메시지를 로그로.
    const code = String(j.statusCode ?? "");
    const ok = res.ok && (code === "2000" || (!!j.messageId && code.startsWith("2")));
    return { ok, error: ok ? undefined : (j.statusMessage || j.errorMessage || JSON.stringify(j)).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ─── 테스트 데이터 문자 차단 ────────────────────────────────────────────
// 기존 사이트(fantastrick.co.kr)에서 가져온 연습용 예약은 전화번호를 이 대역
// (010-0000-XXXX)으로 바꿔서 넣는다. 실제 손님 번호가 아니다.
//
// 왜 코드로까지 막나:
//   관리자가 입금확인·취소 버튼을 눌러도 문자가 나간다. 연습 데이터에 진짜 번호가
//   섞이면 아무 잘못 없는 손님에게 문자가 가버린다. 번호를 가짜로 바꾸는 것만으로도
//   막히지만, 그 한 겹이 뚫렸을 때(예: 실수로 진짜 번호를 넣었을 때) 대비해
//   발송 길목에서 한 번 더 막는다.
//
// 문자가 나가는 길은 결국 sendSms / sendAlimtalk 둘뿐이라, 여기만 막으면
// 크론·관리자버튼·재발송 어느 경로로도 절대 나가지 않는다.
export const TEST_PHONE_PREFIX = "0100000"; // 010-0000-XXXX

export function isTestPhone(phone: string): boolean {
  return normalizePhone(phone).startsWith(TEST_PHONE_PREFIX);
}

// 문자 템플릿 기본값 (DB에도 테마별 문구에도 없을 때). 치환: {이름}{테마}{날짜}{시간}{인원}{환불율}
// reservation·payment·cancel·admin_cancel 은 기존 사이트 문구를 그대로 옮긴 sms-templates.ts 를 사용.
export const DEFAULT_TEMPLATES: Record<string, string> = {
  ...TYPE_FALLBACK,
  confirm:
    "[판타스트릭] {이름}님, 예약이 확정되었습니다.\n{테마} / {날짜} {시간} / {인원}명\n방문 감사합니다!",
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

// 문자(SMS) 발송. 솔라피 키가 있으면 실제 발송, 없으면 발송 로그만 'skipped' 로 남김.
export async function sendSms(phone: string, body: string, type: string): Promise<{ ok: boolean; skipped?: boolean }> {
  // 연습용 데이터에는 절대 발송하지 않는다 (키가 있어도).
  if (isTestPhone(phone)) {
    await writeLog({ phone, body, type, status: "skipped", channel: "sms", error: "연습용 데이터(가져온 예약) — 발송 차단" });
    return { ok: false, skipped: true };
  }

  const from = process.env.SOLAPI_SENDER;
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET || !from) {
    await writeLog({ phone, body, type, status: "skipped", channel: "sms", error: "SOLAPI 키 미설정(미발송)" });
    return { ok: false, skipped: true };
  }
  const r = await solapiSend({ to: normalizePhone(phone), from: normalizePhone(from), text: body });
  await writeLog({ phone, body, type, status: r.ok ? "sent" : "failed", channel: "sms", error: r.ok ? null : r.error });
  return { ok: r.ok };
}

// 타입 → 카카오 알림톡 템플릿ID. 입금확인/확정=확정 템플릿, 취소=취소 템플릿.
const KAKAO_TPL: Record<string, string | undefined> = {
  payment: process.env.SOLAPI_TPL_CONFIRM,
  confirm: process.env.SOLAPI_TPL_CONFIRM,
  cancel: process.env.SOLAPI_TPL_CANCEL,
  admin_cancel: process.env.SOLAPI_TPL_CANCEL,
};
export function kakaoConfigured(type?: string): boolean {
  const base = !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER && process.env.SOLAPI_PFID);
  if (!type) return base;
  return base && !!KAKAO_TPL[type];
}

// 카카오 알림톡 발송(솔라피). kakaoOptions.disableSms=false 라 알림톡 실패 시 솔라피가 SMS(text)로 자동 대체.
//   미설정이면 null → 호출측이 SMS 폴백. body=SMS 대체 본문, vars=템플릿 치환(#{이름} 등).
export async function sendAlimtalk(
  phone: string, body: string, type: string, vars: Record<string, string>
): Promise<{ ok: boolean } | null> {
  // 연습용 데이터 차단. null 이 아니라 {ok:false} 를 돌려줘야 호출측이 SMS 로 폴백하지 않는다.
  if (isTestPhone(phone)) {
    await writeLog({ phone, body, type, status: "skipped", channel: "alimtalk", error: "연습용 데이터(가져온 예약) — 발송 차단" });
    return { ok: false };
  }

  const from = process.env.SOLAPI_SENDER;
  const pfId = process.env.SOLAPI_PFID;
  const templateId = KAKAO_TPL[type];
  if (!process.env.SOLAPI_API_KEY || !from || !pfId || !templateId) return null; // 미설정 → SMS 폴백

  const r = await solapiSend({
    to: normalizePhone(phone),
    from: normalizePhone(from),
    text: body, // 알림톡 실패 시 이 문구로 SMS 자동 대체
    kakaoOptions: { pfId, templateId, variables: vars, disableSms: false },
  });
  await writeLog({ phone, body, type, status: r.ok ? "sent" : "failed", channel: "alimtalk", error: r.ok ? null : r.error });
  return { ok: r.ok };
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
  // 알림톡 템플릿 치환 변수(#{이름}#{테마}#{날짜}#{시간} — 카카오 등록 템플릿과 일치해야 함)
  const vars = { "#{이름}": r.name, "#{테마}": r.theme_name, "#{날짜}": formatDate(r.date), "#{시간}": r.time };
  // 1순위 알림톡(실패 시 솔라피가 SMS 자동대체). 알림톡 미설정이면 SMS 경로.
  const kakao = await sendAlimtalk(r.phone, body, type, vars);
  if (kakao) return kakao;
  return sendSms(r.phone, body, type);
}
