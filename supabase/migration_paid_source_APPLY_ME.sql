-- 입금 확인을 "누가/무엇이" 처리했는지 기록 (2026-07-15)
--
-- [무엇을 하나요]
--  입금 확인이 ① 사장님이 관리자 화면에서 버튼을 눌러 처리한 것인지
--             ② 나중에 붙일 자동매칭 프로그램(bank-auto)이 처리한 것인지
--  구분해서 [입금·환불 › 입출금 내역] 에 표시합니다.
--
-- [적용 방법]
-- Supabase → SQL Editor → 아래 전체 붙여넣고 Run
-- 안전합니다: 칸을 하나 추가할 뿐, 기존 데이터는 건드리지 않습니다.
-- (이 SQL을 실행하기 전의 예약들은 값이 비어 있고, 화면에도 아무 표시가 안 붙습니다)

alter table public.reservations
  add column if not exists paid_source text;   -- 'manual'(사장님 버튼) / 'auto'(자동매칭) / null(이 기능 전 기록)

-- 확인용 (실행하면 paid_source 한 줄이 보이면 성공)
select column_name from information_schema.columns
where table_name = 'reservations' and column_name = 'paid_source';
