-- ============================================================
-- 예약에 "사장님 한 줄 메모" 칸 추가 (2026-07-31)
--
-- [왜 새 칸이 필요한가 — 기존 memo 를 쓰면 안 되는 이유]
--   지금 memo 칸은 **시스템이 쓰는 칸**이다.
--     · 기존 사이트에서 복사돼 온 예약: "[연습용] 기존사이트 예약 #1234 · …"
--       → 5분 동기화가 **이 문자열 통째로를 예약을 알아보는 열쇠**로 쓴다.
--         여기에 사람이 메모를 쓰면 열쇠가 깨져서 동기화가 그 예약을 못 알아보고
--         **삭제 후 재생성**한다(예약이 사라졌다 다시 생기는 것처럼 보인다).
--     · 30분 미입금 자동취소: memo 를 "미입금으로 자동 취소"로 덮어쓴다.
--       → 사람이 쓴 메모가 조용히 지워진다.
--
--   그래서 **사람이 쓰는 메모는 별도 칸(admin_note)** 으로 분리한다.
--   이러면 기존 사이트에서 온 예약에도 안심하고 쓸 수 있고, 동기화가 돌아도 안 지워진다.
--
-- [안전] 새 칸 하나만 추가한다. 기존 예약·리뷰 데이터는 건드리지 않는다.
-- ============================================================

alter table public.reservations
  add column if not exists admin_note text;

comment on column public.reservations.admin_note is
  '사장님이 손으로 쓰는 한 줄 메모. memo(시스템/동기화 열쇠)와 절대 섞지 말 것.';

-- 자체 예약에 사람이 써둔 메모가 있으면 새 칸으로 옮겨준다.
-- (기존 사이트 예약의 memo 는 동기화 열쇠라 옮기지 않는다. 시스템 문구도 제외.)
update public.reservations
   set admin_note = memo
 where admin_note is null
   and memo is not null
   and btrim(memo) <> ''
   and (source is null or source <> 'wp-import')
   -- ⚠️ 시스템이 쓴 문구는 옮기지 않는다. 실제 문구가 "30분 내 예약금 미입금으로 자동 취소"처럼
   --    앞뒤에 말이 붙어 있어서 = 비교로는 안 걸러진다(2026-07-31 실제로 5건이 딸려왔다).
   and memo not like '%미입금으로 자동 취소%';

-- 확인용 (실행하면 admin_note 가 목록에 보이면 성공)
select column_name, data_type from information_schema.columns
 where table_name = 'reservations' and column_name in ('memo', 'admin_note')
 order by column_name;
