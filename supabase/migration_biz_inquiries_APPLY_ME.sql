-- ============================================================
-- 비즈니스(B2B) 도입 문의 표
--
-- 왜 만드나:
--   /business 페이지의 [도입 문의하기] 폼이 지금까지 아무 데로도 안 갔다
--   (보내면 "메일 주세요" 안내만 떴다). 사장님이 관리자 화면에서 문의를
--   쌓아 보고 처리하기로 해서(2026-08-06), 그 그릇을 만든다.
--
-- 무엇이 들어오나:
--   store_name  매장명 (필수)
--   phone       연락처 (필수, 숫자만 저장 — 예약과 같은 방식)
--   rooms       방 개수 (선택, 숫자)
--   area        지역 (선택)
--   status      new(새 문의) → contacted(연락함) → done(끝) / dropped(안 함)
--   admin_note  사장님 메모 한 줄
--
-- ⚠️ 예약(reservations)과 FK로 잇지 않는다. 문의한 사람은 아직 손님이 아니고,
--    두 표 사이에 FK가 늘면 PostgREST embed 가 ambiguous 로 빈 배열을 준다.
-- ============================================================

create table if not exists public.biz_inquiries (
  id           uuid primary key default gen_random_uuid(),
  store_name   text not null,
  phone        text not null,
  rooms        int,
  area         text,
  status       text not null default 'new',
  admin_note   text,
  created_at   timestamptz not null default now(),
  contacted_at timestamptz
);

-- 목록은 항상 최신순으로 본다
create index if not exists idx_biz_inq_created on public.biz_inquiries (created_at desc);
-- 관리자 뱃지("아직 연락 안 한 문의 N건")가 매번 세는 조건
create index if not exists idx_biz_inq_status  on public.biz_inquiries (status);

-- 보안: 예약·입금 표와 동일하게 서버(Service Role 키)로만 접근한다.
-- 공개 정책을 두지 않으므로 손님 브라우저에서는 직접 읽을 수 없다.
alter table public.biz_inquiries enable row level security;

-- 확인용 — 아래 결과에 9개 칸이 보이면 성공
select column_name, data_type from information_schema.columns
where table_name = 'biz_inquiries' order by ordinal_position;
