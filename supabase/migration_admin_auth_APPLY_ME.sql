-- ============================================================
-- 관리자 로그인 보안 (2026-08-02)
--   ① 비밀번호 틀린 횟수를 세서 잠근다
--   ② 로그인할 때마다 새 열쇠를 만들어 여기 적어둔다 (로그아웃·만료가 실제로 동작하게)
--
-- [왜 필요한가]
--  ① 지금은 비밀번호를 **몇 번이든 찍어볼 수 있다.** 코드에 "IP당 5회/5분" 제한이 있지만
--     서버 메모리에 세는 방식이라, Cloudflare 가 요청마다 다른 인스턴스로 보내고 수시로
--     재시작하면서 숫자가 쌓이질 않는다(7번 연속 실패해도 안 막히는 것을 실측).
--  ② 지금 세션 쿠키는 **비밀번호로 만든 고정값**이고 서버는 만료를 검사하지 않는다.
--     그래서 12시간 만료는 브라우저 쪽 약속일 뿐이고, [로그아웃]도 서버에선 아무 일도 안 한다.
--     쿠키를 한 번 확보하면 비밀번호를 바꾸기 전까지 계속 관리자다.
--
--  관리자 화면 안에는 전 고객의 이름·전화·예약·환불계좌가 있다. 손님 PIN 보다 중요한 문이다.
--
-- [안전] 새 표 두 개만 만든다. 예약·입금 데이터는 건드리지 않는다.
-- ============================================================

-- ① 로그인 실패 횟수 (IP 기준)
create table if not exists public.admin_login_attempts (
  ip           text primary key,
  fails        int  not null default 0,
  last_fail_at timestamptz not null default now()
);

-- ② 관리자 세션 — 로그인 1회 = 1줄. 로그아웃하면 그 줄을 지운다.
create table if not exists public.admin_sessions (
  token      text primary key,           -- 무작위 열쇠(쿠키에 담기는 값)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,       -- 이 시각이 지나면 서버가 거부한다
  ip         text,
  user_agent text
);

create index if not exists idx_admin_sessions_exp on public.admin_sessions (expires_at);

-- 보안: 예약·입금 표와 같은 방식. 서버(Service Role 키)로만 접근하고 공개 정책은 두지 않는다.
alter table public.admin_login_attempts enable row level security;
alter table public.admin_sessions       enable row level security;

-- 확인용
select table_name from information_schema.tables
 where table_schema = 'public' and table_name in ('admin_login_attempts', 'admin_sessions')
 order by table_name;
