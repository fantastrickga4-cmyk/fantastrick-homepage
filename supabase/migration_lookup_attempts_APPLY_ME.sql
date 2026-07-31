-- ============================================================
-- 예약 조회 비밀번호 실패 횟수 기록 (2026-08-01)
--
-- [왜 필요한가]
--   예약 조회·취소는 **전화번호 + 이름 + 4자리 비밀번호**로 한다.
--   4자리는 경우의 수가 1만 개뿐이라, 전화번호를 아는 사람이 계속 찍어보면 언젠가 열린다.
--   지금 있는 방어는 "IP당 분당 20회"뿐이라 하루면 1만 개를 다 시도할 수 있다.
--   → **전화번호 기준으로 실패 횟수를 세서 30번이면 잠근다.**
--
-- [왜 서버 메모리가 아니라 표에 두나]
--   Cloudflare Workers 는 요청마다 다른 인스턴스가 처리할 수 있고 수시로 재시작된다.
--   메모리에 세면 공격자가 여러 인스턴스에 나눠 때리거나 재시작을 기다리면 초기화된다.
--   돈·개인정보가 걸린 문이라 세는 곳은 DB 여야 한다.
--
-- [잠금 해제]
--   · 마지막 실패로부터 24시간이 지나면 저절로 풀린다(손님이 다음날 다시 시도 가능).
--   · 매장에 문의하면 관리자가 [비밀번호 재설정] 을 눌러 즉시 푼다(그때 카운터도 지운다).
--   · 비밀번호가 맞으면 그 즉시 카운터가 지워진다.
--
-- [안전] 새 표 하나만 만든다. 예약·리뷰 데이터는 건드리지 않는다.
-- ============================================================

create table if not exists public.lookup_attempts (
  phone        text primary key,          -- 숫자만 남긴 전화번호(normalizePhone 결과)
  fails        int  not null default 0,
  last_fail_at timestamptz not null default now()
);

create index if not exists idx_lookup_attempts_last on public.lookup_attempts (last_fail_at desc);

-- 보안: 예약·입금 표와 같은 방식. 서버(Service Role 키)로만 접근하고 공개 정책은 두지 않는다.
alter table public.lookup_attempts enable row level security;

-- 확인용
select column_name, data_type from information_schema.columns
 where table_name = 'lookup_attempts' order by ordinal_position;
