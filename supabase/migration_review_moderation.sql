-- 판타스트릭: 리뷰 승인(모더레이션) + 출처 컬럼 추가
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- (기존 리뷰는 approved 로 유지, 새 예약자 후기는 코드에서 pending 으로 저장됨)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source text;
