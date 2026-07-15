-- 테마별 문자 문구 편집 (2026-07-15)
--
-- [무엇을 하나요]
-- 지금은 문자 문구를 "종류당 1개"만 저장할 수 있어요(type 이 기본키).
-- 그런데 기존 사이트는 문구가 테마마다 달라요:
--   · 예약대기(계좌안내) → 테마마다 예약금이 다름 (3만/2.5만/12만/6.3만)
--   · 입금확정        → 사자의 서만 인스타 링크 + 길안내가 더 붙음
-- 그래서 "종류 + 테마" 조합으로 저장할 수 있게 칸을 하나 늘립니다.
--
-- [적용 방법]
-- Supabase → SQL Editor → 아래 전체 붙여넣고 Run
-- 안전합니다: theme_id 칸을 추가하고 기본키를 (type, theme_id) 로 바꿉니다.
--   · theme_id 가 빈 문자('') = 모든 테마 공통 문구 (기존 문구는 자동으로 여기에 들어감)
--   · theme_id 에 테마id = 그 테마 전용 문구
-- 지금 저장된 문구는 0건이라 사라질 내용도 없습니다.

-- 1) 테마 칸 추가 (빈 문자 = 공통)
alter table public.sms_templates
  add column if not exists theme_id text not null default '';

-- 2) 기본키를 (type) → (type, theme_id) 로 교체
alter table public.sms_templates drop constraint if exists sms_templates_pkey;
alter table public.sms_templates add primary key (type, theme_id);

-- 확인용 (실행하면 theme_id 칸이 보이면 성공)
select type, theme_id, left(body, 30) as 문구앞부분, updated_at
from public.sms_templates
order by type, theme_id;
