import { NextRequest, NextResponse } from "next/server";
import { getSupabase, DB_NOT_CONFIGURED } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

// 통짜 백업 — 예약·리뷰·설정·문자문구·휴무를 파일 하나로.
//   Supabase 무료 플랜은 시점 복구가 없어서 실수로 지우면 끝이다.
//   지금 CSV 는 예약·장부뿐이라 리뷰·시간표·문자문구는 백업 수단이 아예 없었음
//   (문자 문구 4종×4테마를 다시 쓰는 건 반나절 일).
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const db = getSupabase();
  if (!db) return NextResponse.json(DB_NOT_CONFIGURED, { status: 503 });

  // 표가 없을 수도 있으니(마이그레이션 전) 하나씩 감싸서 — 하나 없다고 백업 전체가 실패하면 안 됨
  const grab = async (table: string, cols = "*") => {
    const { data, error } = await db.from(table).select(cols);
    return error ? { error: error.message } : data;
  };

  const [reservations, reviews, settings, smsTemplates, blocked, logs] = await Promise.all([
    // ⚠️ pin(손님 비밀번호)·cancel_token 은 백업에서 뺀다 — 파일이 새면 남의 예약을 취소할 수 있음
    grab("reservations", "id, store_id, theme_id, theme_name, date, time, people, name, phone, deposit, deposit_paid, deposit_payer, status, refund_bank, refund_account, refund_holder, refund_rate, refunded, memo, source, created_at, confirmed_at, cancelled_at, paid_at, refunded_at"),
    grab("reviews"),
    grab("app_settings"),
    grab("sms_templates"),
    grab("blocked_slots"),
    grab("reservation_logs"),
  ]);

  const dump = {
    _백업: "판타스트릭 홈페이지 전체 데이터",
    _만든날: new Date().toISOString(),
    _주의: "손님 개인정보(이름·전화)가 들어있어요. 아무 데나 올리지 마세요. 손님 비밀번호(pin)와 취소링크(cancel_token)는 일부러 뺐습니다.",
    reservations, reviews, app_settings: settings, sms_templates: smsTemplates,
    blocked_slots: blocked, reservation_logs: logs,
  };

  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fantastrick_backup_${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
