import type { SupabaseClient } from "@supabase/supabase-js";

// 통짜 백업 만들기 — 수동 다운로드(/api/admin/backup)와 자동 백업(/api/cron/backup)이 같이 씀.
//   Supabase 무료 플랜은 시점 복구가 없어 실수로 지우면 끝이라, 이 JSON 이 유일한 복구 수단이다.
export async function buildBackup(db: SupabaseClient) {
  // 표가 없을 수도 있으니(마이그레이션 전) 하나씩 감싸서 — 하나 없다고 백업 전체가 실패하면 안 됨
  const grab = async (table: string, cols = "*") => {
    const { data, error } = await db.from(table).select(cols);
    return error ? { error: error.message } : data;
  };

  const [reservations, deposits, reviews, settings, smsTemplates, blocked, logs] = await Promise.all([
    // 📌 pin(손님 비밀번호)을 **넣는다** (2026-08-01 결정, 전에는 뺐음).
    //   뺐던 이유는 "파일이 새면 남의 예약을 취소할 수 있다"였는데, 다시 따져보니:
    //    · 이 파일엔 이미 이름·전화·환불계좌가 들어 있다 — 새면 그쪽이 더 큰 피해다.
    //      pin 을 빼도 유출 피해는 거의 안 줄고, 복구 능력만 잃는다.
    //    · pin 이 없으면 복구 후 **손님이 자기 예약을 조회·취소할 수 없다.**
    //      예약을 되살려놨는데 손님이 못 쓰면 복구가 절반만 된 것이다.
    //    · 파일은 비공개 버킷에 있고, 받으려면 관리자 로그인 + 30분짜리 서명 URL 이 필요하다.
    //      그걸 뚫은 사람은 어차피 관리자 화면에서 전부 볼 수 있다.
    //   ⚠️ cancel_token 은 계속 뺀다 — 그건 "가진 사람이 곧 주인"인 열쇠라 성격이 다르다.
    grab("reservations", "id, store_id, theme_id, theme_name, date, time, people, name, phone, pin, deposit, deposit_paid, deposit_payer, status, refund_bank, refund_account, refund_holder, refund_rate, refunded, memo, admin_note, auto_cancelled, source, created_at, confirmed_at, cancelled_at, paid_at, refunded_at, paid_source"),
    // 💰 입금 기록 — 통장에서 읽어온 돈의 흔적이라 예약만큼 중요하다. 전엔 통째로 빠져 있었다.
    grab("deposits"),
    grab("reviews"),
    grab("app_settings"),
    grab("sms_templates"),
    grab("blocked_slots"),
    grab("reservation_logs"),
  ]);

  return {
    _백업: "판타스트릭 홈페이지 전체 데이터",
    _만든날: new Date().toISOString(),
    _주의: "손님 개인정보(이름·전화·환불계좌)와 예약 비밀번호(pin)가 들어있어요. 아무 데나 올리지 마세요. 취소링크(cancel_token)는 일부러 뺐습니다.",
    reservations, deposits, reviews, app_settings: settings, sms_templates: smsTemplates,
    blocked_slots: blocked, reservation_logs: logs,
  };
}

// 파일명용 KST 타임스탬프 (예: 2026-07-26_1230)
export function kstStamp(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
}
