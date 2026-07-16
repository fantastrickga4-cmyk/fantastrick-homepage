-- 입금 알림 기록 테이블 (2026-07-16)
--
-- [무엇을 하나요]
--  태블릿이 카카오톡 입금 알림을 잡아서 이 사이트로 바로 보내면, 그 기록을 여기에 쌓습니다.
--  지금까지는 PC에 따로 켜둔 프로그램이 이 일을 했는데, 그러면 PC를 계속 켜둬야 해서
--  홈페이지가 직접 받도록 옮기는 중입니다. (PC·방화벽·Tailscale 전부 필요 없어짐)
--
-- [event_id 가 왜 있나요]
--  같은 알림이 두 번 도착해도(태블릿이 재전송하거나 네트워크가 꼬이면 흔함)
--  입금확인을 두 번 누르면 안 됩니다. event_id 를 유일값(unique)으로 두면
--  두 번째는 데이터베이스가 알아서 거부합니다. → 돈 관련이라 이 안전장치가 중요합니다.
--
-- [적용 방법]
-- Supabase → SQL Editor → 아래 전체 붙여넣고 Run
-- 안전합니다: 새 표를 하나 만들 뿐, 기존 예약·리뷰 데이터는 건드리지 않습니다.

create table if not exists public.deposits (
  id             uuid primary key default gen_random_uuid(),
  -- 같은 알림인지 판별하는 열쇠 (보낸시각 + 알림원문으로 만든 지문)
  event_id       text not null unique,
  depositor_name text not null,              -- 입금한 사람 이름 (알림에서 뽑음)
  amount         int  not null,              -- 입금액(원)
  raw_text       text not null,              -- 알림 원문 그대로 (파싱 실패 시 원인 추적용)
  received_at    timestamptz not null,       -- 태블릿이 알림을 받은 시각
  ingested_at    timestamptz not null default now(), -- 서버가 받은 시각
  -- pending(처리중) / approved(입금확인함) / no_match(맞는 예약 없음)
  -- / dry_run(연습모드라 실제로 안 누름) / failed(오류)
  status         text not null default 'pending',
  matched_reservation_id uuid references public.reservations(id) on delete set null,
  error_message  text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_dep_created on public.deposits (created_at desc);
create index if not exists idx_dep_status  on public.deposits (status);

-- 보안: 예약·리뷰와 같은 방식. 서버(Service Role 키)로만 접근하고 공개 정책은 두지 않는다.
alter table public.deposits enable row level security;

-- 확인용 (실행하면 표가 만들어졌다고 나오면 성공)
select column_name, data_type from information_schema.columns
where table_name = 'deposits' order by ordinal_position;
