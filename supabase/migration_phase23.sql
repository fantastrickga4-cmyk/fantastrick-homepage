-- 관리자 2·3차 기능용 테이블 (캘린더는 테이블 불필요)
-- Supabase SQL Editor 에 붙여넣고 Run 하세요. (한 번만)

-- #19 설정 (예약금·시간대·테마 노출 등 키-값 저장)
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- #10 닫은(차단) 시간대. time 이 null 이면 그 날짜 전체 휴무
create table if not exists public.blocked_slots (
  id         uuid primary key default gen_random_uuid(),
  store_id   text,
  theme_id   text,
  date       date not null,
  time       text,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists idx_blocked_date on public.blocked_slots (date);

-- #12 문자 템플릿 (confirm/cancel/reminder)
create table if not exists public.sms_templates (
  type       text primary key,
  body       text not null,
  updated_at timestamptz not null default now()
);

-- #12 문자 발송 내역
create table if not exists public.sms_log (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  body       text not null,
  type       text,
  status     text not null default 'sent',  -- sent / failed / skipped(키없음)
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_smslog_created on public.sms_log (created_at desc);

alter table public.app_settings   enable row level security;
alter table public.blocked_slots  enable row level security;
alter table public.sms_templates  enable row level security;
alter table public.sms_log        enable row level security;
