// 전화번호 정규화: 숫자만 남김 (010-1234-5678 → 01012345678)
export function normalizePhone(raw: string): string {
  return (raw || "").replace(/[^0-9]/g, "");
}

// 한국 휴대폰 번호 형식 검사 (010/011 등 10~11자리)
export function isValidPhone(raw: string): boolean {
  const p = normalizePhone(raw);
  return /^01[016789][0-9]{7,8}$/.test(p);
}

// 보기 좋게 하이픈 삽입 (01012345678 → 010-1234-5678)
export function formatPhone(raw: string): string {
  const p = normalizePhone(raw);
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return raw;
}

// 전화번호 마스킹 (리뷰 공개용: 010-1234-5678 → 010-****-5678)
export function maskPhone(raw: string): string {
  const p = normalizePhone(raw);
  if (p.length < 7) return "비공개";
  const tail = p.slice(-4);
  return `${p.slice(0, 3)}-****-${tail}`;
}

// 제어문자(개행·탭 등 포함) 제거 후 trim — 모든 문자열 입력 정화용
export function sanitizeText(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return (raw || "").replace(/[\x00-\x1F\x7F]/g, "").trim();
}

export function formatDate(d: string): string {
  // "2026-06-25" → "2026.06.25 (수)"
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  const w = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}.${m}.${day} (${w})`;
}

// ─── 예약 오픈 규칙 ─────────────────────────────────────────────
// 예약창은 일주일치만 오픈: 이용일(date)의 N일 전 저녁 9시(KST)에 열린다.
// 예) 7/17 예약은 7/10 21:00(KST)에 오픈.
export const RESERVATION_OPEN_DAYS_AHEAD = 7; // 며칠 전에 오픈되나
export const RESERVATION_OPEN_HOUR_KST = 21; // 오픈 시각(KST, 24h)

// 예약 날짜 상태 판정 (항상 KST 기준 — 서버가 UTC라도 정확).
// date = "YYYY-MM-DD". nowMs 미지정 시 현재 시각.
export function reservationDateState(
  date: string,
  nowMs: number = Date.now(),
): "ok" | "past" | "not_open" | "invalid" {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return "invalid";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const KST_OFFSET = 9 * 60 * 60 * 1000;

  // 오늘(KST) 날짜 문자열 — 지난 날짜 판정용
  const kstNow = new Date(nowMs + KST_OFFSET);
  const todayKst = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, "0")}-${String(kstNow.getUTCDate()).padStart(2, "0")}`;
  if (date < todayKst) return "past";

  // 오픈 시각: (이용일 - N일) 의 (오픈시각 KST) → UTC 로 환산해 비교
  // 21:00 KST = 같은 날 (21-9)=12:00 UTC. Date.UTC 는 일/시 음수도 자동 보정.
  const openAtUtc = Date.UTC(y, mo - 1, d - RESERVATION_OPEN_DAYS_AHEAD, RESERVATION_OPEN_HOUR_KST - 9, 0, 0);
  if (nowMs < openAtUtc) return "not_open";
  return "ok";
}
