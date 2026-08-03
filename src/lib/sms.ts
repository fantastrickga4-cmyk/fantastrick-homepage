import { getSupabase } from "./supabase";
import { formatDate, normalizePhone } from "./util";
import { THEME_TEMPLATES, TYPE_FALLBACK, type SmsType } from "./sms-templates";

// ─── NHN Cloud 발송 공통 (Notification > SMS / KakaoTalk Bizmessage) ──────
// 왜 NHN Cloud 인가 (2026-07-29):
//   Cloudflare Workers 는 나가는 IP 가 매번 바뀐다. 그래서 **발송 서버 IP 를 미리 등록해야 하는
//   업체는 원천적으로 못 쓴다** — 알리고에서 실제로 "인증오류-IP" 를 맞았고, 뿌리오도 문서상
//   IP 등록이 필수다(미등록 시 3003 invalid ip).
//   NHN Cloud 는 appKey + Secret Key 두 개로만 인증해서 어느 IP 에서든 발송된다.
//   (솔라피도 IP 무관이었지만 발신번호 등록이 끝내 안 돼 갈아탐)
//
//   env: NHN_SMS_APPKEY, NHN_SMS_SECRET, NHN_SENDER(발신번호, 숫자만)
//        NHN_ALIMTALK_APPKEY, NHN_ALIMTALK_SECRET, NHN_SENDER_KEY(카카오 발신프로필 senderKey),
//        NHN_TPL_CONFIRM / NHN_TPL_CANCEL(알림톡 템플릿코드)
const SMS_HOST = "https://sms.api.nhncloudservice.com";
const ALIMTALK_HOST = "https://kakaotalk-bizmessage.api.nhncloudservice.com";
// LMS(장문)에는 제목이 필요하다. 손님 화면에 제목으로 뜬다.
const LMS_TITLE = "판타스트릭 예약 안내";

// ⚠️ 솔라피는 본문 길이를 보고 SMS/LMS 를 알아서 골라줬지만 **NHN 은 경로가 갈린다**
//    (/sender/sms 는 90바이트까지, 넘으면 /sender/mms).
//    긴 본문을 sms 로 보내면 잘리거나 실패하므로 여기서 직접 판단한다.
//    통신사 기준대로 한글은 2바이트로 센다(UTF-8 바이트가 아님).
export function smsByteLength(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) < 128 ? 1 : 2;
  return n;
}

type SendResult = { ok: boolean; error?: string };

// NHN 공통 POST — 성공 판정은 header.isSuccessful 하나로 통일(SMS·알림톡 응답 형태가 같다).
async function nhnPost(url: string, secretKey: string, payload: unknown): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8", "X-Secret-Key": secretKey },
      body: JSON.stringify(payload),
    });
    const j = (await res.json().catch(() => ({}))) as {
      header?: { isSuccessful?: boolean; resultCode?: number; resultMessage?: string };
    };
    const ok = res.ok && j?.header?.isSuccessful === true;
    if (ok) return { ok: true };
    const code = j?.header?.resultCode;
    const msg = j?.header?.resultMessage || `HTTP ${res.status}`;
    return { ok: false, error: `${code ?? ""} ${msg}`.trim().slice(0, 200) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// 문자 한 통. 90바이트를 넘으면 자동으로 LMS(mms 경로)로 보낸다.
async function nhnSendSms(to: string, body: string): Promise<SendResult> {
  const appKey = process.env.NHN_SMS_APPKEY;
  const secret = process.env.NHN_SMS_SECRET;
  const from = process.env.NHN_SENDER;
  if (!appKey || !secret || !from) return { ok: false, error: "NHN SMS 키 미설정" };

  const long = smsByteLength(body) > 90;
  const payload: Record<string, unknown> = {
    body,
    sendNo: normalizePhone(from),
    recipientList: [{ recipientNo: normalizePhone(to) }],
  };
  if (long) payload.title = LMS_TITLE;
  return nhnPost(`${SMS_HOST}/sms/v3.0/appKeys/${appKey}/sender/${long ? "mms" : "sms"}`, secret, payload);
}

// 알림톡 한 통. resendParameter 로 "알림톡이 안 가면 문자로 대체발송"을 함께 요청한다
// (솔라피의 kakaoOptions.disableSms=false 와 같은 역할).
//   params 의 키는 **#{} 없이** 넣는다 — 카카오 템플릿의 #{이름} 자리에 params.이름 이 들어간다.
async function nhnSendAlimtalk(
  to: string, templateCode: string, params: Record<string, string>, resendBody: string,
): Promise<SendResult> {
  const appKey = process.env.NHN_ALIMTALK_APPKEY;
  const secret = process.env.NHN_ALIMTALK_SECRET;
  const senderKey = process.env.NHN_SENDER_KEY;
  const from = process.env.NHN_SENDER;
  if (!appKey || !secret || !senderKey) return { ok: false, error: "NHN 알림톡 키 미설정" };

  const long = smsByteLength(resendBody) > 90;
  const recipient: Record<string, unknown> = { recipientNo: normalizePhone(to), templateParameter: params };
  // 발신번호가 있어야 문자 대체발송이 가능하다. 없으면 알림톡만 보낸다(실패 시 호출측이 처리).
  if (from) {
    recipient.resendParameter = {
      isResend: true,
      resendType: long ? "LMS" : "SMS",
      ...(long ? { resendTitle: LMS_TITLE } : {}),
      resendContent: resendBody,
      resendSendNo: normalizePhone(from),
    };
  }
  return nhnPost(`${ALIMTALK_HOST}/alimtalk/v2.1/appkeys/${appKey}/messages`, secret, {
    senderKey,
    templateCode,
    recipientList: [recipient],
  });
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

type Vars = {
  name?: string; theme?: string; date?: string; time?: string; people?: number;
  refundRate?: number;
  deposit?: number;      // 예약금 원금 — 환불액을 문자에 적으려면 필요
  depositPaid?: boolean; // 입금 전이면 "환불 대상 금액 자체가 없음"
};

/**
 * {환불안내} — 취소 문자에서 **손님이 제일 궁금한 한 가지**를 문장으로 만든다: "나 얼마 돌려받지?"
 *
 * 왜 템플릿에 그냥 못 적나: 경우가 넷(미입금·당일 0%·80%·100%)이고, 금액은 테마마다 다르다.
 * 옛 문구는 이걸 전부 생략해서 **100% 손님과 당일취소 0% 손님이 똑같은 문자**를 받았다.
 *
 * 🔴 "계좌를 문자로 보내달라"는 말을 여기서 하지 않는다 — 손님 취소는 취소 화면에서
 *    계좌를 이미 받았다. 또 보내라고 하면 손님이 두 번 일하고, 안 보내면 환불이 안 되는 줄 안다.
 */
function refundNotice(v: Vars): string {
  if (v.depositPaid === false) return "예약금 입금 전이라 환불 대상 금액은 없습니다.";
  const rate = v.refundRate ?? 0;
  const deposit = v.deposit ?? 0;
  const won = (n: number) => n.toLocaleString("ko-KR") + "원";
  if (rate <= 0) {
    return `당일 취소라 환불 규정에 따라 예약금 ${won(deposit)}은 환불되지 않습니다. (환불 예정액 0원)`;
  }
  return (
    `환불 예정액: ${won(Math.round((deposit * rate) / 100))} (예약금 ${won(deposit)}의 ${rate}%)\n` +
    "취소하실 때 입력해 주신 계좌로 최대 24시간 안에 보내드립니다.\n" +
    "따로 문자 주지 않으셔도 됩니다."
  );
}

export function renderTemplate(body: string, v: Vars): string {
  return body
    .replaceAll("{이름}", v.name ?? "")
    .replaceAll("{테마}", v.theme ?? "")
    .replaceAll("{날짜}", v.date ? formatDate(v.date) : "")
    .replaceAll("{시간}", v.time ?? "")
    .replaceAll("{인원}", v.people != null ? String(v.people) : "")
    .replaceAll("{환불율}", v.refundRate != null ? String(v.refundRate) : "")
    .replaceAll("{예약금}", v.deposit != null ? v.deposit.toLocaleString("ko-KR") + "원" : "")
    .replaceAll("{환불액}", v.deposit != null && v.refundRate != null
      ? Math.round((v.deposit * v.refundRate) / 100).toLocaleString("ko-KR") + "원" : "")
    .replaceAll("{환불안내}", refundNotice(v));
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

  if (!process.env.NHN_SMS_APPKEY || !process.env.NHN_SMS_SECRET || !process.env.NHN_SENDER) {
    await writeLog({ phone, body, type, status: "skipped", channel: "sms", error: "NHN SMS 키 미설정(미발송)" });
    return { ok: false, skipped: true };
  }
  const r = await nhnSendSms(phone, body);
  await writeLog({ phone, body, type, status: r.ok ? "sent" : "failed", channel: "sms", error: r.ok ? null : r.error });
  return { ok: r.ok };
}

// 타입 → 카카오 알림톡 템플릿코드. 입금확인/확정=확정 템플릿, 취소=취소 템플릿.
// ⚠️ process.env 를 모듈 로드 시점에 한 번만 읽으면 워커에서 값이 늦게 붙는 경우 undefined 로 굳는다.
//    함수로 감싸 호출할 때마다 읽는다.
function kakaoTemplateCode(type: string): string | undefined {
  const confirm = process.env.NHN_TPL_CONFIRM;
  const cancel = process.env.NHN_TPL_CANCEL;
  return { payment: confirm, confirm, cancel, admin_cancel: cancel }[type];
}
// ⚠️ 발신번호(NHN_SENDER)는 여기 조건에 넣지 않는다.
//    알림톡 자체는 카카오 채널(senderKey)로 나가므로 발신번호가 없어도 발송된다.
//    발신번호는 "알림톡이 실패했을 때 문자로 대신 보내는" 용도로만 쓰인다(nhnSendAlimtalk 의 resendParameter).
//    발신번호 등록 심사는 오래 걸리는데, 그동안 카카오 심사가 먼저 끝나면
//    알림톡만이라도 나가는 편이 낫다 — 여기에 발신번호를 넣어두면 그마저 막힌다.
export function kakaoConfigured(type?: string): boolean {
  const base = !!(
    process.env.NHN_ALIMTALK_APPKEY &&
    process.env.NHN_ALIMTALK_SECRET &&
    process.env.NHN_SENDER_KEY
  );
  if (!type) return base;
  return base && !!kakaoTemplateCode(type);
}

// 카카오 알림톡 발송(NHN Cloud). resendParameter 로 알림톡 실패 시 문자 대체발송까지 함께 요청한다.
//   미설정이면 null → 호출측이 SMS 폴백. body=문자 대체 본문, vars=템플릿 치환값(키는 #{} 없이).
export async function sendAlimtalk(
  phone: string, body: string, type: string, vars: Record<string, string>
): Promise<{ ok: boolean } | null> {
  // 연습용 데이터 차단. null 이 아니라 {ok:false} 를 돌려줘야 호출측이 SMS 로 폴백하지 않는다.
  if (isTestPhone(phone)) {
    await writeLog({ phone, body, type, status: "skipped", channel: "alimtalk", error: "연습용 데이터(가져온 예약) — 발송 차단" });
    return { ok: false };
  }

  const templateCode = kakaoTemplateCode(type);
  if (!kakaoConfigured() || !templateCode) return null; // 미설정 → SMS 폴백

  const r = await nhnSendAlimtalk(phone, templateCode, vars, body);
  await writeLog({ phone, body, type, status: r.ok ? "sent" : "failed", channel: "alimtalk", error: r.ok ? null : r.error });
  return { ok: r.ok };
}

// 예약 1건에 대해 특정 타입 문자 발송 (템플릿 렌더 포함)
// theme_id 가 있으면 그 테마의 기존 문구를 사용(사자의 서는 인스타·길안내가 더 붙는 등 테마마다 다름).
export async function sendReservationSms(
  type: SmsType,
  r: {
    name: string; phone: string; theme_name: string; date: string; time: string; people: number;
    refund_rate?: number | null; theme_id?: string;
    // 취소 문자에 "얼마 돌려받는지"를 적으려면 원금과 입금 여부가 필요하다.
    deposit?: number | null; deposit_paid?: boolean | null;
  }
) {
  const tpl = await getTemplate(type, r.theme_id);
  const body = renderTemplate(tpl, {
    name: r.name, theme: r.theme_name, date: r.date, time: r.time, people: r.people,
    refundRate: r.refund_rate ?? undefined,
    deposit: r.deposit ?? undefined,
    depositPaid: r.deposit_paid ?? undefined,
  });
  // 알림톡 템플릿 치환값. 카카오 템플릿 본문의 #{이름}#{테마}#{날짜}#{시간} 자리에 들어간다.
  // ⚠️ NHN 은 키를 **#{} 없이** 받는다(솔라피는 "#{이름}" 형태였음). 여기서 형태가 어긋나면
  //    치환이 안 된 채 "#{이름}님" 그대로 손님에게 나간다.
  const vars = { 이름: r.name, 테마: r.theme_name, 날짜: formatDate(r.date), 시간: r.time };
  // 1순위 알림톡(실패 시 NHN 이 문자로 대체발송). 알림톡 미설정이면 SMS 경로.
  const kakao = await sendAlimtalk(r.phone, body, type, vars);
  if (kakao) return kakao;
  return sendSms(r.phone, body, type);
}
