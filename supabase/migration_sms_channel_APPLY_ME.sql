-- ⚠️ 아직 운영 DB에 적용 안 된 마이그레이션 (2026-07-15 발견)
--
-- [무슨 문제였나]
-- 문자 발송 내역(sms_log)에 'channel'(카톡/문자 구분) 칸이 없어서
-- 문자 로그가 통째로 저장되지 않고 있었습니다.
-- 코드가 오류를 조용히 무시하고 있어서 지금까지 아무도 몰랐어요.
-- (원래 migration_alimtalk.sql 로 적용됐어야 했는데 빠졌습니다.)
--
-- [적용 방법]
-- Supabase → SQL Editor → 아래 내용 붙여넣고 Run
-- 안전합니다: 칸을 추가만 하고, 기존 행은 자동으로 'sms'로 채워집니다. 한 번만 실행하면 됩니다.

alter table public.sms_log
  add column if not exists channel text not null default 'sms';  -- sms / alimtalk

-- 확인용 (실행하면 channel 칸이 보이면 성공)
select id, phone, type, status, channel, created_at
from public.sms_log
order by created_at desc
limit 5;
