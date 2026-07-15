-- 폰으로 새 예약 알림 (2026-07-15) — 마지막 SQL이에요
--
-- [무엇을 하나요]
-- 관리자 화면을 안 켜놔도 폰에 "새 예약 왔어요" 알림이 뜨게 합니다.
-- 그러려면 "이 폰에 알림 보내도 돼" 하는 허락(구독 정보)을 저장할 표가 필요해요.
--
-- [왜 필요한가요]
-- 지금 새 예약 알림(🔔)은 관리자 화면을 띄워놔야만 옵니다. 사장님은 현장에 계시죠.
-- 그 사이 30분 자동취소가 먼저 돌아 예약이 날아갑니다.
--
-- [적용 방법]
-- Supabase → SQL Editor → 아래 전체 붙여넣고 Run

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,   -- 폰마다 다른 주소 (같은 폰이 다시 켜도 중복 안 되게 unique)
  p256dh     text not null,          -- 암호화 키
  auth       text not null,          -- 인증 키
  label      text,                   -- "사장님 폰" 같은 메모
  created_at timestamptz not null default now(),
  last_ok_at timestamptz             -- 마지막으로 알림이 잘 간 시각
);
alter table public.push_subscriptions enable row level security;

-- 확인용 (표가 만들어지면 0 이 나옵니다)
select count(*) as 알림_받을_기기_수 from public.push_subscriptions;
