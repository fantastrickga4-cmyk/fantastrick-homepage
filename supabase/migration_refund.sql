-- 예약 취소 시 환불 정보 저장용 컬럼 추가
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요. (한 번만)

alter table public.reservations
  add column if not exists refund_bank    text,   -- 환불 은행
  add column if not exists refund_account text,   -- 환불 계좌번호
  add column if not exists refund_holder  text,   -- 예금주
  add column if not exists refund_rate    int,    -- 환불율(100/80/0)
  add column if not exists cancelled_at   timestamptz;  -- 취소 시각
