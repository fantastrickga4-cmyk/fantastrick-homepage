-- 판타스트릭 예약·리뷰 데이터베이스 스키마 (전화번호 기반)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.

-- 1) 예약 테이블 ---------------------------------------------------------
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null,                 -- s1 / s2 / s3
  theme_id      text not null,                 -- firstfoundbride 등
  theme_name    text not null,                 -- 표시용 이름 (저장 시점 기준)
  date          date not null,                 -- 예약 날짜
  time          text not null,                 -- 예약 시간 (예: "19:00")
  people        int  not null check (people between 1 and 8),
  name          text not null,                 -- 예약자 이름
  phone         text not null,                 -- 예약자 전화번호 (식별 기준)
  deposit       int  not null default 0,       -- 예약금(원)
  deposit_paid  boolean not null default false,-- 예약금 결제 여부
  status        text not null default 'pending', -- pending / confirmed / cancelled
  cancel_token  uuid not null default gen_random_uuid(), -- 취소 링크용 토큰
  memo          text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_res_phone on public.reservations (phone);
create index if not exists idx_res_date  on public.reservations (date, time);

-- 같은 매장·날짜·시간 중복 예약 방지 (취소건 제외)
create unique index if not exists uq_res_slot
  on public.reservations (store_id, theme_id, date, time)
  where status <> 'cancelled';

-- 2) 리뷰 테이블 ---------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  theme_id    text not null,
  theme_name  text not null,
  name        text not null,                   -- 작성자 이름(닉네임 가능)
  phone       text not null,                   -- 작성자 전화번호 (식별/중복방지)
  rating      int  not null check (rating between 1 and 5),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_rev_theme on public.reviews (theme_id);

-- 3) 보안(RLS) ----------------------------------------------------------
-- API 라우트에서 Service Role 키로만 접근하므로 RLS 를 켜고 공개 정책은 두지 않는다.
alter table public.reservations enable row level security;
alter table public.reviews      enable row level security;
