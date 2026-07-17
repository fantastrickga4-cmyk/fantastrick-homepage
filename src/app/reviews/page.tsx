import { getSupabase } from "@/lib/supabase";
import { maskPhone } from "@/lib/util";
import ReviewsClient from "./ReviewsClient";
import type { Review } from "./types";

// 30초마다 새로 만든다. 사장님이 후기를 승인하면 늦어도 30초 뒤 손님 화면에 뜬다.
export const revalidate = 30;

type Row = { phone: string | null; [k: string]: unknown };

// 이 페이지는 **서버 컴포넌트**다. 후기 목록을 서버가 먼저 읽어서 완성된 화면을 보내준다.
//
// 왜 이렇게 바꿨나 (2026-07-17):
//   전에는 화면이 뜬 **다음에** 후기를 받아와서 목록이 아래에 끼어들었고,
//   그만큼 **푸터가 아래로 확 밀렸다**(2차 점검 실측: 폰에서 화면 튐 0.3056 — 기준 0.1).
//   손님이 뭘 누르려는 순간 화면이 움직이면 엉뚱한 걸 누르게 된다.
//   예약 페이지(/reserve)에서 쓴 것과 **같은 해결책**이다 — 서버가 미리 그리면 튈 일이 없다.
export default async function ReviewsPage() {
  let reviews: Review[] = [];
  const db = getSupabase();
  if (db) {
    const { data } = await db
      .from("reviews")
      .select("id, theme_id, theme_name, name, phone, rating, body, source, created_at")
      .eq("status", "approved") // 승인된 후기만 공개
      .order("created_at", { ascending: false })
      .limit(100);
    // 개인정보 노출 차단: 전화번호는 서버에서 가려서 내보낸다 (/api/reviews 와 같은 규칙)
    reviews = ((data as Row[] | null) ?? []).map((r) => ({
      ...r,
      phone: r.phone ? maskPhone(r.phone) : "",
    })) as Review[];
  }
  return <ReviewsClient initialReviews={reviews} />;
}
