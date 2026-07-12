-- 판타스트릭: 예약 비밀번호(숫자 4자리) 컬럼 추가
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pin text;
