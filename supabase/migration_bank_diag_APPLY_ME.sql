-- ============================================================
-- 태블릿 감시 앱(BankNotify) 진단 기록 표
--
-- 왜 만드나:
--   2026-07-30 태블릿이 입금을 하나도 못 올렸는데, 서버에서 보면
--   "앱이 안 보냈다"와 "보냈는데 실패했다"가 똑같아 보였다. 앱 안에서
--   무슨 일이 벌어지는지 볼 방법이 아예 없어서 하루를 추측으로 보냈다.
--   → 앱이 스스로 상태를 여기에 적게 한다. 그러면 DB만 보고 원인을 짚을 수 있다.
--
-- 무엇이 들어오나 (kind):
--   app_open        앱 화면을 열었다 (앱 자체는 살아있음)
--   svc_connected   화면 감시 서비스가 안드로이드에 붙었다
--   svc_heartbeat   화면 감시 서비스가 살아서 도는 중 (5분마다)
--   svc_event       카카오톡 화면 변화를 받았다 (너무 잦아 60초에 한 번만)
--   manual_dump     사람이 [지금 화면 진단] 버튼을 눌렀다
--   send_result     입금 문구를 서버로 보낸 결과
--
-- ⚠️ 개인 대화는 절대 안 들어온다. 화면 글자는 "개수"만 세고,
--    실제 문구는 "입금/송금"이 든 것만 넣는다(입금 알림과 같은 기준).
-- ============================================================

create table if not exists public.bank_diag (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_diag_created on public.bank_diag (created_at desc);
create index if not exists idx_diag_kind    on public.bank_diag (kind);

-- 보안: deposits 와 동일. 서버(Service Role 키)로만 접근하고 공개 정책은 두지 않는다.
alter table public.bank_diag enable row level security;

-- 확인용
select column_name, data_type from information_schema.columns
where table_name = 'bank_diag' order by ordinal_position;
