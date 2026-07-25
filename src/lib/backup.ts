import type { SupabaseClient } from "@supabase/supabase-js";

// 통짜 백업 만들기 — 수동 다운로드(/api/admin/backup)와 자동 백업(/api/cron/backup)이 같이 씀.
//   Supabase 무료 플랜은 시점 복구가 없어 실수로 지우면 끝이라, 이 JSON 이 유일한 복구 수단이다.
export async function buildBackup(db: SupabaseClient) {
  // 표가 없을 수도 있으니(마이그레이션 전) 하나씩 감싸서 — 하나 없다고 백업 전체가 실패하면 안 됨
  const grab = async (table: string, cols = "*") => {
    const { data, error } = await db.from(table).select(cols);
    return error ? { error: error.message } : data;
  };

  const [reservations, reviews, settings, smsTemplates, blocked, logs] = await Promise.all([
    // ⚠️ pin(손님 비밀번호)·cancel_token 은 백업에서 뺀다 — 파일이 새면 남의 예약을 취소할 수 있음
    grab("reservations", "id, store_id, theme_id, theme_name, date, time, people, name, phone, deposit, deposit_paid, deposit_payer, status, refund_bank, refund_account, refund_holder, refund_rate, refunded, memo, source, created_at, confirmed_at, cancelled_at, paid_at, refunded_at, paid_source"),
    grab("reviews"),
    grab("app_settings"),
    grab("sms_templates"),
    grab("blocked_slots"),
    grab("reservation_logs"),
  ]);

  return {
    _백업: "판타스트릭 홈페이지 전체 데이터",
    _만든날: new Date().toISOString(),
    _주의: "손님 개인정보(이름·전화)가 들어있어요. 아무 데나 올리지 마세요. 손님 비밀번호(pin)와 취소링크(cancel_token)는 일부러 뺐습니다.",
    reservations, reviews, app_settings: settings, sms_templates: smsTemplates,
    blocked_slots: blocked, reservation_logs: logs,
  };
}

// 파일명용 KST 타임스탬프 (예: 2026-07-26_1230)
export function kstStamp(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
}
