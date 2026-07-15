-- 관리자 편의기능 3종 (2026-07-15) — 한 번에 실행하세요
--
-- [무엇을 하나요]
--  ① 돈이 움직인 날짜 기록  → 입출금 내역이 "예약일" 말고 "돈 들어온 날" 기준으로도 정확해집니다
--  ② 입금자명 칸           → 통장에 찍힌 이름(친구·엄마 이름 등)을 따로 적어둘 수 있어요
--  ③ 예약 변경 이력        → 이 예약이 언제 뭐가 바뀌었는지 한 줄씩 남습니다
--
-- [적용 방법]
-- Supabase → SQL Editor → 아래 전체 붙여넣고 Run
-- 안전합니다: 칸을 추가하고 표를 하나 만들 뿐, 기존 데이터는 건드리지 않습니다.
-- (예약금 수정 기능은 SQL이 필요 없어요 — 기존 설정 표를 씁니다)

-- ① 돈이 움직인 날짜  (추천 20번)
alter table public.reservations
  add column if not exists paid_at     timestamptz,   -- 입금 확인 누른 시각
  add column if not exists refunded_at timestamptz;   -- 환불 완료 누른 시각

-- ② 입금자명  (추천 12번)
alter table public.reservations
  add column if not exists deposit_payer text;        -- 통장에 찍힌 입금자 이름

-- ③ 예약 변경 이력  (추천 14번)
--    누가(1인이라 불필요) 말고 "언제 뭐가" 만 남깁니다.
create table if not exists public.reservation_logs (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  action         text not null,     -- 접수 / 입금확인 / 확정 / 취소 / 노쇼 / 환불완료 / 시간변경 / 메모 …
  detail         text,              -- "7/16 13:00 → 7/16 15:00" 같은 상세
  created_at     timestamptz not null default now()
);
create index if not exists idx_reslog_res on public.reservation_logs (reservation_id, created_at desc);
alter table public.reservation_logs enable row level security;

-- 확인용 (실행하면 새 칸·표가 보이면 성공)
select column_name from information_schema.columns
where table_name = 'reservations' and column_name in ('paid_at','refunded_at','deposit_payer');
select count(*) as 변경이력_표_생성됨 from public.reservation_logs;
