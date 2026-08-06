-- ============================================================
-- 도입 문의에 "무엇을 문의하는지" 칸 추가
--
-- 왜:
--   2026-08-06 비즈니스 페이지를 둘로 나누면서(사장님용 /business, 협업용 /business/collab)
--   문의 유형을 손님이 직접 고르게 했다. 사장님이 전화 걸기 전에 무슨 이야기를 할지
--   알고 걸 수 있어야 한다.
--
-- 들어오는 값 (자유 텍스트, 30자 제한):
--   통째로 시공 / 제어기 도입 / 운영 프로그램 / 그 밖에
--   협업 · 브랜드 팝업 / 협업 · 기업 교육 / 협업 · 공공·전시 / 협업 · 그 밖에
--
-- ⚠️ 이 칸이 없어도 문의는 접수된다(서버가 kind 를 빼고 다시 넣는다).
--    적용하면 그때부터 유형이 같이 쌓인다.
-- ============================================================

alter table public.biz_inquiries
  add column if not exists kind text;

-- 확인용 — kind 가 목록에 보이면 성공
select column_name, data_type from information_schema.columns
where table_name = 'biz_inquiries' order by ordinal_position;
