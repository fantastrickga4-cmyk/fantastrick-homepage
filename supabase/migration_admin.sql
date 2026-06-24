-- 관리자 기능용 컬럼 추가
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요. (한 번만)

alter table public.reservations
  add column if not exists confirmed_at timestamptz,          -- 예약 확정 시각
  add column if not exists refunded     boolean default false, -- 환불 완료 여부
  add column if not exists source       text default 'online'; -- online / phone(수동등록)

-- status 값: pending(대기) / confirmed(확정) / cancelled(취소) / noshow(노쇼)
-- (status 는 text 라 별도 제약 없이 noshow 저장 가능)
