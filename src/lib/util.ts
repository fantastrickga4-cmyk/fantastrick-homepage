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

export function formatDate(d: string): string {
  // "2026-06-25" → "2026.06.25 (수)"
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  const w = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}.${m}.${day} (${w})`;
}
