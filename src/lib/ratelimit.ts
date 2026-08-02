import { NextRequest } from "next/server";

// ─── 인메모리 레이트 리미터 ─────────────────────────────────────────
// 의존성 없이 순수 JS로 동작하는 슬라이딩 윈도우 방식.
// ⚠️ 인스턴스별 best-effort — 서버리스(Vercel)에서는 인스턴스가 여러 개로
//    늘어날 수 있어 완벽하지 않다. 분산(대규모) 공격 방어는
//    Vercel Firewall / BotID 같은 엣지단 방어를 함께 쓰는 걸 권장한다.

type Hit = number[]; // 최근 요청들의 타임스탬프(ms)

const store = new Map<string, Hit>();
const MAX_KEYS = 10000; // 이 이상 쌓이면 만료 항목을 청소(메모리 누수 방지)

// 만료된(모든 타임스탬프가 windowMs 밖) 항목을 훑어서 제거
function sweep(now: number) {
  for (const [key, hits] of store) {
    // 가장 최근 타임스탬프가 1시간보다 오래됐으면 통째로 제거
    if (hits.length === 0 || now - hits[hits.length - 1] > 60 * 60 * 1000) {
      store.delete(key);
    }
  }
}

// key(보통 "라우트:IP") 기준으로 windowMs 안에서 limit 회까지 허용.
// 허용되면 true, 초과하면 false.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  if (store.size > MAX_KEYS) sweep(now);

  const hits = store.get(key) || [];
  // 윈도우 밖의 오래된 타임스탬프 제거(슬라이딩 윈도우)
  const fresh = hits.filter((t) => now - t < windowMs);

  if (fresh.length >= limit) {
    store.set(key, fresh); // 정리된 상태 유지
    return false;
  }

  fresh.push(now);
  store.set(key, fresh);
  return true;
}

// 요청에서 클라이언트 IP 추출.
// x-forwarded-for 의 첫 IP → x-real-ip → "unknown"
export function getClientIp(req: NextRequest): string {
  // 🔴 Cloudflare 에서는 **cf-connecting-ip 가 진짜 손님 IP** 다.
  //   x-forwarded-for 를 먼저 보다가 `::1`(내부 주소)이 잡히는 것을 실측했다(2026-08-02).
  //   그 값으로 관리자 로그인 잠금을 걸면 **모든 사람이 한 IP로 묶여**,
  //   아무나 5번 틀리는 것만으로 사장님을 10분씩 잠가버릴 수 있다.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // 내부 루프백은 손님 IP 가 아니다 — 건너뛰고 진짜 주소를 찾는다.
    const first = xff.split(",").map((s) => s.trim()).find((s) => s && s !== "::1" && s !== "127.0.0.1");
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real?.trim() && real.trim() !== "::1") return real.trim();
  return "unknown";
}
