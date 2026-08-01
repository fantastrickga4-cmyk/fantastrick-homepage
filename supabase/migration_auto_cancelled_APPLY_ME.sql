-- ============================================================
-- "자동취소된 예약" 표시를 memo 에서 별도 칸으로 분리 (2026-08-01)
--
-- [왜]
--   30분 미입금 자동취소가 지금은 memo 를 "미입금으로 자동 취소"로 **덮어쓴다.**
--   그런데 기존 사이트에서 가져온 예약은 memo 통째로가 **가져오기 열쇠(#예약번호)** 라,
--   덮어쓰면 같은 예약을 또 가져오거나 못 알아보는 사고가 난다.
--   그래서 어제(07-31)는 그 예약들을 아예 자동취소 대상에서 뺐는데,
--   이제 **모든 처리는 우리 사이트가 주인**이 되므로 자동취소도 전부 적용해야 한다.
--   → 취소 사유를 memo 가 아니라 이 칸에 적는다. memo 는 손대지 않는다.
--
-- [안전] 새 칸 하나 + 기존 기록 표시만 채운다. 예약 자체는 바뀌지 않는다.
-- ============================================================

alter table public.reservations
  add column if not exists auto_cancelled boolean not null default false;

comment on column public.reservations.auto_cancelled is
  '30분(자정 유예 10:30) 미입금으로 시스템이 취소한 건. memo 는 건드리지 않는다.';

-- 지금까지 memo 로 표시돼 있던 자동취소 건을 새 칸으로 옮겨 적는다(memo 는 그대로 둔다).
update public.reservations
   set auto_cancelled = true
 where status = 'cancelled'
   and coalesce(memo, '') like '%자동 취소%'
   and auto_cancelled = false;

create index if not exists idx_res_auto_cancelled
  on public.reservations (auto_cancelled) where auto_cancelled;

-- 확인용
select count(*) filter (where auto_cancelled) as 자동취소_건수,
       count(*) filter (where status = 'cancelled') as 전체_취소건수
  from public.reservations;
