-- 카카오 알림톡 도입 — 발송내역에 채널(카톡/문자) 구분 컬럼 추가
-- Supabase SQL Editor 에 붙여넣고 Run 하세요. (한 번만, 안전: 기존 행은 'sms'로 채워짐)

alter table public.sms_log
  add column if not exists channel text not null default 'sms';  -- sms / alimtalk
